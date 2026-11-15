"""Red-flag symptoms that escalate immediately (docs/biyo.md section 10).

A red flag is reported by a crew member. It never waits for a time window,
an average or the deep-analysis layer: normal sensor values do not rule out a
serious event (for example a heart attack can occur with a normal heart rate).
The rule does NOT diagnose; it only opens the emergency first-step card.

DEMO: the red-flag list follows docs/biyo.md and must be validated by flight
medicine before real use.
"""

from datetime import datetime
from enum import StrEnum

from spaceapp_logar.rules.models import DataQuality, HealthAttention, RuleEvaluation

RED_FLAG_RULE_ID = "RED_FLAG_SYMPTOM_V1"
RED_FLAG_SOURCE = (
    "DEMO (evidence class F): docs/biyo.md section 10 red-flag classes. "
    "Awaits flight medicine validation; not a diagnosis."
)
RED_FLAG_SOURCE_URI = "docs/DEMO_RULES.md"


class RedFlag(StrEnum):
    CHEST_PAIN = "CHEST_PAIN"
    SEVERE_SHORTNESS_OF_BREATH = "SEVERE_SHORTNESS_OF_BREATH"
    FAINTING_OR_LOSS_OF_CONSCIOUSNESS = "FAINTING_OR_LOSS_OF_CONSCIOUSNESS"
    NEW_CONFUSION = "NEW_CONFUSION"
    NEW_NEUROLOGICAL_SYMPTOM = "NEW_NEUROLOGICAL_SYMPTOM"
    SUDDEN_VISION_CHANGE = "SUDDEN_VISION_CHANGE"
    UNCONTROLLED_BLEEDING = "UNCONTROLLED_BLEEDING"
    RAPID_WORSENING = "RAPID_WORSENING"
    MULTIPLE_CREW_SYMPTOMS = "MULTIPLE_CREW_SYMPTOMS"


RED_FLAG_LABELS: dict[RedFlag, str] = {
    RedFlag.CHEST_PAIN: "Chest pain or a feeling of pressure",
    RedFlag.SEVERE_SHORTNESS_OF_BREATH: "Severe shortness of breath",
    RedFlag.FAINTING_OR_LOSS_OF_CONSCIOUSNESS: "Fainting or loss of consciousness",
    RedFlag.NEW_CONFUSION: "New clouding of consciousness or confusion",
    RedFlag.NEW_NEUROLOGICAL_SYMPTOM: (
        "New neurological symptom (speech difficulty, weakness in face/arm)"
    ),
    RedFlag.SUDDEN_VISION_CHANGE: "Sudden and severe vision change",
    RedFlag.UNCONTROLLED_BLEEDING: "Uncontrolled bleeding",
    RedFlag.RAPID_WORSENING: "Rapidly worsening condition",
    RedFlag.MULTIPLE_CREW_SYMPTOMS: "Symptoms in several crew members at the same time",
}


def evaluate_red_flags(flags: list[RedFlag]) -> RuleEvaluation:
    labels = ", ".join(RED_FLAG_LABELS[flag] for flag in flags)
    return RuleEvaluation(
        rule_id=RED_FLAG_RULE_ID,
        rule_version=1,
        data_quality=DataQuality.VALID,
        health_attention=HealthAttention.CRITICAL,
        observed_value=float(len(flags)),
        unit="symptom",
        threshold=1.0,
        comparison=">=",
        window_minutes=0,
        explanation=(
            f"Red flag reported: {labels}. Even when sensor measurements are normal, "
            "this symptom may require urgent evaluation; the system directs to the "
            "emergency procedure without waiting for any average. This is not a diagnosis."
        ),
        source=RED_FLAG_SOURCE,
        source_uri=RED_FLAG_SOURCE_URI,
    )


def evaluate_red_flag_closed(resolved_by: str, resolved_at: datetime) -> RuleEvaluation:
    return RuleEvaluation(
        rule_id=RED_FLAG_RULE_ID,
        rule_version=1,
        data_quality=DataQuality.VALID,
        health_attention=HealthAttention.NORMAL,
        observed_value=0.0,
        unit="symptom",
        threshold=1.0,
        comparison=">=",
        window_minutes=0,
        explanation=(
            f"Red-flag event was reviewed by {resolved_by} and closed at "
            f"{resolved_at:%Y-%m-%d %H:%M} UTC. No active red flag."
        ),
        source=RED_FLAG_SOURCE,
        source_uri=RED_FLAG_SOURCE_URI,
    )
