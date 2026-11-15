from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from spaceapp_logar.rules.routines import (
    MAX_INTERVAL_MINUTES,
    MIN_INTERVAL_MINUTES,
    RoutineCategory,
    RoutineKind,
)
from spaceapp_logar.schemas.observations import Identifier

IntervalMinutes = Annotated[
    int, Field(ge=MIN_INTERVAL_MINUTES, le=MAX_INTERVAL_MINUTES, strict=True)
]


def _require_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamp must include a timezone")
    return value.astimezone(timezone.utc)


class RoutineCatalogItem(BaseModel):
    kind: RoutineKind
    title_tr: str
    description_tr: str
    category: RoutineCategory
    default_interval_minutes: int
    evidence: Literal["DEMO"]


class RoutineCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mission_id: Identifier
    crew_member_id: Identifier
    kind: RoutineKind
    interval_minutes: IntervalMinutes | None = None
    anchor_at: datetime | None = None

    @field_validator("anchor_at")
    @classmethod
    def anchor_utc(cls, value: datetime | None) -> datetime | None:
        return _require_utc(value)


class RoutineDefaultsCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mission_id: Identifier
    crew_member_id: Identifier


class RoutineComplete(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    crew_member_id: Identifier | None = None
    completed_at: datetime | None = None

    @field_validator("completed_at")
    @classmethod
    def completed_utc(cls, value: datetime | None) -> datetime | None:
        return _require_utc(value)


class RoutineScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mission_id: str
    crew_member_id: str
    kind: RoutineKind
    title_tr: str
    interval_minutes: int
    anchor_at: datetime
    active: bool
    created_at: datetime


class RoutineDueRead(BaseModel):
    schedule: RoutineScheduleRead
    state: Literal["UPCOMING", "DUE", "OVERDUE"]
    next_due_at: datetime
    last_completed_at: datetime | None
    current_streak: int
    best_streak: int
