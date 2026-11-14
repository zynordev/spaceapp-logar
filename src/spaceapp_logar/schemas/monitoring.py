from datetime import datetime

from pydantic import BaseModel, ConfigDict

from spaceapp_logar.rules import DataQuality, HealthAttention
from spaceapp_logar.schemas.action_cards import ActionCardRead
from spaceapp_logar.schemas.observations import CO2ObservationRead


class CO2WindowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    window_start: datetime
    window_end: datetime
    valid_minute_buckets: int
    required_minute_buckets: int
    longest_missing_run_minutes: int
    ignored_observations: int
    average_ppco2_mmhg: float | None
    data_quality: DataQuality


class RuleEvaluationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rule_id: str
    rule_version: int
    data_quality: DataQuality
    health_attention: HealthAttention
    observed_value: float | None
    unit: str
    threshold: float
    comparison: str
    window_minutes: int
    explanation: str
    source: str
    source_uri: str


class CO2ObservationAccepted(BaseModel):
    observation: CO2ObservationRead
    window: CO2WindowRead
    evaluation: RuleEvaluationRead
    action_card: ActionCardRead | None = None

