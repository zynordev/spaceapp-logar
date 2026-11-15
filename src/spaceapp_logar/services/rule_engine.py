"""Load evidence from the database, run rules, persist results and alerts."""

from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from math import isfinite
from statistics import median
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import (
    Observation,
    RuleEvaluationEvidence,
    RuleEvaluationRecord,
    SubjectiveCheckIn,
)
from spaceapp_logar.rules import select_action_card
from spaceapp_logar.rules.models import DataQuality, HealthAttention, RuleEvaluation
from spaceapp_logar.rules.expanded import (
    ATMOSPHERE_MIN_SAMPLES,
    ATMOSPHERE_WINDOW_MINUTES,
    MOTION_LOOKBACK_HOURS,
    RADIATION_MIN_SAMPLES,
    RADIATION_WINDOW_MINUTES,
    SLEEP_MIN_NIGHTS,
    SLEEP_NIGHTS,
    VISION_LOOKBACK_HOURS,
    SleepSymptoms,
    evaluate_cabin_atmosphere,
    evaluate_motion_sickness,
    evaluate_radiation,
    evaluate_sleep,
    evaluate_vision,
)
from spaceapp_logar.rules.vitals import (
    CARDIO_RESP_WINDOW_MINUTES,
    HR_JUMP_MAX_SECONDS,
    HR_JUMP_RULE_ID,
    HR_JUMP_SOURCE,
    SPO2_WINDOW_MINUTES,
    SYMPTOM_LOOKBACK_MINUTES,
    TEMP_WINDOW_MINUTES,
    DEMO_SOURCE_URI,
    SymptomContext,
    evaluate_cardio_resp,
    evaluate_hr_jump,
    evaluate_spo2,
    evaluate_temperature,
)
from spaceapp_logar.rules.windows import (
    MinuteWindow,
    WindowSample,
    aggregate_minute_window,
    window_bounds,
)
from spaceapp_logar.schemas.measurements import Metric, is_plausible
from spaceapp_logar.services.alerts import update_alert_lifecycle
from spaceapp_logar.services.baseline import BaselineProfileResult, get_personal_baseline
from spaceapp_logar.services.co2_monitoring import (
    assess_persisted_co2_window,
    persist_co2_evaluation,
)

REST_ONLY = frozenset({"REST"})
NOT_EXERCISE = frozenset({"REST", "LIGHT", "SLEEP", None})
BASELINE_SAMPLES = 60
BASELINE_MIN_SAMPLES = 30

SYMPTOM_LABELS = {
    "fatigue": "fatigue",
    "dizziness": "dizziness",
    "nausea": "nausea",
    "pain": "pain",
}


@dataclass(frozen=True, slots=True)
class RuleOutcome:
    evaluation: RuleEvaluation
    window_start: datetime
    window_end: datetime
    valid_minute_buckets: int
    required_minute_buckets: int
    longest_missing_run_minutes: int
    ignored_observations: int
    evidence_ids: list[UUID]
    baseline: BaselineProfileResult | None = None


def usable(observation: Observation, allowed_activity: frozenset | None = None) -> bool:
    return (
        observation.reported_quality == DataQuality.VALID.value
        and isfinite(observation.value)
        and is_plausible(observation.metric, observation.value)
        and (allowed_activity is None or observation.activity_state in allowed_activity)
    )


def _window(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    metric: Metric,
    as_of: datetime,
    window_minutes: int,
    allowed_activity: frozenset | None,
) -> tuple[MinuteWindow, list[UUID]]:
    start, end = window_bounds(as_of, window_minutes)
    observations = session.scalars(
        select(Observation).where(
            Observation.mission_id == mission_id,
            Observation.target_id == target_id,
            Observation.metric == metric.value,
            Observation.observed_at >= start,
            Observation.observed_at < end,
        )
    ).all()
    samples = [
        WindowSample(
            observed_at=observation.observed_at,
            value=observation.value,
            usable=usable(observation, allowed_activity),
        )
        for observation in observations
    ]
    window = aggregate_minute_window(samples, as_of=as_of, window_minutes=window_minutes)
    return window, [observation.id for observation in observations]


