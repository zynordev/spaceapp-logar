"""Mission communication profiles and who answers inside the card window.

Delay figures are public NASA values (see ``source_note_tr``). The profile
only decides the ground round trip; it adds no medical thresholds.
"""

import os
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from spaceapp_logar.db.models import MissionProfile
from spaceapp_logar.schemas.mission_profiles import (
    DelayRange,
    EarthResponseRead,
    MissionProfileRead,
)

PROFILES = ("ISS", "MOON", "MARS")
FLIGHT_SURGEON = "FLIGHT_SURGEON"
CREW_MEDICAL_OFFICER = "CREW_MEDICAL_OFFICER"
OWNER_LABELS_TR = {
    FLIGHT_SURGEON: "Uçuş cerrahı (yer ekibi)",
    CREW_MEDICAL_OFFICER: "Mürettebat sağlık sorumlusu (gemide)",
}

# (label, min, typical, max one-way seconds, note)
_DEFS: dict[str, tuple[str, float, float, float, str]] = {
    "ISS": (
        "ISS (alçak Dünya yörüngesi)",
        0,
        1,
        2,
        "Yer ile neredeyse anlık iletişim; yer ekibi çoğu kart penceresinde yanıt verebilir.",
    ),
    "MOON": (
        "Ay görevi",
        1.2,
        1.3,
        1.4,
        "Tek yön gecikme yaklaşık 1,3 sn; gidiş-dönüş birkaç saniye.",
    ),
    "MARS": (
        "Mars görevi",
        182,
        750,
        1342,
        "Tek yön gecikme 3-22 dk; kısa pencerelerde yer ekibi beklenemez, "
        "karar gemide alınır.",
    ),
}
SOURCE_NOTE_TR = (
    "Gecikme değerleri NASA'nın kamuya açık bilgilerine dayanır: Ay ~1,3 sn tek yön; "
    "Mars 3-22 dk tek yön (konuma göre); ISS TDRS aktarımıyla ~1-2 sn (yaklaşık). "
    "Bu, demo bağlamıdır; gerçek bağlantı ölçümü değildir."
)


def default_profile() -> str:
    raw = os.getenv("SPACEAPP_DEFAULT_PROFILE", "").strip().upper()
    return raw if raw in PROFILES else "ISS"


def get_profile_name(session: Session, mission_id: str) -> str:
    row = session.get(MissionProfile, mission_id)
    return row.profile if row is not None else default_profile()


def set_profile(session: Session, mission_id: str, profile: str, user_id: str) -> None:
    row = session.get(MissionProfile, mission_id)
    now = datetime.now(timezone.utc)
    if row is None:
        session.add(
            MissionProfile(
                mission_id=mission_id, profile=profile, updated_at=now, updated_by=user_id
            )
        )
    else:
        row.profile = profile
        row.updated_at = now
        row.updated_by = user_id


def owner_for(round_trip_seconds: float, act_within_minutes: float) -> str:
    return FLIGHT_SURGEON if round_trip_seconds < act_within_minutes * 60 else CREW_MEDICAL_OFFICER


def profile_read(
    session: Session, mission_id: str, *, window_minutes: float = 30
) -> MissionProfileRead:
    name = get_profile_name(session, mission_id)
    label, low, typical, high, note = _DEFS[name]
    round_trip = typical * 2
    owner = owner_for(round_trip, window_minutes)
    return MissionProfileRead(
        mission_id=mission_id,
        profile=name,
        label_tr=label,
        one_way_delay_seconds=DelayRange(min=low, typical=typical, max=high),
        round_trip_typical_seconds=round_trip,
        escalation_owner=owner,
        escalation_owner_label_tr=OWNER_LABELS_TR[owner],
        note_tr=note,
        source_note_tr=SOURCE_NOTE_TR,
    )


def typical_one_way_seconds(session: Session, mission_id: str) -> float:
    return _DEFS[get_profile_name(session, mission_id)][2]


def _fmt(seconds: float) -> str:
    if seconds < 120:
        return f"{seconds:g} sn"
    return f"{seconds / 60:.0f} dk"


def earth_response(
    session: Session, mission_id: str, act_within_minutes: int
) -> EarthResponseRead:
    name = get_profile_name(session, mission_id)
    round_trip = _DEFS[name][2] * 2
    in_time = round_trip < act_within_minutes * 60
    owner = owner_for(round_trip, act_within_minutes)
    if in_time:
        note = (
            f"Yer ile gidiş-dönüş yaklaşık {_fmt(round_trip)}; kartın {act_within_minutes} dk "
            "penceresi içinde yer ekibinden yanıt alınabilir."
        )
    else:
        note = (
            f"Yer ile gidiş-dönüş yaklaşık {_fmt(round_trip)}; kartın {act_within_minutes} dk "
            "penceresi içinde yanıt beklenemez, gemideki sağlık sorumlusu yürütür."
        )
    return EarthResponseRead(
        profile=name,
        round_trip_seconds=round_trip,
        act_within_minutes=act_within_minutes,
        ground_can_respond_in_time=in_time,
        owner=owner,
        owner_label_tr=OWNER_LABELS_TR[owner],
        note_tr=note,
    )
