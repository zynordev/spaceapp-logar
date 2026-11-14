from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from spaceapp_logar.rules import AlertStatus, HealthAttention
from spaceapp_logar.schemas.action_cards import ActionCardRead
from spaceapp_logar.schemas.observations import Identifier


class AlertAcknowledge(BaseModel):
    """Crew member confirming they have seen an alert."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    crew_member_id: Identifier


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
    explanation: str | None = None
    action_card: ActionCardRead | None = None
