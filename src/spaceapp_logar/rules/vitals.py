"""Deterministic vital-sign rules for the hackathon demo.

IMPORTANT: every numeric threshold in this module is a DEMO threshold
(evidence class F in docs/biyo.md). Values follow widely used Earth clinical
textbook reference points, are NOT mission or flight-medicine limits and must
be validated by a flight surgeon before any real use. The rules only decide
when to re-check, watch or follow a pre-written card; they never diagnose.
"""

from dataclasses import dataclass

from spaceapp_logar.rules.models import DataQuality, HealthAttention, RuleEvaluation
from spaceapp_logar.rules.windows import MinuteWindow

DEMO_SOURCE_URI = "docs/DEMO_RULES.md"

# --- SpO2 -------------------------------------------------------------------
SPO2_RULE_ID = "VITAL_SPO2_SUSTAINED_V1"
SPO2_WINDOW_MINUTES = 10
SPO2_WATCH_BELOW = 95.0
SPO2_ALERT_BELOW = 92.0
SPO2_SOURCE = (
    "DEMO eşik (kanıt sınıfı F): genel klinik referans, SpO₂ ≥%95 olağan, "
    "<%92 belirgin düşüklük. Görev/uçuş tıbbı eşiği değildir."
)

# --- Body temperature -------------------------------------------------------
TEMP_RULE_ID = "VITAL_TEMP_TREND_V1"
TEMP_WINDOW_MINUTES = 60
TEMP_WATCH_DELTA_C = 1.0
TEMP_ALERT_ABSOLUTE_C = 38.0
TEMP_SOURCE = (
    "DEMO eşik (kanıt sınıfı F): kişisel başlangıçtan ≥+1,0 °C süreli sapma "
    "izlenir; ≥38,0 °C genel klinik ateş referansıdır. Uçuş tıbbı eşiği değildir."
)

# --- Resting heart + respiration with symptoms ------------------------------
CARDIO_RESP_RULE_ID = "MULTI_CARDIO_RESP_V1"
CARDIO_RESP_WINDOW_MINUTES = 15
HR_REST_DELTA_BPM = 20.0
RR_REST_ABOVE = 20.0
SYMPTOM_SCORE_AT_LEAST = 2
SYMPTOM_LOOKBACK_MINUTES = 120
CARDIO_RESP_SOURCE = (
    "DEMO eşik (kanıt sınıfı F): dinlenmede kişisel başlangıcın ≥20 bpm "
    "üstünde kalp hızı ve >20/dk solunum (genel klinik referans) birlikte; "
    "öznel belirti ≥2/4 ise seviye yükselir. Uçuş tıbbı eşiği değildir."
)

# --- Heart-rate data quality ------------------------------------------------
HR_JUMP_RULE_ID = "DATA_HR_JUMP_V1"
HR_JUMP_BPM = 40.0
HR_JUMP_MAX_SECONDS = 120
HR_JUMP_SOURCE = (
    "DEMO veri kalitesi kuralı (kanıt sınıfı F): iki dakika içinde >40 bpm "
    "sıçrama fiziksel olarak şüpheli kabul edilir ve sağlık alarmı üretmez."
)


