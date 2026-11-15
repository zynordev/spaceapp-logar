"""Rules that widen coverage across NASA's spaceflight hazards.

All thresholds here are DEMO thresholds (evidence class F, docs/biyo.md):
general Earth references or operational heuristics that must be validated by
flight medicine before real use. None of these rules diagnoses anything.

- ENV_CABIN_ATMOSPHERE_V1: oxygen partial pressure (ppO2), so habitats with
  different total pressure (ISS ~101 kPa, exploration atmospheres ~56 kPa)
  are compared fairly.
- ENV_RADIATION_V1: short-term dose-rate rise against the habitat's own
  baseline (e.g. a solar particle event), plus cumulative mission dose.
- BEHAV_SLEEP_V1: multi-night sleep debt, raised by fatigue / mood.
- SENS_MOTION_SICKNESS_V1: nausea + dizziness pattern (symptom-based).
- SANS_VISION_SYMPTOM_V1: reported vision change (symptom-based).
"""

from dataclasses import dataclass
from datetime import datetime

from spaceapp_logar.rules.models import DataQuality, HealthAttention, RuleEvaluation

DEMO_SOURCE_URI = "docs/DEMO_RULES.md"

# --- Cabin atmosphere --------------------------------------------------------
ATMOSPHERE_RULE_ID = "ENV_CABIN_ATMOSPHERE_V1"
ATMOSPHERE_WINDOW_MINUTES = 15
ATMOSPHERE_MIN_SAMPLES = 3
PPO2_WATCH_BELOW_KPA = 18.0
PPO2_ALERT_BELOW_KPA = 16.0
ATMOSPHERE_SOURCE = (
    "DEMO threshold (evidence class F): O₂ partial pressure (ppO₂ = O₂ fraction × total pressure). "
    "Sea-level air ≈21 kPa; <18 kPa is watched, <16 kPa is the level where symptoms begin in general safety "
    "references. Not a mission atmosphere limit."
)

# --- Radiation ---------------------------------------------------------------
RADIATION_RULE_ID = "ENV_RADIATION_V1"
RADIATION_WINDOW_MINUTES = 15
RADIATION_MIN_SAMPLES = 3
RADIATION_WATCH_FACTOR = 3.0
RADIATION_ALERT_FACTOR = 10.0
CAREER_LIMIT_MSV = 600.0
RADIATION_SOURCE = (
    "DEMO threshold (evidence class F): a dose rate ≥3× the module's own starting dose rate "
    "is watched; ≥10× is treated as a possible solar particle event. Real "
    "protection decisions are made by the ground team's radiation specialists. The NASA career "
    "effective dose limit is 600 mSv (NASA-STD-3001)."
)

# --- Sleep -------------------------------------------------------------------
SLEEP_RULE_ID = "BEHAV_SLEEP_V1"
SLEEP_NIGHTS = 3
SLEEP_MIN_NIGHTS = 2
SLEEP_WATCH_BELOW_H = 6.0
SLEEP_ALERT_BELOW_H = 5.0
SLEEP_SYMPTOM_AT_LEAST = 3
SLEEP_SOURCE = (
    "DEMO threshold (evidence class F): recent-nights average below 6 h is watched; below 5 h "
    "with fatigue or mood distress ≥3/4 raises the level. Sleep loss and circadian disruption are among NASA's defined spaceflight "
    "risks."
)

# --- Motion sickness ---------------------------------------------------------
MOTION_RULE_ID = "SENS_MOTION_SICKNESS_V1"
MOTION_SYMPTOM_AT_LEAST = 2
MOTION_LOOKBACK_HOURS = 6
MOTION_SOURCE = (
    "DEMO (evidence class F): nausea and dizziness reported together at ≥2/4. "
    "Space motion sickness is common in the first days after gravity transitions. "
    "Not a diagnosis; other causes have not been ruled out."
)

