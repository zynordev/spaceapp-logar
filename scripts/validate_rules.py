"""Deterministic SYNTHETIC evaluation of the rule engine (not clinical validation).

Runs the existing demo scenario builders and rule engine against a temporary
SQLite database with fixed seeds, and compares the engine with a naive
single-fixed-threshold baseline (HR>100, SpO2<92, temp>38) on identical data.

Usage:  uv run python scripts/validate_rules.py [--n 30] [--write docs/VALIDATION.md]

SENTETIK VERI - klinik dogrulama degildir; esikler DEMO (kanit sinifi F).
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from random import Random

from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from spaceapp_logar.db.models import RuleEvaluationRecord  # noqa: E402
from spaceapp_logar.db.session import create_database_engine  # noqa: E402
from spaceapp_logar.schemas.measurements import Metric  # noqa: E402
from spaceapp_logar.services import demo_scenarios as ds  # noqa: E402
from spaceapp_logar.services.demo_scenarios import (  # noqa: E402
    Plan,
    Scenario,
    _environment,
    _ramp,
    _standard_labs,
    _vitals,
)

FIXED_NOW = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
BASE_SEED = 20261115
LEVEL = {"UNKNOWN": -1, "NORMAL": 0, "WATCH": 1, "ALERT": 2, "CRITICAL": 3}

CO2_RULE = "ENV_CO2_NOMINAL_V1"
SPO2_RULE = "VITAL_SPO2_SUSTAINED_V1"
TEMP_RULE = "VITAL_TEMP_TREND_V1"
CARDIO_RULE = "MULTI_CARDIO_RESP_V1"
RED_FLAG_RULE = "RED_FLAG_SYMPTOM_V1"

NAIVE_HR, NAIVE_SPO2, NAIVE_TEMP = 100.0, 92.0, 38.0


# --- synthetic plans not covered by the stock scenarios ----------------------
def _normal_plan(start: datetime, rng: Random, variant: str) -> Plan:
    minutes = 240
    plan = Plan()
    hr0, rr0 = rng.uniform(58, 78), rng.uniform(12, 16)
    spo2_0, temp0 = rng.uniform(97.0, 99.0), rng.uniform(36.5, 36.9)
    _environment(plan, start, minutes, rng, co2=lambda m: 2.2)
    bout = rng.randrange(20, 120)
    sleep_from = 150

    def exercising(m: int) -> bool:
        return variant == "exercise_sleep" and bout <= m < bout + 25

    def sleeping(m: int) -> bool:
        return variant == "exercise_sleep" and m >= sleep_from

    def state(m: int) -> str:
        return "EXERCISE" if exercising(m) else "SLEEP" if sleeping(m) else "REST"

    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: hr0 + 55 if exercising(m) else hr0 - 12 if sleeping(m) else hr0,
        rr=lambda m: rr0 + 10 if exercising(m) else rr0 - 2 if sleeping(m) else rr0,
        spo2=lambda m: spo2_0 - (1.0 if exercising(m) else 0.0),
        temp=lambda m: temp0 + (0.4 if exercising(m) else 0.0),
        activity=state,
    )
    if variant == "noisy_sensors":
        # Short SpO2 dropouts reported as FAULT with implausible values, plus
        # one removed stretch of crew data (data gap).
        for _ in range(3):
            at = rng.randrange(10, minutes - 10)
            for item in plan.measurements:
                offset = (item["observed_at"] - start).total_seconds() / 60 - at
                if item["metric"] == Metric.SPO2.value and 0 <= offset < 4:
                    item["reported_quality"] = "FAULT"
                    item["value"] = round(rng.uniform(60, 85), 2)
        gap = rng.randrange(20, minutes - 30)
        plan.measurements = [
            item
            for item in plan.measurements
            if not (
                item["target_id"] == ds.CREW
                and 0 <= (item["observed_at"] - start).total_seconds() / 60 - gap < 6
            )
        ]
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


def _build_rest_cardio_resp(start: datetime, rng: Random) -> Plan:
    minutes = 150
    plan = Plan()
    _environment(plan, start, minutes, rng, co2=lambda m: 2.2)
    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: _ramp(m, 60, 110, 66, 94),
        rr=lambda m: _ramp(m, 60, 110, 14, 22),
        spo2=lambda m: 98.0,
        temp=lambda m: 36.7,
    )
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


def _register() -> None:
    def add(sid: str, minutes: int, build) -> None:
        ds.SCENARIOS[sid] = Scenario(sid, sid, "synthetic", "validation", (), minutes, build)

    for variant in ("plain", "exercise_sleep", "noisy_sensors"):
        add(f"val-normal-{variant}", 240, lambda s, r, v=variant: _normal_plan(s, r, v))
    add("val-rest-cardio-resp", 150, _build_rest_cardio_resp)


@dataclass(frozen=True)
class Family:
    key: str
    title: str
    scenario_ids: tuple[str, ...]
    kind: str  # "event" | "normal" | "fault"
    rules: tuple[str, ...] = ()
    naive_channel: bool = True


FAMILIES = (
    Family(
        "normal",
        "Normal gün (taban, egzersiz/uyku, sensör gürültüsü)",
        ("val-normal-plain", "val-normal-exercise_sleep", "val-normal-noisy_sensors"),
        "normal",
    ),
    Family("co2", "CO2 + baş ağrısı", ("co2-headache",), "event", (CO2_RULE,), False),
    Family("spo2", "SpO2 düşüşü", ("spo2-drop",), "event", (SPO2_RULE,)),
    Family("fever", "Ateş eğilimi", ("fever-trend",), "event", (TEMP_RULE, CARDIO_RULE)),
    Family(
        "cardio",
        "Dinlenmede kalp+solunum artışı",
        ("val-rest-cardio-resp",),
        "event",
        (CARDIO_RULE,),
        False,
    ),
    Family("fault", "Sensör arızası", ("sensor-fault",), "fault", (SPO2_RULE,)),
    Family(
        "redflag",
        "Kırmızı bayrak (göğüs ağrısı)",
        ("chest-pain-red-flag",),
        "event",
        (RED_FLAG_RULE,),
        False,
    ),
)


@dataclass
class Tally:
    n: int = 0
    detected: int = 0
    alert_days: int = 0
    unknown_days: int = 0
    naive_detected: int = 0
    naive_alert_days: int = 0


def naive_flag(plan: Plan) -> bool:
    """Single fixed threshold on raw samples; ignores quality and activity."""

    for item in plan.measurements:
        if item["target_id"] != ds.CREW:
            continue
        v, m = item["value"], item["metric"]
        if (
            (m == Metric.HEART_RATE.value and v > NAIVE_HR)
            or (m == Metric.SPO2.value and v < NAIVE_SPO2)
            or (m == Metric.BODY_TEMPERATURE.value and v > NAIVE_TEMP)
        ):
            return True
    return False


def wilson(k: int, n: int) -> tuple[float, float]:
    if n == 0:
        return 0.0, 0.0
    z, p = 1.96, k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return max(0.0, (c - h) / d), min(1.0, (c + h) / d)


_STATE: dict = {}


def _factory():
    """Per-process temporary SQLite database (migrated once)."""

    if "factory" not in _STATE:
        _register()
        tmp = tempfile.mkdtemp(dir=os.environ.get("VALIDATION_TMP"))
        url = f"sqlite:///{Path(tmp) / 'validation.db'}"
        cfg = Config(str(ROOT / "alembic.ini"))
        cfg.set_main_option("script_location", str(ROOT / "migrations"))
        cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
        command.upgrade(cfg, "head")
        engine = create_database_engine(url)
        _STATE.update(
            tmp=tmp, engine=engine, factory=sessionmaker(bind=engine, expire_on_commit=False)
        )
    return _STATE["factory"]


def _run_one(job: tuple[int, int]) -> tuple[int, dict]:
    """One synthetic window: returns plain facts (independent of other jobs)."""

    index, i = job
    family = FAMILIES[index]
    factory = _factory()
    sid = family.scenario_ids[i % len(family.scenario_ids)]
    seed = BASE_SEED + 1000 * index + i
    scenario = ds.SCENARIOS[sid]
    plan = scenario.build(
        FIXED_NOW - timedelta(minutes=scenario.duration_minutes - 1), Random(seed)
    )
    with factory() as session:
        run = ds.run_scenario(session, sid, now=FIXED_NOW, seed=seed)
        rows = session.execute(
            select(RuleEvaluationRecord.rule_id, RuleEvaluationRecord.health_attention)
            .where(RuleEvaluationRecord.mission_id == run.mission_id)
            .order_by(RuleEvaluationRecord.evaluated_at, RuleEvaluationRecord.id)
        ).all()
    levels = [(r.rule_id, LEVEL[r.health_attention]) for r in rows]
    naive = naive_flag(plan)
    last_spo2 = [lv for rid, lv in levels if rid == SPO2_RULE][-1:]
    return index, {
        "detected": any(rid in family.rules and lv >= LEVEL["WATCH"] for rid, lv in levels),
        "high": any(lv >= LEVEL["ALERT"] for _, lv in levels),
        "naive": naive,
        "unknown": bool(last_spo2) and last_spo2[0] == LEVEL["UNKNOWN"],
    }


def evaluate(n: int, workers: int) -> dict[str, Tally]:
    root_tmp = tempfile.mkdtemp(prefix="validate_rules_")
    os.environ["VALIDATION_TMP"] = root_tmp  # inherited by worker processes
    try:
        return _evaluate(n, workers)
    finally:
        shutil.rmtree(root_tmp, ignore_errors=True)


def _evaluate(n: int, workers: int) -> dict[str, Tally]:
    jobs = [(index, i) for index in range(len(FAMILIES)) for i in range(n)]
    if workers > 1:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            outcomes = list(pool.map(_run_one, jobs, chunksize=2))
    else:
        outcomes = [_run_one(job) for job in jobs]

    results = {f.key: Tally() for f in FAMILIES}
    for index, facts in outcomes:  # job order is fixed, so the sums are deterministic
        family = FAMILIES[index]
        tally = results[family.key]
        tally.n += 1
        if family.kind == "event":
            tally.detected += int(facts["detected"])
            tally.naive_detected += int(facts["naive"] and family.naive_channel)
        else:
            tally.alert_days += int(facts["high"])
            tally.naive_alert_days += int(facts["naive"])
            if family.kind == "fault":
                tally.unknown_days += int(facts["unknown"])
    return results


def pct(k: int, n: int) -> str:
    lo, hi = wilson(k, n)
    return f"{100 * k / n:.0f}% ({k}/{n}; %95 GA {100 * lo:.0f}–{100 * hi:.0f}%)"


def render(results: dict[str, Tally], n: int) -> str:
    fam = {f.key: f for f in FAMILIES}
    rows = []
    for key in ("co2", "spo2", "fever", "cardio", "redflag"):
        t = results[key]
        naive = pct(t.naive_detected, t.n) if fam[key].naive_channel else "— (bu kanalı ölçmez)"
        rows.append(f"| {fam[key].title} | {pct(t.detected, t.n)} | {naive} |")
    nt, ft = results["normal"], results["fault"]

    def per1000(k: int, m: int) -> str:
        return f"{1000 * k / m:.0f}"

    table = "\n".join(rows)
    return f"""# Sentetik Doğrulama (kural motoru)

