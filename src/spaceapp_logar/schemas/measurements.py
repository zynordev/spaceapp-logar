"""Generic measurement contract for all vital and environment metrics."""

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from spaceapp_logar.schemas.observations import (
    Identifier,
    ReportedQuality,
    SourceType,
    TargetType,
)


class Metric(StrEnum):
    HEART_RATE = "HEART_RATE"
    HRV_RMSSD = "HRV_RMSSD"
    SPO2 = "SPO2"
    RESPIRATION_RATE = "RESPIRATION_RATE"
    BODY_TEMPERATURE = "BODY_TEMPERATURE"
    SYSTOLIC_BP = "SYSTOLIC_BP"
    DIASTOLIC_BP = "DIASTOLIC_BP"
    SLEEP_DURATION = "SLEEP_DURATION"
    CABIN_CO2_PARTIAL_PRESSURE = "CABIN_CO2_PARTIAL_PRESSURE"
    CABIN_O2_FRACTION = "CABIN_O2_FRACTION"
    CABIN_PRESSURE = "CABIN_PRESSURE"
    RADIATION_DOSE_RATE = "RADIATION_DOSE_RATE"


class ActivityState(StrEnum):
    REST = "REST"
    LIGHT = "LIGHT"
    EXERCISE = "EXERCISE"
    SLEEP = "SLEEP"


@dataclass(frozen=True, slots=True)
class MetricSpec:
    metric: Metric
    label: str
    unit: str
    target_type: TargetType
    category: str
    plausible_min: float
    plausible_max: float


# Plausible ranges are physical sanity limits for sensor-fault detection, not
# health thresholds. Values outside them are stored but never used by rules.
METRIC_SPECS: dict[Metric, MetricSpec] = {
    spec.metric: spec
    for spec in (
        MetricSpec(Metric.HEART_RATE, "Kalp hızı", "bpm", TargetType.CREW_MEMBER, "vital", 20, 250),
        MetricSpec(Metric.HRV_RMSSD, "Kalp hızı değişkenliği (RMSSD)", "ms", TargetType.CREW_MEMBER, "vital", 5, 300),
        MetricSpec(Metric.SPO2, "SpO₂", "%", TargetType.CREW_MEMBER, "vital", 50, 100),
        MetricSpec(Metric.RESPIRATION_RATE, "Solunum hızı", "breaths/min", TargetType.CREW_MEMBER, "vital", 2, 70),
        MetricSpec(Metric.BODY_TEMPERATURE, "Vücut sıcaklığı", "°C", TargetType.CREW_MEMBER, "vital", 30, 43),
        MetricSpec(Metric.SYSTOLIC_BP, "Sistolik tansiyon", "mmHg", TargetType.CREW_MEMBER, "vital", 50, 260),
        MetricSpec(Metric.DIASTOLIC_BP, "Diyastolik tansiyon", "mmHg", TargetType.CREW_MEMBER, "vital", 25, 160),
        MetricSpec(Metric.SLEEP_DURATION, "Uyku süresi", "h", TargetType.CREW_MEMBER, "vital", 0, 24),
        MetricSpec(Metric.CABIN_CO2_PARTIAL_PRESSURE, "Kabin CO₂", "mmHg", TargetType.ENVIRONMENT, "environment", 0, 60),
        MetricSpec(Metric.CABIN_O2_FRACTION, "Kabin O₂", "%", TargetType.ENVIRONMENT, "environment", 0, 100),
        MetricSpec(Metric.CABIN_PRESSURE, "Kabin basıncı", "kPa", TargetType.ENVIRONMENT, "environment", 0, 120),
        MetricSpec(Metric.RADIATION_DOSE_RATE, "Radyasyon doz hızı", "uSv/h", TargetType.ENVIRONMENT, "environment", 0, 100000),
    )
}


def is_plausible(metric: str, value: float) -> bool:
    try:
        spec = METRIC_SPECS[Metric(metric)]
    except ValueError:
        return True
    return spec.plausible_min <= value <= spec.plausible_max


class MeasurementCreate(BaseModel):
    """Validated input for one vital or environment measurement."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        allow_inf_nan=False,
        from_attributes=True,
    )

    mission_id: Identifier
    target_type: TargetType
    target_id: Identifier
    metric: Metric
    value: float
    unit: str
    observed_at: datetime
    source_type: SourceType
    source_id: Identifier
    scenario_id: Identifier | None = None
    reported_quality: ReportedQuality
    activity_state: ActivityState | None = None

    @field_validator("observed_at")
    @classmethod
    def normalize_observed_at_to_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("observed_at must include a timezone")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_metric_contract(self) -> Self:
        spec = METRIC_SPECS[self.metric]
        if self.unit != spec.unit:
            raise ValueError(f"{self.metric.value} must use unit {spec.unit}")
        if self.target_type is not spec.target_type:
            raise ValueError(
                f"{self.metric.value} must target {spec.target_type.value}"
            )
        if self.activity_state is not None and self.target_type is not TargetType.CREW_MEMBER:
            raise ValueError("activity_state is only allowed for crew measurements")
        if self.source_type is SourceType.SYNTHETIC and self.scenario_id is None:
            raise ValueError("scenario_id is required for synthetic measurements")
        if self.source_type is not SourceType.SYNTHETIC and self.scenario_id is not None:
            raise ValueError("scenario_id is only allowed for synthetic measurements")
        return self


class MeasurementRead(MeasurementCreate):
    id: UUID
    ingested_at: datetime

    @field_validator("ingested_at")
    @classmethod
    def normalize_ingested_at_to_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("ingested_at must include a timezone")
        return value.astimezone(timezone.utc)


class MetricRead(BaseModel):
    metric: Metric
    label: str
    unit: str
    target_type: TargetType
    category: str
    plausible_min: float
    plausible_max: float


class MeasurementPoint(BaseModel):
    observed_at: datetime
    value: float
    reported_quality: str
    activity_state: str | None
    activity_source: str | None = None


class MeasurementSeriesRead(BaseModel):
    metric: Metric
    unit: str
    target_id: str
    points: list[MeasurementPoint]


class TrendBucket(BaseModel):
    start: datetime
    end: datetime
    count: int
    mean: float
    min: float
    max: float


class MeasurementTrendRead(BaseModel):
    """Per-bucket aggregates over VALID, finite, plausible observations only."""

    mission_id: str
    target_id: str
    metric: Metric
    unit: str
    bucket: str
    since: datetime
    until: datetime
    buckets: list[TrendBucket]


class MissionRead(BaseModel):
    mission_id: str
    scenario_id: str | None
    last_observed_at: datetime
    crew_member_ids: list[str]
    environment_target_ids: list[str]


Limit = Annotated[int, Field(ge=1, le=2000)]
