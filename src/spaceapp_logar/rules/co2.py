from math import isfinite

from spaceapp_logar.rules.models import (
    DataQuality,
    HealthAttention,
    RuleEvaluation,
)

RULE_ID = "ENV_CO2_NOMINAL_V1"
RULE_VERSION = 1
CO2_NOMINAL_LIMIT_MMHG = 3.0
WINDOW_MINUTES = 60
SOURCE = "NASA-STD-3001 Volume 2 Rev F, V2 6004"
SOURCE_URI = (
    "https://www.nasa.gov/wp-content/uploads/2025/05/"
    "nasa-std-3001-vol-2.pdf"
)


def evaluate_co2_nominal(
    one_hour_average_ppco2_mmhg: float | None,
    data_quality: DataQuality = DataQuality.VALID,
) -> RuleEvaluation:
    """Evaluate the NASA nominal one-hour cabin ppCO2 limit.

    This rule deliberately produces WATCH, not ALERT or CRITICAL, when the
    nominal limit is exceeded. NASA requires mission-specific off-nominal
    limits, which are outside this prototype's authority.
    """

    if one_hour_average_ppco2_mmhg is None:
        effective_quality = (
            DataQuality.MISSING
            if data_quality is DataQuality.VALID
            else data_quality
        )
        return _result(
            value=None,
            data_quality=effective_quality,
            attention=HealthAttention.UNKNOWN,
            explanation=(
                f"Son bir saat için kabin ppCO₂ ortalaması yok "
                f"({effective_quality.value}); "
                "sağlık dikkati değerlendirilemedi."
            ),
        )

    if data_quality is not DataQuality.VALID:
        return _result(
            value=one_hour_average_ppco2_mmhg,
            data_quality=data_quality,
            attention=HealthAttention.UNKNOWN,
            explanation=(
                f"Kabin ppCO₂ verisi {data_quality.value}; "
                "güvenilir sağlık dikkati üretilemedi."
            ),
        )

    if not isfinite(one_hour_average_ppco2_mmhg) or one_hour_average_ppco2_mmhg < 0:
        return _result(
            value=one_hour_average_ppco2_mmhg,
            data_quality=DataQuality.FAULT,
            attention=HealthAttention.UNKNOWN,
            explanation=(
                "Kabin ppCO₂ ortalaması sonlu olmayan veya negatif bir değer; "
                "sensör/veri hattı kontrol edilmeli."
            ),
        )

    if one_hour_average_ppco2_mmhg > CO2_NOMINAL_LIMIT_MMHG:
        return _result(
            value=one_hour_average_ppco2_mmhg,
            data_quality=DataQuality.VALID,
            attention=HealthAttention.WATCH,
            explanation=(
                f"Bir saatlik ortalama kabin ppCO₂ değeri "
                f"{one_hour_average_ppco2_mmhg:.2f} mmHg; NASA nominal üst "
                f"sınırı {CO2_NOMINAL_LIMIT_MMHG:.2f} mmHg üzerinde."
            ),
        )

    return _result(
        value=one_hour_average_ppco2_mmhg,
        data_quality=DataQuality.VALID,
        attention=HealthAttention.NORMAL,
        explanation=(
            f"Bir saatlik ortalama kabin ppCO₂ değeri "
            f"{one_hour_average_ppco2_mmhg:.2f} mmHg; NASA nominal üst "
            f"sınırı {CO2_NOMINAL_LIMIT_MMHG:.2f} mmHg aşılmadı."
        ),
    )


def _result(
    *,
    value: float | None,
    data_quality: DataQuality,
    attention: HealthAttention,
    explanation: str,
) -> RuleEvaluation:
    return RuleEvaluation(
        rule_id=RULE_ID,
        rule_version=RULE_VERSION,
        data_quality=data_quality,
        health_attention=attention,
        observed_value=value,
        unit="mmHg",
        threshold=CO2_NOMINAL_LIMIT_MMHG,
        comparison=">",
        window_minutes=WINDOW_MINUTES,
        explanation=explanation,
        source=SOURCE,
        source_uri=SOURCE_URI,
    )

