from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from spaceapp_logar.rules import DataQuality, HealthAttention


class BodyRegionRuleRead(BaseModel):
    rule_id: str
    title: str
    health_attention: HealthAttention
    data_quality: DataQuality
    explanation: str


class BodyRegionValueRead(BaseModel):
    metric: str
    label: str
    value: float
    unit: str
    observed_at: datetime


class BodyRegionRead(BaseModel):
    region: str
    label_tr: str
    description_tr: str
    attention: HealthAttention
    coverage: Literal["RULE", "DATA_ONLY", "GAP"]
    rules: list[BodyRegionRuleRead]
    metrics: list[str]
    latest_values: list[BodyRegionValueRead]
    open_alert_ids: list[UUID]


class BodyMapRead(BaseModel):
    mission_id: str
    crew_member_id: str
    generated_at: datetime
    overall_attention: HealthAttention
    regions: list[BodyRegionRead]
