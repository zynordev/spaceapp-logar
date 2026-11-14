from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import Observation
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas import (
    CO2ObservationAccepted,
    CO2ObservationCreate,
    CO2ObservationRead,
    CO2WindowRead,
    RuleEvaluationRead,
)
from spaceapp_logar.services.co2_monitoring import (
    assess_persisted_co2_window,
    persist_co2_evaluation,
)

router = APIRouter(prefix="/v1/observations", tags=["observations"])


@router.post(
    "",
    response_model=CO2ObservationAccepted,
    status_code=status.HTTP_201_CREATED,
)
def create_observation(
    payload: CO2ObservationCreate,
    session: Annotated[Session, Depends(get_session)],
) -> CO2ObservationAccepted:
    """Append one validated cabin ppCO2 observation."""

    observation = Observation(
        mission_id=payload.mission_id,
        target_type=payload.target_type.value,
        target_id=payload.target_id,
        metric=payload.metric.value,
        value=payload.value,
        unit=payload.unit.value,
        observed_at=payload.observed_at,
        source_type=payload.source_type.value,
        source_id=payload.source_id,
        scenario_id=payload.scenario_id,
        reported_quality=payload.reported_quality.value,
    )
    session.add(observation)
    session.flush()

    persisted_input = assess_persisted_co2_window(
        session,
        mission_id=observation.mission_id,
        target_id=observation.target_id,
        as_of=observation.observed_at,
    )
    persist_co2_evaluation(
        session,
        mission_id=observation.mission_id,
        target_id=observation.target_id,
        evaluated_at=observation.observed_at,
        persisted_input=persisted_input,
    )
    session.commit()
    assessment = persisted_input.assessment
    return CO2ObservationAccepted(
        observation=CO2ObservationRead.model_validate(observation),
        window=CO2WindowRead.model_validate(assessment.window),
        evaluation=RuleEvaluationRead.model_validate(assessment.evaluation),
    )

