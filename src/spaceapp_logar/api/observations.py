from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import Observation
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas import CO2ObservationCreate, CO2ObservationRead

router = APIRouter(prefix="/v1/observations", tags=["observations"])


@router.post(
    "",
    response_model=CO2ObservationRead,
    status_code=status.HTTP_201_CREATED,
)
def create_observation(
    payload: CO2ObservationCreate,
    session: Annotated[Session, Depends(get_session)],
) -> CO2ObservationRead:
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
    session.commit()

    return CO2ObservationRead.model_validate(observation)

