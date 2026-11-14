from sqlalchemy.orm import Session

from spaceapp_logar.db.models import Observation
from spaceapp_logar.schemas.measurements import MeasurementCreate


def store_measurement(session: Session, payload: MeasurementCreate) -> Observation:
    """Append one validated measurement as an immutable raw observation."""

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
        activity_state=payload.activity_state.value if payload.activity_state else None,
    )
    session.add(observation)
    session.flush()
    return observation
