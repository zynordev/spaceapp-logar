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
    "DEMO eşik (kanıt sınıfı F): O₂ kısmi basıncı (ppO₂ = O₂ oranı × toplam basınç). "
    "Deniz seviyesi havası ≈21 kPa; <18 kPa izlenir, <16 kPa genel güvenlik "
    "referanslarında belirtilerin başladığı düzeydir. Görev atmosfer sınırı değildir."
)

# --- Radiation ---------------------------------------------------------------
RADIATION_RULE_ID = "ENV_RADIATION_V1"
RADIATION_WINDOW_MINUTES = 15
RADIATION_MIN_SAMPLES = 3
RADIATION_WATCH_FACTOR = 3.0
RADIATION_ALERT_FACTOR = 10.0
CAREER_LIMIT_MSV = 600.0
RADIATION_SOURCE = (
    "DEMO eşik (kanıt sınıfı F): modülün kendi başlangıç doz hızının ≥3 katı "
    "izlenir, ≥10 katı olası güneş parçacık olayı gibi değerlendirilir. Gerçek "
    "korunma kararlarını yer ekibinin radyasyon uzmanları verir. NASA kariyer "
    "efektif doz sınırı 600 mSv'dir (NASA-STD-3001)."
)

# --- Sleep -------------------------------------------------------------------
SLEEP_RULE_ID = "BEHAV_SLEEP_V1"
SLEEP_NIGHTS = 3
SLEEP_MIN_NIGHTS = 2
SLEEP_WATCH_BELOW_H = 6.0
SLEEP_ALERT_BELOW_H = 5.0
SLEEP_SYMPTOM_AT_LEAST = 3
SLEEP_SOURCE = (
    "DEMO eşik (kanıt sınıfı F): son gecelerin ortalaması <6 saat izlenir; <5 saat "
    "ve yorgunluk veya ruh hali sıkıntısı ≥3/4 ise seviye yükselir. Uzay uçuşunda "
    "uyku kaybı ve sirkadiyen bozulma NASA'nın tanımlı risklerindendir."
)

# --- Motion sickness ---------------------------------------------------------
MOTION_RULE_ID = "SENS_MOTION_SICKNESS_V1"
MOTION_SYMPTOM_AT_LEAST = 2
MOTION_LOOKBACK_HOURS = 6
MOTION_SOURCE = (
    "DEMO (kanıt sınıfı F): bulantı ve baş dönmesinin birlikte ≥2/4 bildirilmesi. "
    "Uzay hareket hastalığı yerçekimi geçişlerinden sonraki ilk günlerde sık görülür. "
    "Teşhis değildir; başka nedenler dışlanmamıştır."
)

# --- Vision ------------------------------------------------------------------
VISION_RULE_ID = "SANS_VISION_SYMPTOM_V1"
VISION_AT_LEAST = 2
VISION_LOOKBACK_HOURS = 24
VISION_SOURCE = (
    "DEMO (kanıt sınıfı F): görme değişikliğinin ≥2/4 bildirilmesi. Uzun görevlerde "
    "uzay uçuşuyla ilişkili nöro-oküler sendrom (SANS) bilinen bir risktir; "
    "değerlendirme göz muayenesi gerektirir. Teşhis değildir."
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
    return f"{value:.{digits}f}".replace(".", ",")


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
                f"Son {ATMOSPHERE_WINDOW_MINUTES} dakikada yeterli kabin O₂ ve basınç "
                "verisi yok; O₂ kısmi basıncı hesaplanamadı."
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
        direction = "düşüyor" if pressure_change_kpa < 0 else "artıyor"
        trend = (
            f" Toplam basınç son {ATMOSPHERE_WINDOW_MINUTES} dakikada "
            f"{_num(abs(pressure_change_kpa), 2)} kPa {direction}."
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
            f"Kabin O₂ %{_num(o2_percent)} × basınç {_num(pressure_kpa)} kPa → O₂ kısmi "
            f"basıncı {_num(ppo2, 2)} kPa (izleme sınırı {_num(PPO2_WATCH_BELOW_KPA)} kPa, "
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
        f" Bu görevde kaydedilen kümülatif doz ≈ {_num(cumulative_msv, 3)} mSv "
        f"(kariyer sınırı {CAREER_LIMIT_MSV:.0f} mSv)."
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
            explanation=f"Son {RADIATION_WINDOW_MINUTES} dakikada yeterli doz hızı verisi yok.{cumulative}",
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
                f"Doz hızı {_num(recent_mean_usv_h)} µSv/saat; modül başlangıç değeri "
                f"henüz oluşmadığı için artış değerlendirilemedi.{cumulative}"
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
            f"Son {RADIATION_WINDOW_MINUTES} dk doz hızı {_num(recent_mean_usv_h)} µSv/saat; "
            f"modül başlangıcı {_num(baseline_usv_h)} µSv/saat (×{_num(factor)}). "
            f"İzleme ×{RADIATION_WATCH_FACTOR:.0f}, olası parçacık olayı ×"
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
                f"Uyku borcu için en az {SLEEP_MIN_NIGHTS} gecelik kayıt gerekiyor "
                f"({len(nights_h)} var)."
            ),
            source=SLEEP_SOURCE,
        )
    mean = sum(nights_h) / len(nights_h)
    high_symptom = max(symptoms.fatigue or 0, symptoms.mood_distress or 0)
    nights_text = ", ".join(_num(value) for value in nights_h)
    if mean < SLEEP_ALERT_BELOW_H and high_symptom >= SLEEP_SYMPTOM_AT_LEAST:
        attention, threshold = HealthAttention.ALERT, SLEEP_ALERT_BELOW_H
        verdict = (
            f"ortalama {_num(SLEEP_ALERT_BELOW_H)} saatin altında ve yorgunluk/ruh hali "
            f"sıkıntısı {high_symptom}/4"
        )
    elif mean < SLEEP_WATCH_BELOW_H:
        attention, threshold = HealthAttention.WATCH, SLEEP_WATCH_BELOW_H
        verdict = f"ortalama {_num(SLEEP_WATCH_BELOW_H)} saatin altında (uyku borcu)"
    else:
        attention, threshold = HealthAttention.NORMAL, SLEEP_WATCH_BELOW_H
        verdict = "belirgin uyku borcu yok"
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
            f"Son {len(nights_h)} gece uyku: {nights_text} saat (ortalama {_num(mean)}); "
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
                f"Son {MOTION_LOOKBACK_HOURS} saatte öznel durum kaydı yok; hareket "
                "hastalığı örüntüsü değerlendirilemedi."
            ),
            source=MOTION_SOURCE,
        )
    both = min(nausea, dizziness)
    attention = (
        HealthAttention.WATCH if both >= MOTION_SYMPTOM_AT_LEAST else HealthAttention.NORMAL
    )
    verdict = (
        "birlikte görülüyor; hareket hastalığı örüntüsüyle uyumlu olabilir"
        if attention is HealthAttention.WATCH
        else "birlikte belirgin değil"
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
            f"Bulantı {nausea}/4, baş dönmesi {dizziness}/4: {verdict} (DEMO). Teşhis "
            "değildir; CO₂, enfeksiyon ve iç kulak gibi başka nedenler dışlanmamıştır."
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
            explanation="Son 24 saatte görme değişikliği sorusu yanıtlanmadı.",
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
            f"Bildirilen görme değişikliği {vision_change}/4"
            + (
                "; göz muayenesiyle değerlendirilmesi gerekir (DEMO). Teşhis değildir."
                if attention is HealthAttention.WATCH
                else "; izleme sınırının altında."
            )
        ),
        source=VISION_SOURCE,
    )
