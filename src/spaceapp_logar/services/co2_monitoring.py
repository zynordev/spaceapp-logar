from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import (
    Observation,
    RuleEvaluationEvidence,
    RuleEvaluationRecord,
)
from spaceapp_logar.rules import (
    CO2Sample,
    CO2WindowAssessment,
    DataQuality,
    assess_co2_window,
)
from spaceapp_logar.rules.co2_window import co2_window_bounds
from spaceapp_logar.schemas import EnvironmentMetric


@dataclass(frozen=True, slots=True)
class PersistedCO2AssessmentInput:
    assessment: CO2WindowAssessment
    evidence_observation_ids: list[UUID]


def assess_persisted_co2_window(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    as_of: datetime,
) -> PersistedCO2AssessmentInput:
    """Load the relevant raw observations and run the CO2 window assessment."""

    window_start, window_end = co2_window_bounds(as_of)
    observations = session.scalars(
        select(Observation).where(
            Observation.mission_id == mission_id,
            Observation.target_id == target_id,
            Observation.metric
            == EnvironmentMetric.CABIN_CO2_PARTIAL_PRESSURE.value,
            Observation.observed_at >= window_start,
            Observation.observed_at < window_end,
        )
    ).all()

    samples = [
        CO2Sample(
            observed_at=observation.observed_at,
            ppco2_mmhg=observation.value,
            data_quality=DataQuality(observation.reported_quality),
        )
        for observation in observations
    ]
    return PersistedCO2AssessmentInput(
        assessment=assess_co2_window(samples, as_of=as_of),
        evidence_observation_ids=[observation.id for observation in observations],
    )


def persist_co2_evaluation(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    evaluated_at: datetime,
    persisted_input: PersistedCO2AssessmentInput,
) -> RuleEvaluationRecord:
    assessment = persisted_input.assessment
    evaluation = assessment.evaluation
    window = assessment.window
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
        window_start=window.window_start,
        window_end=window.window_end,
        valid_minute_buckets=window.valid_minute_buckets,
        required_minute_buckets=window.required_minute_buckets,
        longest_missing_run_minutes=window.longest_missing_run_minutes,
        ignored_observations=window.ignored_observations,
        explanation=evaluation.explanation,
        source=evaluation.source,
        source_uri=evaluation.source_uri,
    )
    session.add(record)
    session.flush()
    session.add_all(
        RuleEvaluationEvidence(
            evaluation_id=record.id,
            observation_id=observation_id,
        )
        for observation_id in persisted_input.evidence_observation_ids
    )
    return record

