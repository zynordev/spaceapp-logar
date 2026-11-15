from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from spaceapp_logar.auth import Role, User, current_user, require_role
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas.mission_profiles import MissionProfileCreate, MissionProfileRead
from spaceapp_logar.schemas.observations import Identifier
from spaceapp_logar.services import mission_profiles

router = APIRouter(prefix="/v1/missions", tags=["mission-profiles"])

MissionId = Annotated[Identifier, Path()]


@router.get("/{mission_id}/profile", response_model=MissionProfileRead)
def get_mission_profile(
    mission_id: MissionId, session: Annotated[Session, Depends(get_session)]
) -> MissionProfileRead:
    return mission_profiles.profile_read(session, mission_id)


@router.post("/{mission_id}/profile", response_model=MissionProfileRead)
def set_mission_profile(
    mission_id: MissionId,
    payload: MissionProfileCreate,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_user)],
) -> MissionProfileRead:
    require_role(user, Role.CREW_MEDICAL_OFFICER, Role.GROUND)
    mission_profiles.set_profile(session, mission_id, payload.profile, user.user_id)
    session.commit()
    return mission_profiles.profile_read(session, mission_id)