def _evaluation(
    *,
    rule_id: str,
    data_quality: DataQuality,
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
        data_quality=data_quality,
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


def _insufficient(
    rule_id: str,
    unit: str,
    threshold: float,
    comparison: str,
    window: MinuteWindow,
    source: str,
    what: str,
) -> RuleEvaluation:
    return _evaluation(
        rule_id=rule_id,
        data_quality=DataQuality.MISSING,
        attention=HealthAttention.UNKNOWN,
        value=None,
        unit=unit,
        threshold=threshold,
        comparison=comparison,
        window_minutes=window.window_minutes,
        explanation=(
            f"Son {window.window_minutes} dakikada yeterli güvenilir {what} verisi yok "
            f"({window.valid_minute_buckets}/{window.required_minute_buckets} dakika, "
            f"en uzun boşluk {window.longest_missing_run_minutes} dk); "
            "sağlık dikkati değerlendirilemedi."
        ),
        source=source,
    )


def evaluate_spo2(window: MinuteWindow) -> RuleEvaluation:
    if window.average is None:
        return _insufficient(
            SPO2_RULE_ID, "%", SPO2_WATCH_BELOW, "<", window, SPO2_SOURCE,
            "dinlenme/hafif aktivite SpO₂",
        )
    mean = window.average
    if mean < SPO2_ALERT_BELOW:
        attention, threshold = HealthAttention.ALERT, SPO2_ALERT_BELOW
        text = f"belirgin düşüklük referansı %{SPO2_ALERT_BELOW:.0f} altında"
    elif mean < SPO2_WATCH_BELOW:
        attention, threshold = HealthAttention.WATCH, SPO2_WATCH_BELOW
        text = f"olağan referans %{SPO2_WATCH_BELOW:.0f} altında"
    else:
        attention, threshold = HealthAttention.NORMAL, SPO2_WATCH_BELOW
        text = f"olağan referans %{SPO2_WATCH_BELOW:.0f} ve üzerinde"
    return _evaluation(
        rule_id=SPO2_RULE_ID,
        data_quality=DataQuality.VALID,
        attention=attention,
        value=mean,
        unit="%",
        threshold=threshold,
        comparison="<",
        window_minutes=window.window_minutes,
        explanation=(
            f"Son {window.window_minutes} dakikalık dinlenme/hafif aktivite SpO₂ "
            f"ortalaması %{mean:.1f}; {text} (DEMO eşik)."
        ),
        source=SPO2_SOURCE,
    )


def evaluate_temperature(
    window: MinuteWindow,
    baseline_c: float | None,
) -> RuleEvaluation:
    if window.average is None:
        return _insufficient(
            TEMP_RULE_ID, "°C", TEMP_ALERT_ABSOLUTE_C, ">=", window, TEMP_SOURCE,
            "vücut sıcaklığı",
        )
    mean = window.average
    if mean >= TEMP_ALERT_ABSOLUTE_C:
        return _evaluation(
            rule_id=TEMP_RULE_ID,
            data_quality=DataQuality.VALID,
            attention=HealthAttention.ALERT,
            value=mean,
            unit="°C",
            threshold=TEMP_ALERT_ABSOLUTE_C,
            comparison=">=",
            window_minutes=window.window_minutes,
            explanation=(
                f"Son {window.window_minutes} dakikalık vücut sıcaklığı ortalaması "
                f"{mean:.2f} °C; genel ateş referansı {TEMP_ALERT_ABSOLUTE_C:.1f} °C "
                "ve üzerinde (DEMO eşik)."
            ),
            source=TEMP_SOURCE,
        )
    if baseline_c is None:
        return _evaluation(
            rule_id=TEMP_RULE_ID,
            data_quality=DataQuality.MISSING,
            attention=HealthAttention.UNKNOWN,
            value=mean,
            unit="°C",
            threshold=TEMP_ALERT_ABSOLUTE_C,
            comparison=">=",
            window_minutes=window.window_minutes,
            explanation=(
                f"Vücut sıcaklığı ortalaması {mean:.2f} °C; kişisel başlangıç değeri "
                "henüz oluşmadığı için eğilim değerlendirilemedi."
            ),
            source=TEMP_SOURCE,
        )
    watch_level = baseline_c + TEMP_WATCH_DELTA_C
    delta = mean - baseline_c
    attention = HealthAttention.WATCH if mean >= watch_level else HealthAttention.NORMAL
    verdict = "üzerinde" if attention is HealthAttention.WATCH else "altında"
    return _evaluation(
        rule_id=TEMP_RULE_ID,
        data_quality=DataQuality.VALID,
        attention=attention,
        value=mean,
        unit="°C",
        threshold=round(watch_level, 2),
        comparison=">=",
        window_minutes=window.window_minutes,
        explanation=(
            f"Son {window.window_minutes} dakikalık ortalama {mean:.2f} °C; kişisel "
            f"başlangıç {baseline_c:.2f} °C (fark {delta:+.2f} °C). İzleme sınırı "
            f"+{TEMP_WATCH_DELTA_C:.1f} °C'nin {verdict} (DEMO eşik)."
        ),
        source=TEMP_SOURCE,
    )


@dataclass(frozen=True, slots=True)
class SymptomContext:
    """Highest relevant subjective score from the latest recent check-in."""

    max_score: int | None
    fields: tuple[str, ...]


def evaluate_cardio_resp(
    hr_window: MinuteWindow,
    rr_window: MinuteWindow,
    hr_baseline_bpm: float | None,
    symptoms: SymptomContext,
) -> RuleEvaluation:
    if hr_window.average is None or rr_window.average is None:
        missing = hr_window if hr_window.average is None else rr_window
        return _insufficient(
            CARDIO_RESP_RULE_ID, "bpm", HR_REST_DELTA_BPM, ">=", missing,
            CARDIO_RESP_SOURCE, "dinlenme kalp/solunum",
        )
    hr = hr_window.average
    rr = rr_window.average
    if hr_baseline_bpm is None:
        return _evaluation(
            rule_id=CARDIO_RESP_RULE_ID,
            data_quality=DataQuality.MISSING,
            attention=HealthAttention.UNKNOWN,
            value=hr,
            unit="bpm",
            threshold=HR_REST_DELTA_BPM,
            comparison=">=",
            window_minutes=hr_window.window_minutes,
            explanation=(
                f"Dinlenme kalp hızı {hr:.0f} bpm, solunum {rr:.0f}/dk; kişisel "
                "dinlenme başlangıcı henüz oluşmadığı için değerlendirilemedi."
            ),
            source=CARDIO_RESP_SOURCE,
        )
    hr_limit = hr_baseline_bpm + HR_REST_DELTA_BPM
    hr_high = hr >= hr_limit
    rr_high = rr > RR_REST_ABOVE
    symptomatic = (
        symptoms.max_score is not None
        and symptoms.max_score >= SYMPTOM_SCORE_AT_LEAST
    )
    if hr_high and rr_high and symptomatic:
        attention = HealthAttention.ALERT
        verdict = (
            "kalp ve solunum hızı birlikte yüksek ve öznel belirti "
            f"({', '.join(symptoms.fields)}) ≥{SYMPTOM_SCORE_AT_LEAST}/4"
        )
    elif hr_high and rr_high:
        attention = HealthAttention.WATCH
        verdict = "kalp ve solunum hızı birlikte yüksek; belirgin öznel belirti yok"
    else:
        attention = HealthAttention.NORMAL
        verdict = "birlikte yükselme koşulu yok"
    return _evaluation(
        rule_id=CARDIO_RESP_RULE_ID,
        data_quality=DataQuality.VALID,
        attention=attention,
        value=hr,
        unit="bpm",
        threshold=round(hr_limit, 1),
        comparison=">=",
        window_minutes=hr_window.window_minutes,
        explanation=(
            f"Son {hr_window.window_minutes} dk dinlenme: kalp hızı {hr:.0f} bpm "
            f"(kişisel başlangıç {hr_baseline_bpm:.0f}, sınır {hr_limit:.0f}), solunum "
            f"{rr:.0f}/dk (sınır >{RR_REST_ABOVE:.0f}); {verdict} (DEMO eşik)."
        ),
        source=CARDIO_RESP_SOURCE,
    )


def evaluate_hr_jump(
    previous_bpm: float | None,
    latest_bpm: float,
    seconds_between: float | None,
) -> RuleEvaluation:
    comparable = (
        previous_bpm is not None
        and seconds_between is not None
        and 0 <= seconds_between <= HR_JUMP_MAX_SECONDS
    )
    jump = abs(latest_bpm - previous_bpm) if comparable and previous_bpm is not None else None
    if jump is not None and jump > HR_JUMP_BPM:
        return _evaluation(
            rule_id=HR_JUMP_RULE_ID,
            data_quality=DataQuality.SUSPECT,
            attention=HealthAttention.UNKNOWN,
            value=latest_bpm,
            unit="bpm",
            threshold=HR_JUMP_BPM,
            comparison="jump>",
            window_minutes=2,
            explanation=(
                f"Kalp hızı {previous_bpm:.0f} → {latest_bpm:.0f} bpm "
                f"({seconds_between:.0f} sn içinde {jump:.0f} bpm sıçrama); fiziksel "
                "olarak şüpheli. Sensör doğrulanmadan sağlık alarmı üretilmez."
            ),
            source=HR_JUMP_SOURCE,
        )
    return _evaluation(
        rule_id=HR_JUMP_RULE_ID,
        data_quality=DataQuality.VALID,
        attention=HealthAttention.NORMAL,
        value=latest_bpm,
        unit="bpm",
        threshold=HR_JUMP_BPM,
        comparison="jump>",
        window_minutes=2,
        explanation=(
            "Kalp hızı sinyalinde fiziksel olarak şüpheli sıçrama yok."
            if jump is not None
            else "Karşılaştırılacak yakın tarihli önceki ölçüm yok; sıçrama denetimi geçildi."
        ),
        source=HR_JUMP_SOURCE,
    )