def personal_baseline(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    metric: Metric,
    before: datetime,
    allowed_activity: frozenset | None = None,
    min_samples: int = BASELINE_MIN_SAMPLES,
) -> float | None:
    """Compatibility wrapper: the median of an ESTABLISHED baseline, else None."""

    result = get_personal_baseline(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=metric.value,
        before=before,
        allowed_activities=allowed_activity,
        min_samples=min_samples,
    )
    return result.median if result.is_sufficient else None


def _outcome(
    evaluation: RuleEvaluation,
    window: MinuteWindow,
    evidence_ids: list[UUID],
    baseline: BaselineProfileResult | None = None,
) -> RuleOutcome:
    return RuleOutcome(
        evaluation=evaluation,
        window_start=window.window_start,
        window_end=window.window_end,
        valid_minute_buckets=window.valid_minute_buckets,
        required_minute_buckets=window.required_minute_buckets,
        longest_missing_run_minutes=window.longest_missing_run_minutes,
        ignored_observations=window.ignored_observations,
        evidence_ids=evidence_ids,
        baseline=baseline,
    )


def run_spo2(session: Session, mission_id: str, target_id: str, as_of: datetime) -> RuleOutcome:
    window, ids = _window(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=Metric.SPO2,
        as_of=as_of,
        window_minutes=SPO2_WINDOW_MINUTES,
        allowed_activity=NOT_EXERCISE,
    )
    return _outcome(evaluate_spo2(window), window, ids)


def run_temperature(
    session: Session, mission_id: str, target_id: str, as_of: datetime
) -> RuleOutcome:
    window, ids = _window(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=Metric.BODY_TEMPERATURE,
        as_of=as_of,
        window_minutes=TEMP_WINDOW_MINUTES,
        allowed_activity=None,
    )
    baseline = get_personal_baseline(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=Metric.BODY_TEMPERATURE.value,
        before=window.window_start,
    )
    usable_median = baseline.median if baseline.is_sufficient else None
    return _outcome(evaluate_temperature(window, usable_median), window, ids, baseline)


def latest_symptoms(
    session: Session, mission_id: str, crew_member_id: str, as_of: datetime
) -> SymptomContext:
    check_in = session.scalar(
        select(SubjectiveCheckIn)
        .where(
            SubjectiveCheckIn.mission_id == mission_id,
            SubjectiveCheckIn.crew_member_id == crew_member_id,
            SubjectiveCheckIn.observed_at <= as_of,
            SubjectiveCheckIn.observed_at
            >= as_of - timedelta(minutes=SYMPTOM_LOOKBACK_MINUTES),
        )
        .order_by(SubjectiveCheckIn.observed_at.desc())
        .limit(1)
    )
    if check_in is None:
        return SymptomContext(max_score=None, fields=())
    scores = {name: getattr(check_in, name) for name in SYMPTOM_LABELS}
    top = max(scores.values())
    fields = tuple(
        SYMPTOM_LABELS[name] for name, score in scores.items() if score >= 2
    )
    return SymptomContext(max_score=top, fields=fields)


def run_cardio_resp(
    session: Session, mission_id: str, target_id: str, as_of: datetime
) -> RuleOutcome:
    hr_window, hr_ids = _window(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=Metric.HEART_RATE,
        as_of=as_of,
        window_minutes=CARDIO_RESP_WINDOW_MINUTES,
        allowed_activity=REST_ONLY,
    )
    rr_window, rr_ids = _window(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=Metric.RESPIRATION_RATE,
        as_of=as_of,
        window_minutes=CARDIO_RESP_WINDOW_MINUTES,
        allowed_activity=REST_ONLY,
    )
    baseline = get_personal_baseline(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=Metric.HEART_RATE.value,
        before=hr_window.window_start,
        activity_state="REST",
    )
    usable_median = baseline.median if baseline.is_sufficient else None
    symptoms = latest_symptoms(session, mission_id, target_id, as_of)
    evaluation = evaluate_cardio_resp(hr_window, rr_window, usable_median, symptoms)
    return _outcome(evaluation, hr_window, hr_ids + rr_ids, baseline)


