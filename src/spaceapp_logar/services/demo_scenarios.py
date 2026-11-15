"""Synthetic, clearly labelled demo scenarios.

Every generated record has ``source_type=SYNTHETIC`` and a ``scenario_id``.
Each run writes into a new mission id, so running again never deletes or
changes earlier data. The timeline ends at the current minute so live
check-ins from the dashboard line up with the scenario.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from random import Random
from uuid import uuid4

from sqlalchemy.orm import Session

from spaceapp_logar.db.models import EnvironmentContext, LabResult, SubjectiveCheckIn
from spaceapp_logar.schemas.lab_results import LabResultCreate
from spaceapp_logar.schemas.measurements import METRIC_SPECS, MeasurementCreate, Metric
from spaceapp_logar.rules.red_flags import RedFlag
from spaceapp_logar.services.ingest import store_measurement
from spaceapp_logar.services.red_flags import record_red_flags
from spaceapp_logar.services.rule_engine import evaluate_check_in, evaluate_observation
from spaceapp_logar.services.space_weather import (
    GOES_10_MEV_SEP_ID,
    GOES_100_MEV_SEP_ID,
    PROVENANCE_NOTE_TR,
    load_sep_catalog,
)

CREW = "crew-01"
HABITAT = "iss-destiny-lab"
SECOND_MODULE = "iss-harmony-node2"
SOURCE_ID = "demo-scenario-runner"
# Radiation observations carry this source_id: synthetic dose values whose
# event timing comes from the real NASA DONKI record (see PROVENANCE_NOTE_TR).
RADIATION_SOURCE_ID = "demo-scenario-runner-donki-timing"

# Radiation scenario time mapping (documented in docs/DEMO_RULES.md):
#   scenario minute 100  <->  real GOES-P SEISS >10 MeV onset (2024-05-10T13:35Z)
#   real time is compressed by REAL_MINUTES_PER_SCENARIO_MINUTE, so the real
#   >100 MeV onset (2024-05-11T02:10Z, 755 real minutes later) lands at
#   scenario minute 100 + 755 / 37.75 = 120.
RADIATION_ONSET_MINUTE = 100
REAL_MINUTES_PER_SCENARIO_MINUTE = 37.75


def radiation_anchor_minutes() -> tuple[int, int]:
    """Scenario minutes of the real GOES >10 MeV and >100 MeV onsets."""

    catalog = load_sep_catalog("2024-05")
    onset_10 = catalog.event(GOES_10_MEV_SEP_ID).event_time
    onset_100 = catalog.event(GOES_100_MEV_SEP_ID).event_time
    real_gap_minutes = (onset_100 - onset_10).total_seconds() / 60
    step = RADIATION_ONSET_MINUTE + round(real_gap_minutes / REAL_MINUTES_PER_SCENARIO_MINUTE)
    return RADIATION_ONSET_MINUTE, step


@dataclass
class Plan:
    """Everything a scenario will post, in time order."""

    measurements: list[dict] = field(default_factory=list)
    check_ins: list[dict] = field(default_factory=list)
    labs: list[dict] = field(default_factory=list)
    red_flags: list[dict] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class Scenario:
    scenario_id: str
    title: str
    time_scale: str
    description: str
    expected: tuple[str, ...]
    duration_minutes: int
    build: Callable[[datetime, Random], Plan]


def _ramp(minute: int, start: int, end: int, a: float, b: float) -> float:
    if minute <= start:
        return a
    if minute >= end:
        return b
    return a + (b - a) * (minute - start) / (end - start)


def _add(
    plan: Plan,
    when: datetime,
    metric: Metric,
    value: float,
    *,
    quality: str = "VALID",
    activity: str | None = None,
    target: str | None = None,
    source_id: str | None = None,
) -> None:
    spec = METRIC_SPECS[metric]
    default_target = CREW if spec.target_type.value == "CREW_MEMBER" else HABITAT
    extra = {"source_id": source_id} if source_id else {}
    plan.measurements.append(
        {
            **extra,
            "target_type": spec.target_type.value,
            "target_id": target or default_target,
            "metric": metric.value,
            "value": round(value, 2),
            "unit": spec.unit,
            "observed_at": when,
            "reported_quality": quality,
            "activity_state": activity,
        }
    )


def _environment(
    plan: Plan,
    start: datetime,
    minutes: int,
    rng: Random,
    co2: Callable[[int], float],
    *,
    o2: Callable[[int], float] = lambda m: 21.0,
    pressure: Callable[[int], float] = lambda m: 101.3,
    radiation: Callable[[int], float] = lambda m: 25.0,
    atmosphere_every: int = 5,
    radiation_every: int = 5,
    radiation_source_id: str | None = None,
) -> None:
    for m in range(minutes):
        when = start + timedelta(minutes=m)
        _add(plan, when, Metric.CABIN_CO2_PARTIAL_PRESSURE, co2(m) + rng.gauss(0, 0.04))
        if m % atmosphere_every == 0:
            _add(plan, when, Metric.CABIN_O2_FRACTION, o2(m) + rng.gauss(0, 0.05))
            _add(plan, when, Metric.CABIN_PRESSURE, pressure(m) + rng.gauss(0, 0.1))
        if m % radiation_every == 0:
            rate = radiation(m)
            _add(
                plan,
                when,
                Metric.RADIATION_DOSE_RATE,
                max(0.0, rate + rng.gauss(0, rate * 0.05)),
                source_id=radiation_source_id,
            )


def _vitals(
    plan: Plan,
    start: datetime,
    minutes: int,
    rng: Random,
    *,
    hr: Callable[[int], float],
    rr: Callable[[int], float],
    spo2: Callable[[int], float],
    temp: Callable[[int], float],
    activity: Callable[[int], str] = lambda m: "REST",
    spo2_quality: Callable[[int], str] = lambda m: "VALID",
    nights_h: tuple[float, ...] = (6.9,),
) -> None:
    for m in range(minutes):
        when = start + timedelta(minutes=m)
        state = activity(m)
        _add(plan, when, Metric.HEART_RATE, hr(m) + rng.gauss(0, 1.5), activity=state)
        _add(plan, when, Metric.RESPIRATION_RATE, rr(m) + rng.gauss(0, 0.5), activity=state)
        _add(
            plan,
            when,
            Metric.SPO2,
            min(100.0, spo2(m) + rng.gauss(0, 0.3)),
            activity=state,
            quality=spo2_quality(m),
        )
        _add(plan, when, Metric.BODY_TEMPERATURE, temp(m) + rng.gauss(0, 0.04), activity=state)
        if m % 30 == 0:
            # Synthetic HRV (data only; no rule reads it); varies with activity.
            hrv = {"EXERCISE": 22.0, "SLEEP": 62.0}.get(state, 45.0)
            # Separate deterministic stream so other metrics' noise is unchanged.
            hrv_noise = Random(f"hrv:{start.isoformat()}:{m}").gauss(0, 4)
            _add(plan, when, Metric.HRV_RMSSD, hrv + hrv_noise, activity=state)
            _add(plan, when, Metric.SYSTOLIC_BP, 118 + rng.gauss(0, 3), activity=state)
            _add(plan, when, Metric.DIASTOLIC_BP, 76 + rng.gauss(0, 2), activity=state)
    # One sleep record per night; the last night ends at the scenario start.
    for index, hours in enumerate(nights_h):
        night = start - timedelta(days=len(nights_h) - 1 - index)
        _add(plan, night, Metric.SLEEP_DURATION, hours, activity="REST")


def _check_in(plan: Plan, when: datetime, **scores: int) -> None:
    base = {"fatigue": 0, "dizziness": 0, "nausea": 0, "pain": 0, "mood_distress": 0}
    base.update(scores)
    plan.check_ins.append({"observed_at": when, **base})


def _lab(
    plan: Plan,
    when: datetime,
    analyte: str,
    value: float,
    unit: str,
    low: float,
    high: float,
    phase: str,
) -> None:
    plan.labs.append(
        {
            "analyte": analyte,
            "value": value,
            "unit": unit,
            "reference_low": low,
            "reference_high": high,
            "phase": phase,
            "sampled_at": when,
        }
    )


def _standard_labs(plan: Plan, end: datetime, *, wbc_in_flight: float = 6.4) -> None:
    pre = end - timedelta(days=30)
    mid = end - timedelta(hours=2)
    _lab(plan, pre, "GLUCOSE", 88, "mg/dL", 70, 99, "PRE_FLIGHT")
    _lab(plan, mid, "GLUCOSE", 94, "mg/dL", 70, 99, "IN_FLIGHT")
    _lab(plan, pre, "SODIUM", 140, "mmol/L", 135, 145, "PRE_FLIGHT")
    _lab(plan, mid, "SODIUM", 138, "mmol/L", 135, 145, "IN_FLIGHT")
    _lab(plan, pre, "POTASSIUM", 4.2, "mmol/L", 3.5, 5.1, "PRE_FLIGHT")
    _lab(plan, mid, "POTASSIUM", 4.0, "mmol/L", 3.5, 5.1, "IN_FLIGHT")
    _lab(plan, pre, "WBC", 6.1, "10^3/uL", 4.0, 11.0, "PRE_FLIGHT")
    _lab(plan, mid, "WBC", wbc_in_flight, "10^3/uL", 4.0, 11.0, "IN_FLIGHT")
    _lab(plan, pre, "HEMOGLOBIN", 14.6, "g/dL", 13.2, 16.6, "PRE_FLIGHT")
    _lab(plan, mid, "HEMOGLOBIN", 14.1, "g/dL", 13.2, 16.6, "IN_FLIGHT")


def build_co2_headache(start: datetime, rng: Random) -> Plan:
    minutes = 180
    plan = Plan()
    _environment(plan, start, minutes, rng, co2=lambda m: _ramp(m, 60, 75, 2.2, 3.6))
    # A second, well-ventilated module stays nominal: the rise is local.
    for m in range(minutes):
        _add(
            plan,
            start + timedelta(minutes=m),
            Metric.CABIN_CO2_PARTIAL_PRESSURE,
            2.3 + rng.gauss(0, 0.04),
            target=SECOND_MODULE,
        )

    def exercising(m: int) -> bool:
        return 20 <= m < 35

    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: 122 if exercising(m) else 68,
        rr=lambda m: 24 if exercising(m) else 14,
        spo2=lambda m: 97.0 if exercising(m) else 98.0,
        temp=lambda m: 36.7,
        activity=lambda m: "EXERCISE" if exercising(m) else "REST",
    )
    _check_in(plan, start + timedelta(minutes=150), fatigue=1, pain=2, mood_distress=1)
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


def build_fever_trend(start: datetime, rng: Random) -> Plan:
    minutes = 240
    plan = Plan()
    _environment(plan, start, minutes, rng, co2=lambda m: 2.2)
    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: _ramp(m, 90, 150, 66, 95),
        rr=lambda m: _ramp(m, 90, 150, 14, 23),
        spo2=lambda m: _ramp(m, 90, 150, 98.0, 96.5),
        temp=lambda m: _ramp(m, 90, 150, 36.7, 38.4),
    )
    _check_in(plan, start + timedelta(minutes=60), fatigue=0)
    _check_in(
        plan,
        start + timedelta(minutes=200),
        fatigue=3,
        dizziness=1,
        nausea=1,
        pain=1,
        mood_distress=1,
    )
    _standard_labs(plan, start + timedelta(minutes=minutes), wbc_in_flight=11.8)
    return plan


def build_spo2_drop(start: datetime, rng: Random) -> Plan:
    minutes = 90
    plan = Plan()
    _environment(plan, start, minutes, rng, co2=lambda m: 2.3)

    def spo2(m: int) -> float:
        if m < 60:
            return 98.0
        if m < 70:
            return _ramp(m, 60, 70, 98.0, 93.5)
        if m < 78:
            return 93.5
        return 90.5

    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: _ramp(m, 60, 85, 70, 84),
        rr=lambda m: _ramp(m, 60, 85, 14, 19),
        spo2=spo2,
        temp=lambda m: 36.6,
    )
    _check_in(plan, start + timedelta(minutes=80), fatigue=1, dizziness=2)
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


def build_sensor_fault(start: datetime, rng: Random) -> Plan:
    minutes = 120
    plan = Plan()
    _environment(plan, start, minutes, rng, co2=lambda m: 2.2)
    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: 165 if m == minutes - 1 else 70,
        rr=lambda m: 14,
        spo2=lambda m: 72.0 if m >= 105 else 98.0,
        temp=lambda m: 36.7,
        spo2_quality=lambda m: "FAULT" if m >= 105 else "VALID",
    )
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


def build_chest_pain(start: datetime, rng: Random) -> Plan:
    minutes = 90
    plan = Plan()
    _environment(plan, start, minutes, rng, co2=lambda m: 2.2)
    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: 74,
        rr=lambda m: 15,
        spo2=lambda m: 98.0,
        temp=lambda m: 36.7,
    )
    plan.red_flags.append(
        {"observed_at": start + timedelta(minutes=80), "flags": [RedFlag.CHEST_PAIN]}
    )
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


def build_cabin_o2_drop(start: datetime, rng: Random) -> Plan:
    minutes = 90
    plan = Plan()
    _environment(
        plan,
        start,
        minutes,
        rng,
        co2=lambda m: 2.3,
        o2=lambda m: _ramp(m, 40, 80, 21.0, 16.0),
        pressure=lambda m: _ramp(m, 40, 85, 101.3, 96.0),
        atmosphere_every=1,
    )
    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: _ramp(m, 50, 85, 70, 82),
        rr=lambda m: _ramp(m, 50, 85, 14, 18),
        spo2=lambda m: _ramp(m, 50, 85, 98.0, 93.8),
        temp=lambda m: 36.7,
    )
    _check_in(plan, start + timedelta(minutes=75), fatigue=1, dizziness=2, pain=1)
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


def build_radiation_spe(start: datetime, rng: Random) -> Plan:
    minutes = 180

    # Timing is anchored to the real NASA DONKI GOES >10 MeV / >100 MeV onsets
    # (see radiation_anchor_minutes). The dose values themselves are synthetic.
    onset_10, onset_100 = radiation_anchor_minutes()
    step = onset_100 - onset_10

    def rate(m: int) -> float:
        if m < onset_10:
            return 25.0
        if m < onset_100:
            return _ramp(m, onset_10, onset_100, 25.0, 90.0)
        if m < onset_100 + step:
            return _ramp(m, onset_100, onset_100 + step, 90.0, 400.0)
        return 400.0

    plan = Plan()
    _environment(
        plan,
        start,
        minutes,
        rng,
        co2=lambda m: 2.2,
        radiation=rate,
        radiation_every=1,
        radiation_source_id=RADIATION_SOURCE_ID,
    )
    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: 70,
        rr=lambda m: 14,
        spo2=lambda m: 98.0,
        temp=lambda m: 36.7,
    )
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


def build_sleep_debt(start: datetime, rng: Random) -> Plan:
    minutes = 120
    plan = Plan()
    _environment(plan, start, minutes, rng, co2=lambda m: 2.3)
    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: 74,
        rr=lambda m: 15,
        spo2=lambda m: 98.0,
        temp=lambda m: 36.7,
        nights_h=(5.4, 4.6, 4.3),
    )
    _check_in(plan, start + timedelta(minutes=60), fatigue=3, mood_distress=3, pain=1)
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


def build_gravity_adaptation(start: datetime, rng: Random) -> Plan:
    minutes = 120
    plan = Plan()
    _environment(plan, start, minutes, rng, co2=lambda m: 2.4)
    _vitals(
        plan,
        start,
        minutes,
        rng,
        hr=lambda m: 76,
        rr=lambda m: 15,
        spo2=lambda m: 98.0,
        temp=lambda m: 36.7,
    )
    _check_in(
        plan, start + timedelta(minutes=30),
        nausea=2, dizziness=2, congestion=2, back_pain=2, vision_change=0,
    )
    _check_in(
        plan, start + timedelta(minutes=100),
        fatigue=2, nausea=3, dizziness=3, congestion=3, back_pain=3, vision_change=2,
    )
    _standard_labs(plan, start + timedelta(minutes=minutes))
    return plan


SCENARIOS: dict[str, Scenario] = {
    scenario.scenario_id: scenario
    for scenario in (
        Scenario(
            scenario_id="co2-headache",
            title="Kabin CO₂ yükselmesi + baş ağrısı",
            time_scale="acute",
            description=(
                "Destiny modülünde CO₂ bir saat boyunca nominal sınırın üzerine çıkar; "
                "Harmony modülü normal kalır (yerel birikim). Astronot hafif baş ağrısı "
                "bildirir. Arada yapılan egzersiz, bağlam sayesinde "
                "alarm üretmez."
            ),
            expected=(
                "CO₂ kuralı WATCH ve onaylı CO₂ eylem kartı",
                "Açık CO₂ alarmı; vital kurallar normal",
                "Egzersiz sırasındaki yüksek kalp hızı alarm üretmez (dinlenme bağlamı)",
            ),
            duration_minutes=180,
            build=build_co2_headache,
        ),
        Scenario(
            scenario_id="fever-trend",
            title="Saatler içinde sıcaklık, kalp ve solunum artışı",
            time_scale="subacute",
            description=(
                "Vücut sıcaklığı kişisel başlangıçtan yükselir; dinlenme kalp ve "
                "solunum hızı birlikte artar. Öznel yorgunluk girildiğinde seviye "
                "yükselir. Teşhis konmaz."
            ),
            expected=(
                "Sıcaklık eğilimi önce WATCH, sonra ALERT (DEMO eşik)",
                "Kalp + solunum kuralı WATCH; öznel belirti sonrası ALERT",
                "Lab kartında WBC uçuş öncesine göre artış (yalnızca bilgi)",
            ),
            duration_minutes=240,
            build=build_fever_trend,
        ),
        Scenario(
            scenario_id="spo2-drop",
            title="Dinlenmede SpO₂ düşüşü",
            time_scale="acute",
            description=(
                "Dinlenmedeki SpO₂ önce olağan referansın, sonra belirgin düşüklük "
                "referansının altına iner; astronot baş dönmesi bildirir."
            ),
            expected=(
                "SpO₂ kuralı önce WATCH, sonra ALERT (DEMO eşik)",
                "Kart önce sensör yerleşimini doğrulatır, sonra dinlenme ve bildirim",
            ),
            duration_minutes=90,
            build=build_spo2_drop,
        ),
        Scenario(
            scenario_id="sensor-fault",
            title="Sensör arızası: kötü veri ≠ normal sağlık",
            time_scale="acute",
            description=(
                "SpO₂ sensörü arıza bildirir ve kalp hızında fiziksel olarak "
                "şüpheli bir sıçrama olur. Sistem sağlık alarmı üretmez, durumu "
                "'bilinmiyor' olarak gösterir ve sensör kontrol kartı açar."
            ),
            expected=(
                "SpO₂ UNKNOWN (veri yetersiz); sağlık alarmı yok",
                "Kalp hızı veri kalitesi SUSPECT + sensör kontrol kartı",
                "Genel durum UNKNOWN; yeşil gösterilmez",
            ),
            duration_minutes=120,
            build=build_sensor_fault,
        ),
        Scenario(
            scenario_id="chest-pain-red-flag",
            title="Kırmızı bayrak: ölçümler normalken göğüs ağrısı",
            time_scale="acute",
            description=(
                "Tüm ölçümler normal seyrederken astronot göğüs ağrısı bildirir. "
                "Normal ölçümler ciddi bir olayı dışlamadığı için sistem hiçbir "
                "ortalamayı beklemeden en üst seviyeye çıkar ve acil kartı açar. "
                "Teşhis konmaz; alarmı ekip üyesi değerlendirip kapatır."
            ),
            expected=(
                "Kırmızı bayrak kuralı CRITICAL + acil eylem kartı",
                "Vital kurallar normal kalırken genel durum Kritik",
                "Alarm ölçümlerle kendiliğinden kapanmaz; 'Değerlendirildi, kapat' gerekir",
            ),
            duration_minutes=90,
            build=build_chest_pain,
        ),
        Scenario(
            scenario_id="cabin-o2-drop",
            title="Kabin O₂ ve basınç düşüşü",
            time_scale="acute",
            description=(
                "Kabin O₂ oranı ve toplam basınç yavaşça düşer (olası kaçak). Sistem "
                "O₂ kısmi basıncını hesaplar; ekibin SpO₂'si de düşmeye başlar, "
                "astronot baş dönmesi bildirir."
            ),
            expected=(
                "Kabin O₂ kısmi basıncı önce İzle, sonra Uyarı (DEMO eşik)",
                "SpO₂ kuralı İzle; iki kural aynı nedeni farklı açılardan gösterir",
                "Kart ekibi uyarmayı ve atmosfer prosedürünü öne alır",
            ),
            duration_minutes=90,
            build=build_cabin_o2_drop,
        ),
        Scenario(
            scenario_id="radiation-spe",
            title="Güneş parçacık olayı: doz hızında ani artış",
            time_scale="acute",
            description=(
                "Modülün doz hızı önce birkaç kat, sonra onlarca kat artar. Sistem "
                "modülün kendi başlangıcına göre değerlendirir ve görev boyunca "
                "kümülatif dozu hesaplar. " + PROVENANCE_NOTE_TR
            ),
            expected=(
                PROVENANCE_NOTE_TR,
                "Radyasyon kuralı önce İzle, sonra Uyarı (DEMO eşik)",
                "Kart korunaklı bölüme geçiş prosedürünü ve EVA'nın durdurulmasını öne alır",
                "Açıklamada kümülatif doz ve 600 mSv kariyer sınırı bağlamı",
            ),
            duration_minutes=180,
            build=build_radiation_spe,
        ),
        Scenario(
            scenario_id="sleep-debt",
            title="Birikmiş uyku borcu ve yorgunluk",
            time_scale="subacute",
            description=(
                "Son üç gece kısa uyunmuştur. Astronot yüksek yorgunluk ve ruh hali "
                "sıkıntısı bildirince seviye yükselir."
            ),
            expected=(
                "Uyku kuralı önce İzle, öznel kayıttan sonra Uyarı (DEMO eşik)",
                "Kart kritik görevlerin ekip sağlık sorumlusuyla değerlendirilmesini önerir",
            ),
            duration_minutes=120,
            build=build_sleep_debt,
        ),
        Scenario(
            scenario_id="gravity-adaptation",
            title="Yerçekimi geçişi sonrası uyum: bulantı, baş dönmesi, görme",
            time_scale="acute",
            description=(
                "Yeni bir yerçekimi ortamına geçişten sonra astronot bulantı, baş "
                "dönmesi, burun tıkanıklığı ve sırt ağrısı bildirir; ikinci kayıtta "
                "görme değişikliği de ekler."
            ),
            expected=(
                "Hareket hastalığı örüntüsü İzle (DEMO)",
                "Görme değişikliği İzle: SANS izlemi kartı (DEMO)",
                "Sırt ağrısı ve burun tıkanıklığı kayıtlı, kural yok (risk haritasında 'sadece veri')",
            ),
            duration_minutes=120,
            build=build_gravity_adaptation,
        ),
    )
}


@dataclass(frozen=True, slots=True)
class ScenarioRun:
    mission_id: str
    crew_member_id: str
    environment_target_id: str
    scenario_id: str
    observations_posted: int
    check_ins_posted: int
    lab_results_posted: int


def run_scenario(
    session: Session,
    scenario_id: str,
    *,
    now: datetime | None = None,
    seed: int = 7,
) -> ScenarioRun:
    scenario = SCENARIOS[scenario_id]
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    end = current.replace(second=0, microsecond=0)
    start = end - timedelta(minutes=scenario.duration_minutes - 1)
    mission_id = f"demo-{scenario_id}-{current:%Y%m%dT%H%M%S}-{uuid4().hex[:4]}"
    plan = scenario.build(start, Random(seed))

    # Synthetic missions run on an ISS-like station. The context starts before
    # the earliest record (sleep history), so the mission day is derived from it.
    session.add(
        EnvironmentContext(
            mission_id=mission_id,
            location="ISS",
            gravity_g=0.0,
            eva_state="NONE",
            communication_delay_seconds=1.0,
            expected_metrics=sorted({item["metric"] for item in plan.measurements}),
            sensor_set=["demo-wearable-01", "demo-cabin-sensors-01"],
            effective_at=start - timedelta(days=3),
            source_type="SYNTHETIC",
            source_id=SOURCE_ID,
        )
    )
    session.flush()

    events: list[tuple[datetime, int, dict]] = [
        (item["observed_at"], 0, item) for item in plan.measurements
    ] + [(item["observed_at"], 1, item) for item in plan.check_ins] + [
        (item["observed_at"], 2, item) for item in plan.red_flags
    ]
    events.sort(key=lambda event: (event[0], event[1]))

    for _, kind, item in events:
        if kind == 0:
            fields = {"source_id": SOURCE_ID, **item}
            payload = MeasurementCreate(
                mission_id=mission_id,
                source_type="SYNTHETIC",
                scenario_id=scenario_id,
                **fields,
            )
            observation = store_measurement(session, payload)
            evaluate_observation(session, observation)
        elif kind == 2:
            record_red_flags(
                session,
                mission_id=mission_id,
                crew_member_id=CREW,
                flags=item["flags"],
                observed_at=item["observed_at"],
                source_type="SYNTHETIC",
                source_id=SOURCE_ID,
                scenario_id=scenario_id,
            )
        else:
            check_in = SubjectiveCheckIn(
                mission_id=mission_id,
                crew_member_id=CREW,
                source_type="SYNTHETIC",
                source_id=SOURCE_ID,
                scenario_id=scenario_id,
                **item,
            )
            session.add(check_in)
            session.flush()
            evaluate_check_in(session, check_in)

    for item in plan.labs:
        lab = LabResultCreate(
            mission_id=mission_id,
            crew_member_id=CREW,
            source_type="SYNTHETIC",
            source_id=SOURCE_ID,
            scenario_id=scenario_id,
            **item,
        )
        session.add(
            LabResult(
                mission_id=lab.mission_id,
                crew_member_id=lab.crew_member_id,
                analyte=lab.analyte.value,
                value=lab.value,
                unit=lab.unit.value,
                reference_low=lab.reference_low,
                reference_high=lab.reference_high,
                phase=lab.phase.value,
                sampled_at=lab.sampled_at,
                source_type=lab.source_type.value,
                source_id=lab.source_id,
                scenario_id=lab.scenario_id,
            )
        )
    session.commit()
    return ScenarioRun(
        mission_id=mission_id,
        crew_member_id=CREW,
        environment_target_id=HABITAT,
        scenario_id=scenario_id,
        observations_posted=len(plan.measurements),
        check_ins_posted=len(plan.check_ins),
        lab_results_posted=len(plan.labs),
    )
