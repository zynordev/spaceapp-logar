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
    "DEMO (kanıt sınıfı F): docs/biyo.md bölüm 10 kırmızı bayrak sınıfları. "
    "Uçuş tıbbı doğrulaması bekler; teşhis değildir."
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
    RedFlag.CHEST_PAIN: "Göğüs ağrısı veya baskı hissi",
    RedFlag.SEVERE_SHORTNESS_OF_BREATH: "Ciddi nefes darlığı",
    RedFlag.FAINTING_OR_LOSS_OF_CONSCIOUSNESS: "Bayılma veya bilinç kaybı",
    RedFlag.NEW_CONFUSION: "Yeni bilinç bulanıklığı veya kafa karışıklığı",
    RedFlag.NEW_NEUROLOGICAL_SYMPTOM: (
        "Yeni nörolojik belirti (konuşma bozukluğu, yüzde/kolda güçsüzlük)"
    ),
    RedFlag.SUDDEN_VISION_CHANGE: "Ani ve ciddi görme değişikliği",
    RedFlag.UNCONTROLLED_BLEEDING: "Durdurulamayan kanama",
    RedFlag.RAPID_WORSENING: "Hızla kötüleşen durum",
    RedFlag.MULTIPLE_CREW_SYMPTOMS: "Birden fazla ekip üyesinde aynı anda belirti",
}


def evaluate_red_flags(flags: list[RedFlag]) -> RuleEvaluation:
    labels = ", ".join(RED_FLAG_LABELS[flag] for flag in flags)
    return RuleEvaluation(
        rule_id=RED_FLAG_RULE_ID,
        rule_version=1,
        data_quality=DataQuality.VALID,
        health_attention=HealthAttention.CRITICAL,
        observed_value=float(len(flags)),
        unit="belirti",
        threshold=1.0,
        comparison=">=",
        window_minutes=0,
        explanation=(
            f"Kırmızı bayrak bildirildi: {labels}. Sensör ölçümleri normal olsa "
            "bile bu belirti acil değerlendirme gerektirebilir; sistem hiçbir "
            "ortalamayı beklemeden acil prosedüre yönlendirir. Bu bir teşhis değildir."
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
        unit="belirti",
        threshold=1.0,
        comparison=">=",
        window_minutes=0,
        explanation=(
            f"Kırmızı bayrak olayı {resolved_by} tarafından değerlendirildi ve "
            f"{resolved_at:%Y-%m-%d %H:%M} UTC'de kapatıldı. Etkin kırmızı bayrak yok."
        ),
        source=RED_FLAG_SOURCE,
        source_uri=RED_FLAG_SOURCE_URI,
    )
