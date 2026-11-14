from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from spaceapp_logar.rules import AlertStatus, HealthAttention
from spaceapp_logar.schemas.action_cards import ActionCardRead
from spaceapp_logar.schemas.observations import Identifier


class AlertAcknowledge(BaseModel):
    """Crew member confirming they have seen (or closing) an alert.

    With a bearer token the actor is the token's user and crew_member_id is
    ignored; without one (demo mode) crew_member_id is required.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    crew_member_id: Identifier | None = None


class AlertStepDone(BaseModel):
    """Crew member marking one step of the alert's current card as done.

    crew_member_id follows the same rule as AlertAcknowledge.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    crew_member_id: Identifier | None = None
    step_key: Identifier


class AlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mission_id: str
    target_id: str
    rule_id: str
    status: AlertStatus
    health_attention: HealthAttention
    opened_at: datetime
    last_evaluated_at: datetime
    acknowledged_at: datetime | None
    acknowledged_by: str | None
    resolved_at: datetime | None
    opened_evaluation_id: UUID
    last_evaluation_id: UUID
    resolved_evaluation_id: UUID | None
    resolved_by: str | None = None
    manual_resolution: bool = False
    completed_step_keys: list[str] = []
    explanation: str | None = None
    action_card: ActionCardRead | None = None
