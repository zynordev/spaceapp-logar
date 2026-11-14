from datetime import datetime, timezone
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from spaceapp_logar.rules.red_flags import RedFlag
from spaceapp_logar.schemas.observations import Identifier, SourceType
from spaceapp_logar.schemas.status import RuleStatusRead


class RedFlagOption(BaseModel):
    flag: RedFlag
    label: str


class RedFlagCreate(BaseModel):
    """A crew member reporting one or more red-flag symptoms."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mission_id: Identifier
    crew_member_id: Identifier
    flags: list[RedFlag] = Field(min_length=1, max_length=len(RedFlag))
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
    def validate_flags_and_provenance(self) -> Self:
        if len(set(self.flags)) != len(self.flags):
            raise ValueError("flags must not repeat")
        if self.source_type is SourceType.SYNTHETIC and self.scenario_id is None:
            raise ValueError("scenario_id is required for synthetic reports")
        if self.source_type is SourceType.MANUAL and self.scenario_id is not None:
            raise ValueError("scenario_id is only allowed for synthetic reports")
        return self


class RedFlagAccepted(BaseModel):
    report_id: UUID
    mission_id: str
    crew_member_id: str
    flags: list[RedFlag]
    observed_at: datetime
    evaluation: RuleStatusRead
    alert_id: UUID | None
