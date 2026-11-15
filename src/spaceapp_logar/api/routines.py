from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from spaceapp_logar.auth import User, acting_crew_member, current_user
from spaceapp_logar.db.models import RoutineCompletion, RoutineSchedule
from spaceapp_logar.db.session import get_session
from spaceapp_logar.rules.routines import ROUTINE_CATALOG
from spaceapp_logar.schemas.routines import (
    RoutineCatalogItem,
    RoutineComplete,
    RoutineCreate,
    RoutineDefaultsCreate,
    RoutineDueRead,
    RoutineScheduleRead,
)
from spaceapp_logar.services import routines as service

router = APIRouter(prefix="/v1/routines", tags=["routines"])


@router.get("/catalog", response_model=list[RoutineCatalogItem])
def routine_catalog() -> list[RoutineCatalogItem]:
    """Fixed reminder catalogue (DEMO intervals; no medication)."""

    return [
        RoutineCatalogItem(
            kind=item.kind,
            title_tr=item.title_tr,
            description_tr=item.description_tr,
            category=item.category,
            default_interval_minutes=item.default_interval_minutes,
            evidence=item.evidence,
        )
        for item in ROUTINE_CATALOG
    ]


@router.post("", response_model=RoutineScheduleRead, status_code=status.HTTP_201_CREATED)
def create_routine(
    payload: RoutineCreate,
    session: Annotated[Session, Depends(get_session)],
) -> RoutineScheduleRead:
    schedule = service.create_schedule(
        session,
        mission_id=payload.mission_id,
        crew_member_id=payload.crew_member_id,
        kind=payload.kind.value,
        interval_minutes=payload.interval_minutes,
        anchor_at=payload.anchor_at,
    )
    session.commit()
    return service.to_schedule_read(schedule)


@router.post(
    "/defaults",
    response_model=list[RoutineScheduleRead],
    status_code=status.HTTP_201_CREATED,
)
def create_default_routines(
    payload: RoutineDefaultsCreate,
    session: Annotated[Session, Depends(get_session)],
) -> list[RoutineScheduleRead]:
    """Create the whole catalogue for a crew member; idempotent per kind."""

    schedules = service.create_defaults(
        session, payload.mission_id, payload.crew_member_id
    )
    session.commit()
    return [service.to_schedule_read(schedule) for schedule in schedules]


@router.get("/due", response_model=list[RoutineDueRead])
def due_routines(
    session: Annotated[Session, Depends(get_session)],
    mission_id: Annotated[str, Query(min_length=1, max_length=100)],
    crew_member_id: Annotated[str, Query(min_length=1, max_length=100)],
    at: datetime | None = None,
) -> list[RoutineDueRead]:
    if at is not None and (at.tzinfo is None or at.utcoffset() is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "at must include a timezone"
        )
    moment = at.astimezone(timezone.utc) if at else service.utc_now()
    return service.due_list(session, mission_id, crew_member_id, moment)


@router.post(
    "/{schedule_id}/complete",
    response_model=RoutineDueRead,
    status_code=status.HTTP_201_CREATED,
)
def complete_routine(
    schedule_id: UUID,
    payload: RoutineComplete,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_user)],
) -> RoutineDueRead:
    """Record a completion; see ``services.routines`` for slot assignment."""

    schedule = session.get(RoutineSchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Routine schedule not found")
    crew_member = acting_crew_member(user, payload.crew_member_id)
    if crew_member != schedule.crew_member_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Routine belongs to another crew member",
        )
    if not schedule.active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Routine schedule is inactive")
    completed_at = payload.completed_at or service.utc_now()
    if completed_at > service.utc_now() + timedelta(minutes=5):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "completed_at must not be in the future",
        )
    session.add(
        RoutineCompletion(
            schedule_id=schedule.id,
            crew_member_id=crew_member,
            completed_at=completed_at,
            source_type="MANUAL",
        )
    )
    session.flush()
    result = service.evaluate(session, schedule, completed_at)
    session.commit()
    return result