> **SENTETİK VERİ — klinik doğrulama değildir; eşikler DEMO (kanıt sınıfı F).**
> Bu belge, kural motorunun *sentetik* senaryolarda tasarlandığı gibi davrandığını
> gösterir. Gerçek hasta/astronot verisiyle bir performans (duyarlılık, özgüllük)
> iddiası **yoktur**; sonuçlar yalnızca bu üretici ve bu eşiklere özgüdür.
> Sistem tanı koymaz, ilaç/doz önermez.

Bu dosya `uv run python scripts/validate_rules.py --n {n} --write docs/VALIDATION.md`
ile üretilir; aynı tohumlarla aynı sonucu verir. Çalışma süresi çok işlemli
(`--workers`) yaklaşık 2 dakikadır; N, bu süre sınırı için seçilmiştir.

## Yöntem

- Mevcut demo senaryo kurucuları (`services/demo_scenarios.py`) ve kural motoru
  (`services/rule_engine.py`), geçici bir SQLite veritabanında (alembic head) çalıştırılır.
- Aile başına **N = {n}** sentetik pencere; her pencere ayrı bir tohumla üretilir
  (`{BASE_SEED} + 1000·aile_sırası + i`); saat sabittir (`{FIXED_NOW.isoformat()}`).
- Olay aileleri mevcut senaryoları kullanır (`co2-headache`, `spo2-drop`,
  `fever-trend`, `sensor-fault`, `chest-pain-red-flag`) ve bir ek senaryo
  (dinlenmede kalp+solunum artışı). Tohum yalnızca ölçüm gürültüsünü değiştirir;
  olayın şekli sabittir — bu yüzden yüksek yakalama oranları *beklenendir*.
