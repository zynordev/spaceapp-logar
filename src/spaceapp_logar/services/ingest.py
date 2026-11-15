from sqlalchemy.orm import Session

from spaceapp_logar.db.models import Observation
from spaceapp_logar.schemas.measurements import MeasurementCreate
from spaceapp_logar.schemas.observations import TargetType
from spaceapp_logar.services.activities import declared_state_at


def store_measurement(session: Session, payload: MeasurementCreate) -> Observation:
    """Append one validated measurement as an immutable raw observation."""

    activity_state: str | None = None
    activity_source: str | None = None
    if payload.target_type is TargetType.CREW_MEMBER:
        if payload.activity_state is not None:
            activity_state, activity_source = payload.activity_state.value, "SENSOR"
        else:
            declared = declared_state_at(
                session, payload.mission_id, payload.target_id, payload.observed_at
            )
            if declared is not None:
                activity_state, activity_source = declared, "DECLARED"

    observation = Observation(
        mission_id=payload.mission_id,
        target_type=payload.target_type.value,
        target_id=payload.target_id,
        metric=payload.metric.value,
        value=payload.value,
        unit=payload.unit,
        observed_at=payload.observed_at,
        source_type=payload.source_type.value,
        source_id=payload.source_id,
        scenario_id=payload.scenario_id,
        reported_quality=payload.reported_quality.value,
        activity_state=activity_state,
        activity_source=activity_source,
    )
    session.add(observation)
    session.flush()
    return observation
