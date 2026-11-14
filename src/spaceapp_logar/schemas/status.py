from datetime import datetime
from uuid import UUID

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


class CompletedStepRead(BaseModel):
    step_key: str
    crew_member_id: str
    done_at: datetime


class SituationRead(BaseModel):
    """Live context shown on top of an action card (facts, not advice)."""

    facts_tr: list[str]
    alert_id: UUID | None = None
    level_since: datetime | None = None
    reassess_at: datetime | None = None
    completed_steps: list[CompletedStepRead] = []


class BaselineUsedRead(BaseModel):
    """Personal baseline a rule used (or could not use) for this evaluation."""

    value: float | None
    classification: str
    status_label: str
    sample_count: int | None
    profile_version: int | None


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
    situation: SituationRead | None = None
    baseline: BaselineUsedRead | None = None


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