# --- Vision ------------------------------------------------------------------
VISION_RULE_ID = "SANS_VISION_SYMPTOM_V1"
VISION_AT_LEAST = 2
VISION_LOOKBACK_HOURS = 24
VISION_SOURCE = (
    "DEMO (evidence class F): vision change reported at ≥2/4. On long missions, "
    "spaceflight-associated neuro-ocular syndrome (SANS) is a known risk; "
    "assessment requires an eye examination. Not a diagnosis."
)


def _evaluation(
    rule_id: str,
    *,
    quality: DataQuality,
    attention: HealthAttention,
    value: float | None,
    unit: str,
    threshold: float,
    comparison: str,
    window_minutes: int,
    explanation: str,
    source: str,
) -> RuleEvaluation:
    return RuleEvaluation(
        rule_id=rule_id,
        rule_version=1,
        data_quality=quality,
        health_attention=attention,
        observed_value=value,
        unit=unit,
        threshold=threshold,
        comparison=comparison,
        window_minutes=window_minutes,
        explanation=explanation,
        source=source,
        source_uri=DEMO_SOURCE_URI,
    )


def _num(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}"


# --- Cabin atmosphere ---------------------------------------------------------
def evaluate_cabin_atmosphere(
    o2_percent: float | None,
    pressure_kpa: float | None,
    pressure_change_kpa: float | None,
) -> RuleEvaluation:
    if o2_percent is None or pressure_kpa is None:
        return _evaluation(
            ATMOSPHERE_RULE_ID,
            quality=DataQuality.MISSING,
            attention=HealthAttention.UNKNOWN,
            value=None,
            unit="kPa",
            threshold=PPO2_WATCH_BELOW_KPA,
            comparison="<",
            window_minutes=ATMOSPHERE_WINDOW_MINUTES,
            explanation=(
                f"Not enough cabin O₂ and pressure data in the last {ATMOSPHERE_WINDOW_MINUTES} minutes; "
                "O₂ partial pressure could not be calculated."
            ),
            source=ATMOSPHERE_SOURCE,
        )
    ppo2 = o2_percent / 100.0 * pressure_kpa
    if ppo2 < PPO2_ALERT_BELOW_KPA:
        attention, threshold = HealthAttention.ALERT, PPO2_ALERT_BELOW_KPA
    elif ppo2 < PPO2_WATCH_BELOW_KPA:
        attention, threshold = HealthAttention.WATCH, PPO2_WATCH_BELOW_KPA
    else:
        attention, threshold = HealthAttention.NORMAL, PPO2_WATCH_BELOW_KPA
    trend = ""
    if pressure_change_kpa is not None and abs(pressure_change_kpa) >= 0.2:
        direction = "falling" if pressure_change_kpa < 0 else "rising"
        trend = (
            f" Total pressure is {direction} by "
            f"{_num(abs(pressure_change_kpa), 2)} kPa over the last {ATMOSPHERE_WINDOW_MINUTES} minutes."
        )
    return _evaluation(
        ATMOSPHERE_RULE_ID,
        quality=DataQuality.VALID,
        attention=attention,
        value=round(ppo2, 2),
        unit="kPa",
        threshold=threshold,
        comparison="<",
        window_minutes=ATMOSPHERE_WINDOW_MINUTES,
        explanation=(
            f"Cabin O₂ {_num(o2_percent)}% × pressure {_num(pressure_kpa)} kPa → O₂ partial "
            f"pressure {_num(ppo2, 2)} kPa (watch limit {_num(PPO2_WATCH_BELOW_KPA)} kPa, "
            f"DEMO).{trend}"
        ),
        source=ATMOSPHERE_SOURCE,
    )


