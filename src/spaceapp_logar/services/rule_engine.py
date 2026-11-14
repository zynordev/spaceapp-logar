"""Load evidence from the database, run rules, persist results and alerts."""

from collections.abc import Callable
from dataclasses import dataclass
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
from spaceapp_logar.services.co2_monitoring import (
    assess_persisted_co2_window,
    persist_co2_evaluation,
)

REST_ONLY = frozenset({"REST"})
NOT_EXERCISE = frozenset({"REST", "LIGHT", "SLEEP", None})
BASELINE_SAMPLES = 60
BASELINE_MIN_SAMPLES = 30

SYMPTOM_LABELS = {
    "fatigue": "yorgunluk",
    "dizziness": "baş dönmesi",
    "nausea": "bulantı",
    "pain": "ağrı",
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
) -> float | None:
    """Median of the earliest usable samples of the mission (DEMO policy).

    The baseline only uses data recorded before the evaluated window, so the
    current deviation can never become its own "normal".
    """

    observations = session.scalars(
        select(Observation)
        .where(
            Observation.mission_id == mission_id,
            Observation.target_id == target_id,
            Observation.metric == metric.value,
            Observation.observed_at < before,
        )
        .order_by(Observation.observed_at.asc())
        .limit(BASELINE_SAMPLES * 4)
    ).all()
    values = [o.value for o in observations if usable(o, allowed_activity)][
        :BASELINE_SAMPLES
    ]
    if len(values) < BASELINE_MIN_SAMPLES:
        return None
    return float(median(values))


def _outcome(
    evaluation: RuleEvaluation,
    window: MinuteWindow,
    evidence_ids: list[UUID],
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
    baseline = personal_baseline(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=Metric.BODY_TEMPERATURE,
        before=window.window_start,
    )
    return _outcome(evaluate_temperature(window, baseline), window, ids)


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
    baseline = personal_baseline(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=Metric.HEART_RATE,
        before=hr_window.window_start,
        allowed_activity=REST_ONLY,
    )
    symptoms = latest_symptoms(session, mission_id, target_id, as_of)
    evaluation = evaluate_cardio_resp(hr_window, rr_window, baseline, symptoms)
    return _outcome(evaluation, hr_window, hr_ids + rr_ids)


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
                f"Kalp hızı ölçümü kullanılamaz (kaynak kalitesi "
                f"{observation.reported_quality}, değer {observation.value:.0f} bpm). "
                "Sensör doğrulanmadan sağlık alarmı üretilmez."
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
    )
    session.add(record)
    session.flush()
    session.add_all(
        RuleEvaluationEvidence(evaluation_id=record.id, observation_id=observation_id)
        for observation_id in dict.fromkeys(outcome.evidence_ids)
    )
    return record


WindowRunner = Callable[[Session, str, str, datetime], RuleOutcome]

WINDOW_RULES_BY_METRIC: dict[str, tuple[WindowRunner, ...]] = {
    Metric.SPO2.value: (run_spo2,),
    Metric.BODY_TEMPERATURE.value: (run_temperature,),
    Metric.HEART_RATE.value: (run_cardio_resp,),
    Metric.RESPIRATION_RATE.value: (run_cardio_resp,),
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
        outcomes.append(
            runner(
                session,
                observation.mission_id,
                observation.target_id,
                observation.observed_at,
            )
        )
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
    """Re-run rules that read subjective context when a check-in arrives."""

    has_vitals = session.scalar(
        select(Observation.id)
        .where(
            Observation.mission_id == check_in.mission_id,
            Observation.target_id == check_in.crew_member_id,
            Observation.metric == Metric.HEART_RATE.value,
        )
        .limit(1)
    )
    if has_vitals is None:
        return []
    outcome = run_cardio_resp(
        session, check_in.mission_id, check_in.crew_member_id, check_in.observed_at
    )
    record = persist_outcome(
        session,
        mission_id=check_in.mission_id,
        target_id=check_in.crew_member_id,
        evaluated_at=check_in.observed_at,
        outcome=outcome,
    )
    update_alert_lifecycle(session, record)
    return [record]
