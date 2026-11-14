from datetime import datetime, timezone
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from spaceapp_logar.schemas.observations import Identifier, SourceType

SubjectiveScore = Annotated[int, Field(ge=0, le=4, strict=True)]


class SubjectiveCheckInCreate(BaseModel):
    """Five separate subjective inputs reported by a crew member."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        from_attributes=True,
    )

    mission_id: Identifier
    crew_member_id: Identifier
    fatigue: SubjectiveScore
    dizziness: SubjectiveScore
    nausea: SubjectiveScore
    pain: SubjectiveScore
    mood_distress: SubjectiveScore
    observed_at: datetime
    source_type: Literal[SourceType.MANUAL, SourceType.SYNTHETIC]
    source_id: Identifier
    scenario_id: Identifier | None = None

    @field_validator("observed_at")
    @classmethod
    def normalize_observed_at_to_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("observed_at must include a timezone")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_source_provenance(self) -> Self:
        if self.source_type is SourceType.SYNTHETIC and self.scenario_id is None:
            raise ValueError("scenario_id is required for synthetic check-ins")
        if self.source_type is SourceType.MANUAL and self.scenario_id is not None:
            raise ValueError("scenario_id is only allowed for synthetic check-ins")
        return self


class SubjectiveCheckInRead(SubjectiveCheckInCreate):
    id: UUID
    ingested_at: datetime

    @field_validator("ingested_at")
    @classmethod
    def normalize_ingested_at_to_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("ingested_at must include a timezone")
        return value.astimezone(timezone.utc)

