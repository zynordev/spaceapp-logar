from datetime import datetime

from pydantic import BaseModel, ConfigDict

from spaceapp_logar.rules import DataQuality, HealthAttention
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


class CrewStatusRead(BaseModel):
    mission_id: str
    crew_member_id: str
    environment_target_id: str
    generated_at: datetime
    co2: CO2StatusRead | None
    latest_check_in: SubjectiveCheckInRead | None
    limitations: list[str]