- Normal pencereler (240 dk; üç türe eşit bölünür): düz taban çizgisi, egzersiz ve
  uyku evreli, kısa SpO2 sensör arızaları ve veri boşlukları içeren gürültülü
  sensör. Taban değerleri tohuma göre rastgeledir.
- **Pencere ≠ gün.** Bir "pencere" 1,5–4 saatlik sentetik kayıttır (24 saatlik gün
  değil). Tabloda "1000 pencere başına" verilir; "gün" olarak okunmamalıdır.
- **Yakalama**: ilgili kuralın pencere içinde en az bir kez ≥ WATCH vermesi.
  **Yanlış alarm**: normal pencerede herhangi bir kuralın ALERT/CRITICAL vermesi.
- **Saf eşik tabanı**: aynı ham veride tek örnek üzerinden `KH>{NAIVE_HR:.0f}`,
  `SpO2<{NAIVE_SPO2:.0f}`, `sıcaklık>{NAIVE_TEMP:.0f}`; veri kalitesini ve
  aktivite bağlamını yok sayar. CO2, kalp+solunum ve kırmızı bayrak için bu
  tabanın ölçtüğü bir kanal yoktur; bu hücreler "ölçmez" yazılır.

## Sonuçlar

### Olay yakalama (≥ WATCH, N = {n} / aile)

