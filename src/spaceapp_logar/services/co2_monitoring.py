from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import Observation
from spaceapp_logar.rules import (
    CO2Sample,
    CO2WindowAssessment,
    DataQuality,
    assess_co2_window,
)
from spaceapp_logar.rules.co2_window import co2_window_bounds
from spaceapp_logar.schemas import EnvironmentMetric


def assess_persisted_co2_window(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    as_of: datetime,
) -> CO2WindowAssessment:
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
    return assess_co2_window(samples, as_of=as_of)