# --- Radiation ----------------------------------------------------------------
def evaluate_radiation(
    recent_mean_usv_h: float | None,
    baseline_usv_h: float | None,
    cumulative_msv: float,
) -> RuleEvaluation:
    cumulative = (
        f" Recorded cumulative dose in this mission ≈ {_num(cumulative_msv, 3)} mSv "
        f"(career limit {CAREER_LIMIT_MSV:.0f} mSv)."
    )
    if recent_mean_usv_h is None:
        return _evaluation(
            RADIATION_RULE_ID,
            quality=DataQuality.MISSING,
            attention=HealthAttention.UNKNOWN,
            value=None,
            unit="uSv/h",
            threshold=RADIATION_WATCH_FACTOR,
            comparison="x>=",
            window_minutes=RADIATION_WINDOW_MINUTES,
            explanation=f"Not enough dose rate data in the last {RADIATION_WINDOW_MINUTES} minutes.{cumulative}",
            source=RADIATION_SOURCE,
        )
    if baseline_usv_h is None or baseline_usv_h <= 0:
        return _evaluation(
            RADIATION_RULE_ID,
            quality=DataQuality.MISSING,
            attention=HealthAttention.UNKNOWN,
            value=recent_mean_usv_h,
            unit="uSv/h",
            threshold=RADIATION_WATCH_FACTOR,
            comparison="x>=",
            window_minutes=RADIATION_WINDOW_MINUTES,
            explanation=(
                f"Dose rate {_num(recent_mean_usv_h)} µSv/h; module baseline "
                f"not established yet, so the increase could not be assessed.{cumulative}"
            ),
            source=RADIATION_SOURCE,
        )
    factor = recent_mean_usv_h / baseline_usv_h
    if factor >= RADIATION_ALERT_FACTOR:
        attention, threshold = HealthAttention.ALERT, RADIATION_ALERT_FACTOR
    elif factor >= RADIATION_WATCH_FACTOR:
        attention, threshold = HealthAttention.WATCH, RADIATION_WATCH_FACTOR
    else:
        attention, threshold = HealthAttention.NORMAL, RADIATION_WATCH_FACTOR
    return _evaluation(
        RADIATION_RULE_ID,
        quality=DataQuality.VALID,
        attention=attention,
        value=round(recent_mean_usv_h, 2),
        unit="uSv/h",
        threshold=round(baseline_usv_h * threshold, 2),
        comparison=">=",
        window_minutes=RADIATION_WINDOW_MINUTES,
        explanation=(
            f"Last {RADIATION_WINDOW_MINUTES} min dose rate {_num(recent_mean_usv_h)} µSv/h; "
            f"module baseline {_num(baseline_usv_h)} µSv/h (×{_num(factor)}). "
            f"Watch ×{RADIATION_WATCH_FACTOR:.0f}, possible solar particle event ×"
            f"{RADIATION_ALERT_FACTOR:.0f} (DEMO).{cumulative}"
        ),
        source=RADIATION_SOURCE,
    )


# --- Sleep --------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class SleepSymptoms:
    fatigue: int | None
    mood_distress: int | None


def evaluate_sleep(nights_h: list[float], symptoms: SleepSymptoms) -> RuleEvaluation:
    if len(nights_h) < SLEEP_MIN_NIGHTS:
        return _evaluation(
            SLEEP_RULE_ID,
            quality=DataQuality.MISSING,
            attention=HealthAttention.UNKNOWN,
            value=nights_h[-1] if nights_h else None,
            unit="h",
            threshold=SLEEP_WATCH_BELOW_H,
            comparison="<",
            window_minutes=SLEEP_NIGHTS * 24 * 60,
            explanation=(
                f"At least {SLEEP_MIN_NIGHTS} nights of records are needed to assess sleep debt "
                f"({len(nights_h)} available)."
            ),
            source=SLEEP_SOURCE,
        )
    mean = sum(nights_h) / len(nights_h)
    high_symptom = max(symptoms.fatigue or 0, symptoms.mood_distress or 0)
    nights_text = ", ".join(_num(value) for value in nights_h)
    if mean < SLEEP_ALERT_BELOW_H and high_symptom >= SLEEP_SYMPTOM_AT_LEAST:
        attention, threshold = HealthAttention.ALERT, SLEEP_ALERT_BELOW_H
        verdict = (
            f"average below {_num(SLEEP_ALERT_BELOW_H)} h and fatigue/mood "
            f"distress {high_symptom}/4"
        )
    elif mean < SLEEP_WATCH_BELOW_H:
        attention, threshold = HealthAttention.WATCH, SLEEP_WATCH_BELOW_H
        verdict = f"average below {_num(SLEEP_WATCH_BELOW_H)} h (sleep debt)"
    else:
        attention, threshold = HealthAttention.NORMAL, SLEEP_WATCH_BELOW_H
        verdict = "no marked sleep debt"
    return _evaluation(
        SLEEP_RULE_ID,
        quality=DataQuality.VALID,
        attention=attention,
        value=round(mean, 2),
        unit="h",
        threshold=threshold,
        comparison="<",
        window_minutes=SLEEP_NIGHTS * 24 * 60,
        explanation=(
            f"Sleep over the last {len(nights_h)} nights: {nights_text} h (average {_num(mean)}); "
            f"{verdict} (DEMO)."
        ),
        source=SLEEP_SOURCE,
    )