def run_hr_jump(session: Session, observation: Observation) -> RuleOutcome:
    as_of = observation.observed_at
    if not usable(observation):
        evaluation = RuleEvaluation(
            rule_id=HR_JUMP_RULE_ID,
            rule_version=1,
            data_quality=DataQuality.FAULT,
            health_attention=HealthAttention.UNKNOWN,
            observed_value=observation.value,
            unit="bpm",
            threshold=0.0,
            comparison="valid",
            window_minutes=2,
            explanation=(
                f"Heart rate measurement cannot be used (source quality "
                f"{observation.reported_quality}, value {observation.value:.0f} bpm). "
                "No health alarm is generated until the sensor is verified."
            ),
            source=HR_JUMP_SOURCE,
            source_uri=DEMO_SOURCE_URI,
        )
        return RuleOutcome(
            evaluation=evaluation,
            window_start=as_of - timedelta(seconds=HR_JUMP_MAX_SECONDS),
            window_end=as_of,
            valid_minute_buckets=0,
            required_minute_buckets=1,
            longest_missing_run_minutes=0,
            ignored_observations=1,
            evidence_ids=[observation.id],
        )

    previous = session.scalar(
        select(Observation)
        .where(
            Observation.mission_id == observation.mission_id,
            Observation.target_id == observation.target_id,
            Observation.metric == Metric.HEART_RATE.value,
            Observation.observed_at < as_of,
            Observation.observed_at >= as_of - timedelta(seconds=HR_JUMP_MAX_SECONDS),
            Observation.reported_quality == DataQuality.VALID.value,
        )
        .order_by(Observation.observed_at.desc())
        .limit(1)
    )
    if previous is not None and not usable(previous):
        previous = None
    seconds = (as_of - previous.observed_at).total_seconds() if previous else None
    evaluation = evaluate_hr_jump(
        previous.value if previous else None,
        observation.value,
        seconds,
    )
    evidence = [observation.id] + ([previous.id] if previous else [])
    return RuleOutcome(
        evaluation=evaluation,
        window_start=previous.observed_at if previous else as_of,
        window_end=as_of,
        valid_minute_buckets=len(evidence),
        required_minute_buckets=2,
        longest_missing_run_minutes=0,
        ignored_observations=0,
        evidence_ids=evidence,
    )


def persist_outcome(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    evaluated_at: datetime,
    outcome: RuleOutcome,
) -> RuleEvaluationRecord:
    evaluation = outcome.evaluation
    card = select_action_card(evaluation)
    record = RuleEvaluationRecord(
        mission_id=mission_id,
        target_id=target_id,
        rule_id=evaluation.rule_id,
        rule_version=evaluation.rule_version,
        evaluated_at=evaluated_at,
        data_quality=evaluation.data_quality.value,
        health_attention=evaluation.health_attention.value,
        observed_value=evaluation.observed_value,
        unit=evaluation.unit,
        threshold=evaluation.threshold,
        comparison=evaluation.comparison,
        window_minutes=evaluation.window_minutes,
        window_start=outcome.window_start,
        window_end=outcome.window_end,
        valid_minute_buckets=outcome.valid_minute_buckets,
        required_minute_buckets=outcome.required_minute_buckets,
        longest_missing_run_minutes=outcome.longest_missing_run_minutes,
        ignored_observations=outcome.ignored_observations,
        explanation=evaluation.explanation,
        source=evaluation.source,
        source_uri=evaluation.source_uri,
        action_card_id=card.card_id if card else None,
        action_card_version=card.version if card else None,
        baseline_value=outcome.baseline.median if outcome.baseline else None,
        baseline_classification=(
            outcome.baseline.classification if outcome.baseline else None
        ),
        baseline_sample_count=outcome.baseline.sample_count if outcome.baseline else None,
        baseline_profile_version=(
            outcome.baseline.profile_version if outcome.baseline else None
        ),
    )
    session.add(record)
    session.flush()
    session.add_all(
        RuleEvaluationEvidence(evaluation_id=record.id, observation_id=observation_id)
        for observation_id in dict.fromkeys(outcome.evidence_ids)
    )
    return record


