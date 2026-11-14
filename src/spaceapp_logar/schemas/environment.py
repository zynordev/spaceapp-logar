"""Mission environment context (where the crew is and under which conditions)."""

from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from spaceapp_logar.schemas.measurements import Metric
from spaceapp_logar.schemas.observations import Identifier, SourceType


class Location(StrEnum):
    EARTH = "EARTH"
    ISS = "ISS"
    TRANSIT_VEHICLE = "TRANSIT_VEHICLE"
    LUNAR_HABITAT = "LUNAR_HABITAT"
    MARS_HABITAT = "MARS_HABITAT"
    EVA = "EVA"


class EvaState(StrEnum):
    NONE = "NONE"
    PREBREATHE = "PREBREATHE"
    ACTIVE = "ACTIVE"
    POST_EVA = "POST_EVA"


SensorName = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9._:-]+$")]


class EnvironmentContextCreate(BaseModel):
    """A change of environment, effective from ``effective_at`` (append-only)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mission_id: Identifier
    location: Location
    gravity_g: Annotated[float, Field(ge=0, le=3, allow_inf_nan=False)]
    eva_state: EvaState = EvaState.NONE
    communication_delay_seconds: Annotated[float, Field(ge=0, le=3600, allow_inf_nan=False)]
    expected_metrics: list[Metric] = Field(default_factory=list, max_length=len(Metric))
    sensor_set: list[SensorName] = Field(default_factory=list, max_length=50)
    effective_at: datetime
    source_type: SourceType = SourceType.MANUAL
    source_id: Identifier = "mission-config"

    @field_validator("effective_at")
    @classmethod
    def normalize_effective_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("effective_at must include a timezone")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_eva(self) -> Self:
        if self.location is Location.EVA and self.eva_state is EvaState.NONE:
            raise ValueError("location EVA requires an eva_state other than NONE")
        if len(set(self.expected_metrics)) != len(self.expected_metrics):
            raise ValueError("expected_metrics must not repeat")
        return self


class EnvironmentContextRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mission_id: str
    location: Location
    gravity_g: float
    eva_state: EvaState
    communication_delay_seconds: float
    expected_metrics: list[str]
    sensor_set: list[str]
    effective_at: datetime
    source_type: str
    source_id: str
    created_at: datetime


class CurrentEnvironmentRead(BaseModel):
    mission_id: str
    at: datetime
    mission_started_at: datetime | None
    mission_day: int | None
    context: EnvironmentContextRead | None
