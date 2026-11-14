from datetime import datetime

from pydantic import BaseModel, ConfigDict

from spaceapp_logar.rules import DataQuality, HealthAttention
from spaceapp_logar.schemas.action_cards import ActionCardRead
from spaceapp_logar.schemas.check_ins import SubjectiveCheckInRead


class CO2StatusRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rule_id: str
    rule_version: int
    data_quality: DataQuality
    health_attention: HealthAttention
    observed_value: float | None
    unit: str
    threshold: float
    comparison: str
    evaluated_at: datetime
    explanation: str
    source: str
    source_uri: str
    action_card: ActionCardRead | None = None


class RuleStatusRead(BaseModel):
    """Latest result of one rule, with the metadata needed to explain it."""

    rule_id: str
    rule_version: int
    title: str
    metric: str
    related_metrics: list[str]
    target_id: str
    time_scale: str
    health_attention: HealthAttention
    data_quality: DataQuality
    observed_value: float | None
    unit: str
    threshold: float
    comparison: str
    window_minutes: int
    evaluated_at: datetime
    explanation: str
    source: str
    source_uri: str
    evidence_level: str
    validation_status: str
    action_card: ActionCardRead | None = None


class CrewStatusRead(BaseModel):
    mission_id: str
    crew_member_id: str
    environment_target_id: str | None
    generated_at: datetime
    overall_attention: HealthAttention = HealthAttention.UNKNOWN
    co2: CO2StatusRead | None
    rules: list[RuleStatusRead] = []
    latest_check_in: SubjectiveCheckInRead | None
    limitations: list[str]