# --- Coverage-expansion rules ------------------------------------------------
RADIATION_BASELINE_MIN_SAMPLES = 10
RADIATION_MAX_GAP_MINUTES = 10


def _recent_usable(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    metric: Metric,
    as_of: datetime,
    minutes: int,
) -> list[Observation]:
    rows = session.scalars(
        select(Observation)
        .where(
            Observation.mission_id == mission_id,
            Observation.target_id == target_id,
            Observation.metric == metric.value,
            Observation.observed_at > as_of - timedelta(minutes=minutes),
            Observation.observed_at <= as_of,
        )
        .order_by(Observation.observed_at)
    ).all()
    return list(rows)


def _sparse_outcome(
    evaluation: RuleEvaluation,
    as_of: datetime,
    minutes: int,
    usable_count: int,
    required: int,
    ignored: int,
    evidence: list[UUID],
) -> RuleOutcome:
    return RuleOutcome(
        evaluation=evaluation,
        window_start=as_of - timedelta(minutes=minutes),
        window_end=as_of,
        valid_minute_buckets=usable_count,
        required_minute_buckets=required,
        longest_missing_run_minutes=0,
        ignored_observations=ignored,
        evidence_ids=evidence,
    )


def run_atmosphere(
    session: Session, mission_id: str, target_id: str, as_of: datetime
) -> RuleOutcome:
    o2_rows = _recent_usable(
        session, mission_id=mission_id, target_id=target_id,
        metric=Metric.CABIN_O2_FRACTION, as_of=as_of, minutes=ATMOSPHERE_WINDOW_MINUTES,
    )
    p_rows = _recent_usable(
        session, mission_id=mission_id, target_id=target_id,
        metric=Metric.CABIN_PRESSURE, as_of=as_of, minutes=ATMOSPHERE_WINDOW_MINUTES,
    )
    o2 = [row.value for row in o2_rows if usable(row)]
    pressure = [row.value for row in p_rows if usable(row)]
    enough = len(o2) >= ATMOSPHERE_MIN_SAMPLES and len(pressure) >= ATMOSPHERE_MIN_SAMPLES
    evaluation = evaluate_cabin_atmosphere(
        sum(o2) / len(o2) if enough else None,
        sum(pressure) / len(pressure) if enough else None,
        pressure[-1] - pressure[0] if enough else None,
    )
    ignored = (len(o2_rows) - len(o2)) + (len(p_rows) - len(pressure))
    return _sparse_outcome(
        evaluation, as_of, ATMOSPHERE_WINDOW_MINUTES, min(len(o2), len(pressure)),
        ATMOSPHERE_MIN_SAMPLES, ignored, [row.id for row in o2_rows + p_rows],
    )


def cumulative_dose_msv(
    session: Session, mission_id: str, target_id: str, as_of: datetime
) -> float:
    """Integrate usable dose-rate samples (uSv/h) over time into mSv."""

    rows = [
        row
        for row in session.scalars(
            select(Observation)
            .where(
                Observation.mission_id == mission_id,
                Observation.target_id == target_id,
                Observation.metric == Metric.RADIATION_DOSE_RATE.value,
                Observation.observed_at <= as_of,
            )
            .order_by(Observation.observed_at)
        ).all()
        if usable(row)
    ]
    total_usv = 0.0
    for current, following in zip(rows, rows[1:]):
        minutes = min(
            (following.observed_at - current.observed_at).total_seconds() / 60,
            RADIATION_MAX_GAP_MINUTES,
        )
        total_usv += current.value * minutes / 60
    return total_usv / 1000


