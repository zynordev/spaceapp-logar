"""Routine reminders: due state and compliance streaks.

Slots fall every ``interval_minutes`` from ``anchor_at`` (slot k opens at
``anchor_at + k * interval``). A slot is *completed* when a completion is
assigned to it; the window of slot k is ``[slot_k, slot_k + interval)``.

Assignment rule: a completion at time ``c`` fills the slot j whose window
contains it; if that slot is already filled the completion fills nothing (it
is still stored). Completing before the schedule's first slot opens
(``c < anchor``, at most one interval early) counts for slot 0, the upcoming
slot; no other early completion is credited to a future slot.
A slot whose window closed unfilled is *missed* and breaks the streak.

``next_due_at`` is the slot after the last filled slot (slot 0 when nothing is
filled). State at ``at``: UPCOMING before ``next_due_at``; DUE within
``interval/4`` after it; OVERDUE later. Streaks count consecutive filled slots
going back from the latest slot; a currently open, still unfilled slot is not
yet a miss.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import RoutineCompletion, RoutineSchedule
from spaceapp_logar.rules.routines import ROUTINE_CATALOG, get_routine
from spaceapp_logar.schemas.routines import RoutineDueRead, RoutineScheduleRead

_STATE_ORDER = {"OVERDUE": 0, "DUE": 1, "UPCOMING": 2}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_schedule_read(schedule: RoutineSchedule) -> RoutineScheduleRead:
    return RoutineScheduleRead(
        id=schedule.id,
        mission_id=schedule.mission_id,
        crew_member_id=schedule.crew_member_id,
        kind=schedule.kind,
        title_tr=get_routine(schedule.kind).title_tr,
        interval_minutes=schedule.interval_minutes,
        anchor_at=schedule.anchor_at,
        active=schedule.active,
        created_at=schedule.created_at,
    )


def create_schedule(
    session: Session,
    *,
    mission_id: str,
    crew_member_id: str,
    kind: str,
    interval_minutes: int | None = None,
    anchor_at: datetime | None = None,
) -> RoutineSchedule:
    """Create a schedule; any older active one of the same kind is retired."""

    definition = get_routine(kind)
    for old in _active_schedules(session, mission_id, crew_member_id, kind):
        old.active = False
    schedule = RoutineSchedule(
        mission_id=mission_id,
        crew_member_id=crew_member_id,
        kind=definition.kind.value,
        interval_minutes=interval_minutes or definition.default_interval_minutes,
        anchor_at=anchor_at or utc_now(),
        active=True,
    )
    session.add(schedule)
    session.flush()
    return schedule


def create_defaults(
    session: Session, mission_id: str, crew_member_id: str
) -> list[RoutineSchedule]:
    """One active schedule per catalogue kind; existing ones are reused."""

    anchor = utc_now()
    result = []
    for definition in ROUTINE_CATALOG:
        existing = _active_schedules(
            session, mission_id, crew_member_id, definition.kind.value
        )
        if existing:
            result.append(existing[0])
            continue
        schedule = RoutineSchedule(
            mission_id=mission_id,
            crew_member_id=crew_member_id,
            kind=definition.kind.value,
            interval_minutes=definition.default_interval_minutes,
            anchor_at=anchor,
            active=True,
        )
        session.add(schedule)
        result.append(schedule)
    session.flush()
    return result


def _active_schedules(
    session: Session, mission_id: str, crew_member_id: str, kind: str
) -> list[RoutineSchedule]:
    return list(
        session.scalars(
            select(RoutineSchedule)
            .where(
                RoutineSchedule.mission_id == mission_id,
                RoutineSchedule.crew_member_id == crew_member_id,
                RoutineSchedule.kind == str(kind),
                RoutineSchedule.active.is_(True),
            )
            .order_by(RoutineSchedule.created_at, RoutineSchedule.id)
        )
    )


def filled_slots(
    schedule: RoutineSchedule, completions: list[datetime]
) -> set[int]:
    """Slot indexes filled by the given completion times (see module docs)."""

    interval = timedelta(minutes=schedule.interval_minutes)
    anchor = schedule.anchor_at
    filled: set[int] = set()
    for completed_at in sorted(completions):
        if completed_at < anchor:
            # Early: counts for the upcoming slot 0, at most one interval ahead.
            if anchor - completed_at <= interval:
                filled.add(0)
            continue
        filled.add(int((completed_at - anchor) // interval))
    return filled


def _streaks(
    schedule: RoutineSchedule, filled: set[int], at: datetime
) -> tuple[int, int]:
    if not filled:
        return 0, 0
    best = run = 0
    for k in range(min(filled), max(filled) + 1):
        run = run + 1 if k in filled else 0
        best = max(best, run)
    interval = timedelta(minutes=schedule.interval_minutes)
    latest = max(int((at - schedule.anchor_at) // interval), max(filled))
    if latest not in filled:
        latest -= 1  # open slot, not a miss yet
    current = 0
    while latest in filled:
        current += 1
        latest -= 1
    return current, best


def evaluate(
    session: Session, schedule: RoutineSchedule, at: datetime
) -> RoutineDueRead:
    times = list(
        session.scalars(
            select(RoutineCompletion.completed_at).where(
                RoutineCompletion.schedule_id == schedule.id,
                RoutineCompletion.completed_at <= at,
            )
        )
    )
    interval = timedelta(minutes=schedule.interval_minutes)
    filled = filled_slots(schedule, times)
    next_slot = (max(filled) + 1) if filled else 0
    next_due_at = schedule.anchor_at + next_slot * interval
    if at < next_due_at:
        state = "UPCOMING"
    elif at < next_due_at + interval / 4:
        state = "DUE"
    else:
        state = "OVERDUE"
    current, best = _streaks(schedule, filled, at)
    return RoutineDueRead(
        schedule=to_schedule_read(schedule),
        state=state,
        next_due_at=next_due_at,
        last_completed_at=max(times) if times else None,
        current_streak=current,
        best_streak=best,
    )


def due_list(
    session: Session, mission_id: str, crew_member_id: str, at: datetime
) -> list[RoutineDueRead]:
    schedules = session.scalars(
        select(RoutineSchedule).where(
            RoutineSchedule.mission_id == mission_id,
            RoutineSchedule.crew_member_id == crew_member_id,
            RoutineSchedule.active.is_(True),
        )
    )
    items = [evaluate(session, schedule, at) for schedule in schedules]
    items.sort(key=lambda item: (_STATE_ORDER[item.state], item.next_due_at))
    return items
