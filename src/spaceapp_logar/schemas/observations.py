from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Identifier = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    ),
]


class TargetType(StrEnum):
    CREW_MEMBER = "CREW_MEMBER"
    ENVIRONMENT = "ENVIRONMENT"


class EnvironmentMetric(StrEnum):
    CABIN_CO2_PARTIAL_PRESSURE = "CABIN_CO2_PARTIAL_PRESSURE"


class MeasurementUnit(StrEnum):
    MMHG = "mmHg"


class SourceType(StrEnum):
    SENSOR = "SENSOR"
    MANUAL = "MANUAL"
    OSDR = "OSDR"
    SYNTHETIC = "SYNTHETIC"


class ReportedQuality(StrEnum):
    VALID = "VALID"
    SUSPECT = "SUSPECT"
    FAULT = "FAULT"


class CO2ObservationCreate(BaseModel):
    """Validated input contract for a cabin ppCO2 observation."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        allow_inf_nan=False,
        from_attributes=True,
    )

    mission_id: Identifier
    target_type: Literal[TargetType.ENVIRONMENT]
    target_id: Identifier
    metric: Literal[EnvironmentMetric.CABIN_CO2_PARTIAL_PRESSURE]
    value: Annotated[float, Field(ge=0)]
    unit: Literal[MeasurementUnit.MMHG]
    observed_at: datetime
    source_type: SourceType
    source_id: Identifier
    scenario_id: Identifier | None = None
    reported_quality: ReportedQuality

    @field_validator("observed_at")
    @classmethod
    def normalize_observed_at_to_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("observed_at must include a timezone")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_synthetic_provenance(self) -> Self:
        if self.source_type is SourceType.SYNTHETIC and self.scenario_id is None:
            raise ValueError("scenario_id is required for synthetic observations")
        if self.source_type is not SourceType.SYNTHETIC and self.scenario_id is not None:
            raise ValueError("scenario_id is only allowed for synthetic observations")
        return self


class CO2ObservationRead(CO2ObservationCreate):
    """Stored cabin ppCO2 observation returned by the API."""

    id: UUID
    ingested_at: datetime

    @field_validator("ingested_at")
    @classmethod
    def normalize_ingested_at_to_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("ingested_at must include a timezone")
        return value.astimezone(timezone.utc)