def run_radiation(
    session: Session, mission_id: str, target_id: str, as_of: datetime
) -> RuleOutcome:
    rows = _recent_usable(
        session, mission_id=mission_id, target_id=target_id,
        metric=Metric.RADIATION_DOSE_RATE, as_of=as_of, minutes=RADIATION_WINDOW_MINUTES,
    )
    values = [row.value for row in rows if usable(row)]
    recent = sum(values) / len(values) if len(values) >= RADIATION_MIN_SAMPLES else None
    baseline = get_personal_baseline(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=Metric.RADIATION_DOSE_RATE.value,
        before=as_of - timedelta(minutes=RADIATION_WINDOW_MINUTES),
        min_samples=RADIATION_BASELINE_MIN_SAMPLES,
    )
    evaluation = evaluate_radiation(
        recent,
        baseline.median if baseline.is_sufficient else None,
        cumulative_dose_msv(session, mission_id, target_id, as_of),
    )
    outcome = _sparse_outcome(
        evaluation, as_of, RADIATION_WINDOW_MINUTES, len(values),
        RADIATION_MIN_SAMPLES, len(rows) - len(values), [row.id for row in rows],
    )
    return replace(outcome, baseline=baseline)


def _latest_check_in(
    session: Session, mission_id: str, crew_member_id: str, as_of: datetime, hours: int
) -> SubjectiveCheckIn | None:
    return session.scalar(
        select(SubjectiveCheckIn)
        .where(
            SubjectiveCheckIn.mission_id == mission_id,
            SubjectiveCheckIn.crew_member_id == crew_member_id,
            SubjectiveCheckIn.observed_at <= as_of,
            SubjectiveCheckIn.observed_at >= as_of - timedelta(hours=hours),
        )
        .order_by(SubjectiveCheckIn.observed_at.desc())
        .limit(1)
    )


def run_sleep(
    session: Session, mission_id: str, target_id: str, as_of: datetime
) -> RuleOutcome | None:
    """Sleep debt; skipped (not UNKNOWN) until enough nights are recorded."""

    rows = session.scalars(
        select(Observation)
        .where(
            Observation.mission_id == mission_id,
            Observation.target_id == target_id,
            Observation.metric == Metric.SLEEP_DURATION.value,
            Observation.observed_at <= as_of,
            Observation.observed_at >= as_of - timedelta(days=SLEEP_NIGHTS + 1),
        )
        .order_by(Observation.observed_at.desc())
        .limit(SLEEP_NIGHTS)
    ).all()
    nights = [row for row in rows if usable(row)]
    if len(nights) < SLEEP_MIN_NIGHTS:
        return None
    nights.reverse()
    check_in = _latest_check_in(session, mission_id, target_id, as_of, 24)
    evaluation = evaluate_sleep(
        [row.value for row in nights],
        SleepSymptoms(
            fatigue=check_in.fatigue if check_in else None,
            mood_distress=check_in.mood_distress if check_in else None,
        ),
    )
    return _sparse_outcome(
        evaluation, as_of, SLEEP_NIGHTS * 24 * 60, len(nights), SLEEP_MIN_NIGHTS,
        len(rows) - len(nights), [row.id for row in nights],
    )


def run_motion_sickness(session: Session, check_in: SubjectiveCheckIn) -> RuleOutcome:
    evaluation = evaluate_motion_sickness(
        check_in.nausea, check_in.dizziness, check_in.observed_at
    )
    return _sparse_outcome(
        evaluation, check_in.observed_at, MOTION_LOOKBACK_HOURS * 60, 1, 1, 0, []
    )


def run_vision(session: Session, check_in: SubjectiveCheckIn) -> RuleOutcome | None:
    """Only evaluated when the vision question was answered."""

    if check_in.vision_change is None:
        return None
    return _sparse_outcome(
        evaluate_vision(check_in.vision_change),
        check_in.observed_at, VISION_LOOKBACK_HOURS * 60, 1, 1, 0, [],
    )