# --- Symptom-based rules ------------------------------------------------------
def evaluate_motion_sickness(
    nausea: int | None, dizziness: int | None, reported_at: datetime | None
) -> RuleEvaluation:
    if nausea is None or dizziness is None:
        return _evaluation(
            MOTION_RULE_ID,
            quality=DataQuality.MISSING,
            attention=HealthAttention.UNKNOWN,
            value=None,
            unit="/4",
            threshold=MOTION_SYMPTOM_AT_LEAST,
            comparison=">=",
            window_minutes=MOTION_LOOKBACK_HOURS * 60,
            explanation=(
                f"No subjective status record in the last {MOTION_LOOKBACK_HOURS} hours; motion "
                "sickness pattern could not be assessed."
            ),
            source=MOTION_SOURCE,
        )
    both = min(nausea, dizziness)
    attention = (
        HealthAttention.WATCH if both >= MOTION_SYMPTOM_AT_LEAST else HealthAttention.NORMAL
    )
    verdict = (
        "seen together; may be consistent with a motion sickness pattern"
        if attention is HealthAttention.WATCH
        else "not marked together"
    )
    return _evaluation(
        MOTION_RULE_ID,
        quality=DataQuality.VALID,
        attention=attention,
        value=float(both),
        unit="/4",
        threshold=MOTION_SYMPTOM_AT_LEAST,
        comparison=">=",
        window_minutes=MOTION_LOOKBACK_HOURS * 60,
        explanation=(
            f"Nausea {nausea}/4, dizziness {dizziness}/4: {verdict} (DEMO). Not a diagnosis; "
            "other causes such as CO₂, infection and inner-ear problems have not been ruled out."
        ),
        source=MOTION_SOURCE,
    )


def evaluate_vision(vision_change: int | None) -> RuleEvaluation:
    if vision_change is None:
        return _evaluation(
            VISION_RULE_ID,
            quality=DataQuality.MISSING,
            attention=HealthAttention.UNKNOWN,
            value=None,
            unit="/4",
            threshold=VISION_AT_LEAST,
            comparison=">=",
            window_minutes=VISION_LOOKBACK_HOURS * 60,
            explanation="Vision change question not answered in the last 24 hours.",
            source=VISION_SOURCE,
        )
    attention = (
        HealthAttention.WATCH if vision_change >= VISION_AT_LEAST else HealthAttention.NORMAL
    )
    return _evaluation(
        VISION_RULE_ID,
        quality=DataQuality.VALID,
        attention=attention,
        value=float(vision_change),
        unit="/4",
        threshold=VISION_AT_LEAST,
        comparison=">=",
        window_minutes=VISION_LOOKBACK_HOURS * 60,
        explanation=(
            f"Reported vision change {vision_change}/4"
            + (
                "; eye examination needed to assess (DEMO). Not a diagnosis."
                if attention is HealthAttention.WATCH
                else "; below the watch limit."
            )
        ),
        source=VISION_SOURCE,
    )
