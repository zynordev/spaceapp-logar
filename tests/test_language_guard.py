"""CI language guard: no diagnosis or medication wording in user-facing text.

Product limit: the system never diagnoses and never suggests a medication or a
dose. This scans action cards, rule explanation/template text, scenario texts
and the frontend's user-facing strings. Explicit disclaimers ("teşhis koymaz",
"no diagnosis", ...) are allow-listed; everything else that matches a
forbidden term fails the test.
"""

import ast
import re
from pathlib import Path

import pytest

from spaceapp_logar.rules.action_cards import all_action_cards
from spaceapp_logar.services.demo_scenarios import SCENARIOS

ROOT = Path(__file__).resolve().parents[1]
BACKEND_TEXT_SOURCES = (
    *sorted((ROOT / "src" / "spaceapp_logar" / "rules").glob("*.py")),
    ROOT / "src" / "spaceapp_logar" / "services" / "demo_scenarios.py",
)
FRONTEND_SRC = ROOT / "frontend" / "src"

# Forbidden terms (Turkish + English). Case-insensitive.
FORBIDDEN = re.compile(
    r"""
    teşhis\s+koy | tanı\s+koy | teşhis\s+konul | tanı\s+konul | tanınız | teşhisiniz
    | ilaç\s+ver | ilaç\s+al | ilaç\s+kullan | ilacı | ilacın | ilaçlar\b | ilaç\s+dozu
    | dozunu | doz\s+ayar | dozu\s+(?:artır|azalt|ayarla)
    | \btablet | aspirin | antibiyotik | parasetamol | ibuprofen | reçete
    | \d\s?mg\b(?!\s*/)
    | \bdiagnos(?:e|es|ed|ing|is)\b | \bprescri(?:be|bes|bed|ption)\b
    | \bdosage\b | \bmedication\b | \bdrug\b | \bantibiotics?\b | \bacetaminophen\b
    | \bpainkillers?\b | \btake\s+\d+\s?(?:mg|pills?|tablets?)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Explicit disclaimers: removed before matching.
ALLOWED = re.compile(
    r"""
    teşhis\s+koymaz | teşhis\s+konmaz | tanı\s+koymaz | tanı\s+konmaz
    | tanı\s+değildir | teşhis\s+değildir | tanı\s+yerine\s+geçmez
    | teşhis\s+koymadan | tanı\s+koymadan | tanı\s+koymaz
    | ilaç\s+önerilmez | ilaç(?:/doz|\s+veya\s+doz|\s+ya\s+da\s+doz)\s+önerilmez
    | ilaç\s+ve\s+doz\s+önerilmez | ilaç\s+önerisi\s+(?:yoktur|içermez)
    | ilaç\s+(?:adı\s+)?(?:veya\s+doz\s+)?(?:içermez|vermez|önermez)
    | \bno\s+diagnos(?:is|es) | \bnot\s+a\s+diagnos(?:is|tic) | \bnot\s+diagnos(?:is|tic)
    | \bdoes\s+not\s+diagnose | \bdoesn't\s+diagnose | \bnever\s+diagnoses?
    | \bwithout\s+diagnos(?:is|ing) | \bnot\s+diagnose
    | \bno\s+medication | \bno\s+drug | \bno\s+dosage | \bno\s+prescription
    | \bnot\s+(?:a\s+)?medication | \bdoes\s+not\s+prescribe | \bnever\s+prescribes?
    | \bnot\s+prescribe | \bnot\s+prescrib
    """,
    re.IGNORECASE | re.VERBOSE,
)


def violations(text: str) -> list[str]:
    """Forbidden terms left in ``text`` after removing allow-listed disclaimers."""

    return [match.group(0) for match in FORBIDDEN.finditer(ALLOWED.sub(" ", text))]


# --- scanner self-tests ------------------------------------------------------
@pytest.mark.parametrize(
    "text",
    [
        "Bu sistem teşhis koymaz.",
        "Tanı değildir; ilaç önerilmez.",
        "Teşhis konmaz; alarmı ekip üyesi kapatır.",
        "The system does not diagnose. No diagnosis, no medication dose.",
        "Glukoz 94 mg/dL",
        "Kümülatif dozu hesaplar (radyasyon).",
    ],
)
def test_scanner_accepts_disclaimers_and_units(text: str) -> None:
    assert violations(text) == []


@pytest.mark.parametrize(
    "text",
    [
        "Tanı koy ve ilaç ver.",
        "Teşhis konuldu: grip",
        "Tanınız: enfeksiyon",
        "Parasetamol 500 mg alın",
        "Take 2 tablets of aspirin",
        "Antibiyotik başlayın",
        "Increase the dosage",
        "We diagnose the crew member",
        "Prescribe medication",
    ],
)
def test_scanner_rejects_diagnosis_and_medication(text: str) -> None:
    assert violations(text) != []


# --- real text sources -------------------------------------------------------
def _fail(found: list[tuple[str, str, list[str]]]) -> None:
    assert not found, "Tanı/ilaç dili bulundu:\n" + "\n".join(
        f"  {where}: {terms} in {text[:120]!r}" for where, text, terms in found
    )


def _card_texts():
    for card in all_action_cards():
        where = f"card {card.card_id}"
        yield where, card.title_tr
        yield where, card.reason_tr
        yield where, card.footer_note_tr
        yield where, card.closes_when_tr
        for text in (*card.escalate_if_tr, *card.considerations_tr):
            yield where, text
        for step in card.steps:
            yield f"{where}/{step.key}", step.text_tr
            yield f"{where}/{step.key}", step.why_tr
        for ref in card.references:
            yield where, ref.label


def test_action_cards_have_no_diagnosis_or_medication_wording() -> None:
    cards = list(all_action_cards())
    assert cards, "no action cards found"
    _fail([(w, t, violations(t)) for w, t in _card_texts() if t and violations(t)])


def test_scenario_texts_have_no_diagnosis_or_medication_wording() -> None:
    assert SCENARIOS
    found = []
    for scenario in SCENARIOS.values():
        texts = (scenario.title, scenario.description, *scenario.expected)
        found += [
            (f"scenario {scenario.scenario_id}", t, violations(t))
            for t in texts
            if violations(t)
        ]
    _fail(found)


def _string_literals(path: Path) -> list[tuple[int, str]]:
    """String constants that are not docstrings (docstrings are developer text)."""

    tree = ast.parse(path.read_text(encoding="utf-8"))
    docstrings = {
        id(node.body[0].value)
        for node in ast.walk(tree)
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
        and node.body
        and isinstance(node.body[0], ast.Expr)
        and isinstance(node.body[0].value, ast.Constant)
    }
    return [
        (node.lineno, node.value)
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and id(node) not in docstrings
    ]


def test_rule_explanations_and_templates_have_no_diagnosis_or_medication_wording() -> None:
    found = []
    scanned = 0
    for path in BACKEND_TEXT_SOURCES:
        for line, text in _string_literals(path):
            scanned += 1
            if violations(text):
                found.append((f"{path.name}:{line}", text, violations(text)))
    assert scanned > 100
    _fail(found)


STRING_LITERAL = re.compile(r"""'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`""")
JSX_TEXT = re.compile(r">([^<>{}]*[A-Za-zÇĞİÖŞÜçğıöşü][^<>{}]*)<")
LINE_COMMENT = re.compile(r"(?m)^\s*(?://|\*|/\*).*$")


def _frontend_texts(path: Path) -> list[str]:
    source = re.sub(r"/\*.*?\*/", " ", path.read_text(encoding="utf-8"), flags=re.S)
    source = LINE_COMMENT.sub(" ", source)
    texts = [next(g for g in m.groups() if g is not None) for m in STRING_LITERAL.finditer(source)]
    texts += JSX_TEXT.findall(source)
    return texts


def test_frontend_user_facing_strings_have_no_diagnosis_or_medication_wording() -> None:
    files = [
        p
        for p in FRONTEND_SRC.rglob("*")
        if p.suffix in {".ts", ".tsx"} and ".test." not in p.name and ".spec." not in p.name
    ]
    assert files, "frontend/src has no .ts/.tsx files"
    found = []
    for path in sorted(files):
        for text in _frontend_texts(path):
            if violations(text):
                found.append((str(path.relative_to(ROOT)), text, violations(text)))
    _fail(found)