WindowRunner = Callable[[Session, str, str, datetime], RuleOutcome | None]

WINDOW_RULES_BY_METRIC: dict[str, tuple[WindowRunner, ...]] = {
    Metric.SPO2.value: (run_spo2,),
    Metric.BODY_TEMPERATURE.value: (run_temperature,),
    Metric.HEART_RATE.value: (run_cardio_resp,),
    Metric.RESPIRATION_RATE.value: (run_cardio_resp,),
    Metric.CABIN_O2_FRACTION.value: (run_atmosphere,),
    Metric.CABIN_PRESSURE.value: (run_atmosphere,),
    Metric.RADIATION_DOSE_RATE.value: (run_radiation,),
    Metric.SLEEP_DURATION.value: (run_sleep,),
}


def evaluate_observation(
    session: Session, observation: Observation
) -> list[RuleEvaluationRecord]:
    """Run every rule triggered by one stored observation (same transaction)."""

    records: list[RuleEvaluationRecord] = []
    if observation.metric == Metric.CABIN_CO2_PARTIAL_PRESSURE.value:
        persisted_input = assess_persisted_co2_window(
            session,
            mission_id=observation.mission_id,
            target_id=observation.target_id,
            as_of=observation.observed_at,
        )
        record = persist_co2_evaluation(
            session,
            mission_id=observation.mission_id,
            target_id=observation.target_id,
            evaluated_at=observation.observed_at,
            persisted_input=persisted_input,
        )
        update_alert_lifecycle(session, record)
        records.append(record)
        return records

    outcomes: list[RuleOutcome] = []
    if observation.metric == Metric.HEART_RATE.value:
        outcomes.append(run_hr_jump(session, observation))
    for runner in WINDOW_RULES_BY_METRIC.get(observation.metric, ()):
        outcome = runner(
            session,
            observation.mission_id,
            observation.target_id,
            observation.observed_at,
        )
        if outcome is not None:
            outcomes.append(outcome)
    for outcome in outcomes:
        record = persist_outcome(
            session,
            mission_id=observation.mission_id,
            target_id=observation.target_id,
            evaluated_at=observation.observed_at,
            outcome=outcome,
        )
        update_alert_lifecycle(session, record)
        records.append(record)
    return records


def evaluate_check_in(
    session: Session, check_in: SubjectiveCheckIn
) -> list[RuleEvaluationRecord]:
    """Run rules that read subjective input when a check-in arrives.

    Symptom-based rules (motion sickness, vision) can raise WATCH on their own.
    Measurement rules that use symptoms as context (cardio-respiratory, sleep)
    are re-run only when their measurements exist.
    """

    outcomes: list[RuleOutcome] = [run_motion_sickness(session, check_in)]
    vision = run_vision(session, check_in)
    if vision is not None:
        outcomes.append(vision)

    has_vitals = session.scalar(
        select(Observation.id)
        .where(
            Observation.mission_id == check_in.mission_id,
            Observation.target_id == check_in.crew_member_id,
            Observation.metric == Metric.HEART_RATE.value,
        )
        .limit(1)
    )
    if has_vitals is not None:
        outcomes.append(
            run_cardio_resp(
                session, check_in.mission_id, check_in.crew_member_id, check_in.observed_at
            )
        )
    sleep = run_sleep(
        session, check_in.mission_id, check_in.crew_member_id, check_in.observed_at
    )
    if sleep is not None:
        outcomes.append(sleep)

    records: list[RuleEvaluationRecord] = []
    for outcome in outcomes:
        record = persist_outcome(
            session,
            mission_id=check_in.mission_id,
            target_id=check_in.crew_member_id,
            evaluated_at=check_in.observed_at,
            outcome=outcome,
        )
        update_alert_lifecycle(session, record)
        records.append(record)
    return records
