"""Versioned, pre-approved action cards.

Card content is fixed text approved by the project owner. The software never
generates medical advice at run time; it only selects one of these cards.
"""

from dataclasses import dataclass

from spaceapp_logar.rules.co2 import RULE_ID as CO2_NOMINAL_RULE_ID
from spaceapp_logar.rules.models import (
    DataQuality,
    HealthAttention,
    RuleEvaluation,
)


@dataclass(frozen=True, slots=True)
class ActionCardStep:
    """One short step shown to the astronaut."""

    key: str
    text_tr: str


@dataclass(frozen=True, slots=True)
class ActionCard:
    """A pre-approved action card and the safety limits that apply to it."""

    card_id: str
    version: int
    attention: HealthAttention
    rule_id: str
    title_key: str
    reason_key: str
    title_tr: str
    reason_tr: str
    steps: tuple[ActionCardStep, ...]
    footer_note_tr: str
    requires_mission_procedure: bool
    allows_automatic_vehicle_command: bool

    @property
    def step_keys(self) -> tuple[str, ...]:
        return tuple(step.key for step in self.steps)


ENV_CO2_WATCH_CARD_V1 = ActionCard(
    card_id="ENV_CO2_WATCH_CARD_V1",
    version=1,
    attention=HealthAttention.WATCH,
    rule_id=CO2_NOMINAL_RULE_ID,
    title_key="co2_watch.title",
    reason_key="co2_watch.reason",
    title_tr="Kabin CO₂ değerini kontrol et",
    reason_tr=(
        "Son bir saatlik ortalama CO₂ değeri nominal sınırın üzerinde. "
        "Ölçümü doğrula ve görev prosedürünü kontrol et."
    ),
    steps=(
        ActionCardStep(
            key="verify_measurement",
            text_tr=(
                "Ölçümü tekrar kontrol et. Kabin CO₂ göstergesini ve sensör "
                "durumunu kontrol et. Sensör hatası görünüyorsa bunu kaydet."
            ),
        ),
        ActionCardStep(
            key="record_check_in",
            text_tr=(
                "Nasıl hissettiğini kaydet. Özellikle yorgunluk veya "
                "ağrı/baş ağrısı varsa kısa öznel durum kontrolünü doldur."
            ),
        ),
        ActionCardStep(
            key="open_mission_procedure",
            text_tr=(
                "Görev prosedürünü aç. Göreve özel CO₂ havalandırma/giderim "
                "prosedürünü aç ve prosedürde belirtilen sorumlu ekibe bildir."
            ),
        ),
    ),
    footer_note_tr=(
        "Bu bir WATCH bildirimidir. Yazılım kendi başına havalandırma veya "
        "CO₂ giderim ekipmanına komut vermez. Göreve özel prosedür önceliklidir."
    ),
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
)

_CARDS_BY_ID_AND_VERSION: dict[tuple[str, int], ActionCard] = {
    (card.card_id, card.version): card for card in (ENV_CO2_WATCH_CARD_V1,)
}


def select_action_card(evaluation: RuleEvaluation) -> ActionCard | None:
    """Return the approved card for a rule result, or None if none applies.

    A card is shown only when the rule produced the exact attention level the
    card was approved for and the underlying data was valid.
    """

    if (
        evaluation.rule_id == ENV_CO2_WATCH_CARD_V1.rule_id
        and evaluation.health_attention is ENV_CO2_WATCH_CARD_V1.attention
        and evaluation.data_quality is DataQuality.VALID
    ):
        return ENV_CO2_WATCH_CARD_V1
    return None


def get_action_card(card_id: str, version: int) -> ActionCard | None:
    """Look up a stored card reference in the approved card catalog."""

    return _CARDS_BY_ID_AND_VERSION.get((card_id, version))
