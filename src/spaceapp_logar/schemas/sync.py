from datetime import datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from spaceapp_logar.schemas.observations import Identifier


class Recipient(StrEnum):
    FLIGHT_SURGEON = "FLIGHT_SURGEON"
    LIFE_SUPPORT = "LIFE_SUPPORT"
    RADIATION = "RADIATION"
    MISSION_CONTROL = "MISSION_CONTROL"


class SyncItemKind(StrEnum):
    ALERT = "ALERT"
    RULE_EVALUATION = "RULE_EVALUATION"
    CHECK_IN = "CHECK_IN"
    LAB_RESULT = "LAB_RESULT"
    RED_FLAG = "RED_FLAG"
    TREND = "TREND"
    ESCALATION = "ESCALATION"


class SyncItem(BaseModel):
    kind: SyncItemKind
    id: str
    occurred_at: datetime
    summary_tr: str
    data: dict[str, Any]


class SyncPacketRead(BaseModel):
    packet_id: UUID
    mission_id: str
    recipient: Recipient
    generated_at: datetime
    since: datetime | None
    until: datetime
    item_count: int
    items: list[SyncItem]
    sha256: str
    signature: str | None
    signature_alg: Literal["HMAC-SHA256"] | None


class RecipientStatus(BaseModel):
    recipient: Recipient
    label_tr: str
    pending_items: int
    last_ack_at: datetime | None
    last_packet_id: UUID | None


class SyncStatusRead(BaseModel):
    mission_id: str
    generated_at: datetime
    link_delay_seconds: int | None
    profile: str
    recipients: list[RecipientStatus]
    pending_escalations: int


class SyncAckCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mission_id: Identifier
    recipient: Recipient
    packet_id: UUID
    sha256: str = Field(min_length=64, max_length=64)
    until: AwareDatetime


class SyncAckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mission_id: str
    recipient: Recipient
    packet_id: UUID
    sha256: str
    until: datetime
    acked_at: datetime
    acked_by: str


class EscalationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mission_id: str
    alert_id: UUID
    crew_member_id: str | None
    priority: Literal["ALERT", "CRITICAL"]
    status: Literal["PENDING", "ACKED"]
    created_at: datetime
    acked_at: datetime | None
    summary_tr: str
    packet_sha256: str