| Aile | Kural motoru | Saf eşik tabanı |
|---|---|---|
{table}

### Yanlış alarm (normal pencereler, N = {nt.n})

| Yöntem | ALERT/CRITICAL pencere | 1000 pencere başına |
|---|---|---|
| Kural motoru | {pct(nt.alert_days, nt.n)} | {per1000(nt.alert_days, nt.n)} |
| Saf eşik tabanı | {pct(nt.naive_alert_days, nt.n)} | {per1000(nt.naive_alert_days, nt.n)} |

### Sensör arızası (N = {ft.n})

| Ölçüt | Kural motoru | Saf eşik tabanı |
|---|---|---|
| Sağlık alarmı (ALERT/CRITICAL) üretilen pencere | {pct(ft.alert_days, ft.n)} | {pct(ft.naive_alert_days, ft.n)} |
| SpO2 kuralı pencere sonunda BİLİNMİYOR | {pct(ft.unknown_days, ft.n)} | — |

## Sınırlar (abartı yok)

- Veriyi ve olayları biz ürettik; eşikler de bizim DEMO eşiklerimizdir. Bu bir
  döngüsel testtir: "tasarım amacına uyuyor mu" sorusunu yanıtlar, "klinik olarak
  doğru mu" sorusunu **yanıtlamaz**.
- Zor/belirsiz vakalar (yavaş sürüklenen taban, çoklu eşzamanlı olay, gerçek
  sensör gürültüsü) kapsanmaz. Gerçek duyarlılık/özgüllük bilinmiyor.
- Yalnızca NASA-STD-3001 kaynaklı kabin CO2 kuralı resmi bir kaynağa dayanır;
  diğer tüm eşikler DEMO'dur.
- Saf eşik tabanı kasıtlı olarak basittir; iyi bir klinik taban değildir.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=30)
    parser.add_argument("--write", type=Path)
    parser.add_argument("--workers", type=int, default=min(12, os.cpu_count() or 1))
    args = parser.parse_args()
    started = time.time()
    results = evaluate(args.n, args.workers)
    text = render(results, args.n)
    if args.write:
        args.write.write_text(text, encoding="utf-8")
    else:
        sys.stdout.buffer.write(text.encode("utf-8"))
    print(f"\nruntime_s={time.time() - started:.1f}", file=sys.stderr)


if __name__ == "__main__":
    main()
