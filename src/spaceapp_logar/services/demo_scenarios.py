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

from spaceapp_logar.db.models import LabResult, SubjectiveCheckIn
from spaceapp_logar.schemas.lab_results import LabResultCreate
from spaceapp_logar.schemas.measurements import METRIC_SPECS, MeasurementCreate, Metric
from spaceapp_logar.rules.red_flags import RedFlag
from spaceapp_logar.services.ingest import store_measurement
from spaceapp_logar.services.red_flags import record_red_flags
from spaceapp_logar.services.rule_engine import evaluate_check_in, evaluate_observation

CREW = "crew-01"
HABITAT = "iss-destiny-lab"
SECOND_MODULE = "iss-harmony-node2"
SOURCE_ID = "demo-scenario-runner"


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
) -> None:
    spec = METRIC_SPECS[metric]
    default_target = CREW if spec.target_type.value == "CREW_MEMBER" else HABITAT
    plan.measurements.append(
        {
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


def _environment(plan: Plan, start: datetime, minutes: int, rng: Random, co2: Callable[[int], float]) -> None:
    for m in range(minutes):
        when = start + timedelta(minutes=m)
        _add(plan, when, Metric.CABIN_CO2_PARTIAL_PRESSURE, co2(m) + rng.gauss(0, 0.04))
        if m % 5 == 0:
            _add(plan, when, Metric.CABIN_O2_FRACTION, 21.0 + rng.gauss(0, 0.05))
            _add(plan, when, Metric.CABIN_PRESSURE, 101.3 + rng.gauss(0, 0.1))
            _add(plan, when, Metric.RADIATION_DOSE_RATE, 25.0 + rng.gauss(0, 1.5))


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
            _add(plan, when, Metric.SYSTOLIC_BP, 118 + rng.gauss(0, 3), activity=state)
            _add(plan, when, Metric.DIASTOLIC_BP, 76 + rng.gauss(0, 2), activity=state)
    _add(plan, start, Metric.SLEEP_DURATION, 6.9, activity="REST")


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

    events: list[tuple[datetime, int, dict]] = [
        (item["observed_at"], 0, item) for item in plan.measurements
    ] + [(item["observed_at"], 1, item) for item in plan.check_ins] + [
        (item["observed_at"], 2, item) for item in plan.red_flags
    ]
    events.sort(key=lambda event: (event[0], event[1]))

    for _, kind, item in events:
        if kind == 0:
            payload = MeasurementCreate(
                mission_id=mission_id,
                source_type="SYNTHETIC",
                source_id=SOURCE_ID,
                scenario_id=scenario_id,
                **item,
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
