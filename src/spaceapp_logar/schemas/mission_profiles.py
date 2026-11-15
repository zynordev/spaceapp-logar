from typing import Literal

from pydantic import BaseModel, ConfigDict

ProfileName = Literal["ISS", "MOON", "MARS"]
OwnerName = Literal["FLIGHT_SURGEON", "CREW_MEDICAL_OFFICER"]


class DelayRange(BaseModel):
    min: int | float
    typical: int | float
    max: int | float


class MissionProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile: ProfileName


class MissionProfileRead(BaseModel):
    mission_id: str
    profile: ProfileName
    label_tr: str
    one_way_delay_seconds: DelayRange
    round_trip_typical_seconds: int | float
    escalation_owner: OwnerName
    escalation_owner_label_tr: str
    note_tr: str
    source_note_tr: str


class EarthResponseRead(BaseModel):
    """Can the ground answer inside the card's time window? (neutral fact)"""

    profile: ProfileName
    round_trip_seconds: int | float
    act_within_minutes: int
    ground_can_respond_in_time: bool
    owner: OwnerName
    owner_label_tr: str
    note_tr: str
