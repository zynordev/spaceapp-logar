"""Crew-declared activity context (start / end / current)."""

from datetime import datetime, timezone
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from spaceapp_logar.schemas.measurements import ActivityState
from spaceapp_logar.schemas.observations import Identifier, SourceType


def _to_utc(value: datetime, name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must include a timezone")
    return value.astimezone(timezone.utc)


class ActivityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mission_id: Identifier
    crew_member_id: Identifier | None = None
    activity_state: ActivityState
    planned_minutes: Annotated[int, Field(ge=5, le=240, strict=True)]
    started_at: datetime | None = None
    source_type: Literal[SourceType.MANUAL, SourceType.SYNTHETIC] = SourceType.MANUAL
    source_id: Identifier = "dashboard-user"
    scenario_id: Identifier | None = None

    @field_validator("started_at")
    @classmethod
    def normalize_started_at(cls, value: datetime | None) -> datetime | None:
        return None if value is None else _to_utc(value, "started_at")

    @model_validator(mode="after")
    def validate_source_provenance(self) -> Self:
        if self.source_type is SourceType.SYNTHETIC and self.scenario_id is None:
            raise ValueError("scenario_id is required for synthetic declarations")
        if self.source_type is SourceType.MANUAL and self.scenario_id is not None:
            raise ValueError("scenario_id is only allowed for synthetic declarations")
        return self


class ActivityEnd(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ended_at: datetime | None = None

    @field_validator("ended_at")
    @classmethod
    def normalize_ended_at(cls, value: datetime | None) -> datetime | None:
        return None if value is None else _to_utc(value, "ended_at")


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mission_id: str
    crew_member_id: str
    activity_state: ActivityState
    started_at: datetime
    expected_end_at: datetime
    ended_at: datetime | None
    source_type: str
    source_id: str
    created_at: datetime


class ActivityCurrentRead(BaseModel):
    state: Literal["ACTIVE", "EXPIRED", "NONE"]
    activity: ActivityRead | None = None
    remaining_seconds: int | None = None
    message_tr: str
