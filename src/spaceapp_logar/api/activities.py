from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from spaceapp_logar.auth import User, acting_crew_member, current_user
from spaceapp_logar.db.models import ActivityDeclaration
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas.activities import (
    ActivityCreate,
    ActivityCurrentRead,
    ActivityEnd,
    ActivityRead,
)
from spaceapp_logar.services.activities import current_activity, start_declaration

router = APIRouter(prefix="/v1/activities", tags=["activities"])


@router.post("", response_model=ActivityRead, status_code=status.HTTP_201_CREATED)
def declare_activity(
    payload: ActivityCreate,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_user)],
) -> ActivityRead:
    """Declare the activity a crew member starts; an open one ends at that moment."""

    crew_member_id = acting_crew_member(user, payload.crew_member_id)
    declaration = start_declaration(
        session,
        mission_id=payload.mission_id,
        crew_member_id=crew_member_id,
        activity_state=payload.activity_state.value,
        planned_minutes=payload.planned_minutes,
        started_at=payload.started_at or datetime.now(timezone.utc),
        source_type=payload.source_type.value,
        source_id=payload.source_id,
        scenario_id=payload.scenario_id,
    )
    session.commit()
    return ActivityRead.model_validate(declaration)


@router.get("/current", response_model=ActivityCurrentRead)
def get_current_activity(
    session: Annotated[Session, Depends(get_session)],
    mission_id: Annotated[str, Query(min_length=1, max_length=100)],
    crew_member_id: Annotated[str, Query(min_length=1, max_length=100)],
    at: datetime | None = None,
) -> ActivityCurrentRead:
    if at is not None and (at.tzinfo is None or at.utcoffset() is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "at must include a timezone")
    moment = at.astimezone(timezone.utc) if at else datetime.now(timezone.utc)
    return current_activity(session, mission_id, crew_member_id, moment)


@router.post("/{activity_id}/end", response_model=ActivityRead)
def end_activity(
    activity_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    payload: ActivityEnd | None = None,
) -> ActivityRead:
    declaration = session.get(ActivityDeclaration, activity_id)
    if declaration is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity declaration not found")
    if declaration.ended_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Activity declaration already ended")
    ended_at = (payload.ended_at if payload else None) or datetime.now(timezone.utc)
    if ended_at < declaration.started_at:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "ended_at cannot be before started_at"
        )
    declaration.ended_at = ended_at
    session.commit()
    return ActivityRead.model_validate(declaration)
