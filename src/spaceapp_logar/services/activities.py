"""Crew activity declarations: lifecycle, current context, measurement stamping."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import ActivityDeclaration
from spaceapp_logar.schemas.activities import ActivityCurrentRead, ActivityRead

MESSAGES_TR = {
    "NONE": "Aktif bir aktivite beyanı yok — aktivite bağlamı bilinmiyor.",
    "EXPIRED": "Beyan edilen süre doldu — aktivite bağlamı bilinmiyor.",
}


def start_declaration(
    session: Session,
    *,
    mission_id: str,
    crew_member_id: str,
    activity_state: str,
    planned_minutes: int,
    started_at: datetime,
    source_type: str,
    source_id: str,
    scenario_id: str | None,
) -> ActivityDeclaration:
    """Create a declaration and end the crew member's still-open ones at its start."""

    open_ones = session.scalars(
        select(ActivityDeclaration).where(
            ActivityDeclaration.mission_id == mission_id,
            ActivityDeclaration.crew_member_id == crew_member_id,
            ActivityDeclaration.ended_at.is_(None),
            ActivityDeclaration.started_at <= started_at,
        )
    ).all()
    for previous in open_ones:
        previous.ended_at = started_at
    declaration = ActivityDeclaration(
        mission_id=mission_id,
        crew_member_id=crew_member_id,
        activity_state=activity_state,
        started_at=started_at,
        expected_end_at=started_at + timedelta(minutes=planned_minutes),
        source_type=source_type,
        source_id=source_id,
        scenario_id=scenario_id,
    )
    session.add(declaration)
    session.flush()
    return declaration


def _latest_started_before(
    session: Session, mission_id: str, crew_member_id: str, at: datetime
) -> ActivityDeclaration | None:
    return session.scalar(
        select(ActivityDeclaration)
        .where(
            ActivityDeclaration.mission_id == mission_id,
            ActivityDeclaration.crew_member_id == crew_member_id,
            ActivityDeclaration.started_at <= at,
        )
        .order_by(ActivityDeclaration.started_at.desc(), ActivityDeclaration.created_at.desc())
        .limit(1)
    )


def current_activity(
    session: Session, mission_id: str, crew_member_id: str, at: datetime
) -> ActivityCurrentRead:
    latest = _latest_started_before(session, mission_id, crew_member_id, at)
    if latest is None or (latest.ended_at is not None and latest.ended_at <= at):
        return ActivityCurrentRead(state="NONE", message_tr=MESSAGES_TR["NONE"])
    read = ActivityRead.model_validate(latest)
    if at >= latest.expected_end_at:
        return ActivityCurrentRead(state="EXPIRED", activity=read, message_tr=MESSAGES_TR["EXPIRED"])
    remaining = int((latest.expected_end_at - at).total_seconds())
    minutes = max(1, -(-remaining // 60))
    return ActivityCurrentRead(
        state="ACTIVE",
        activity=read,
        remaining_seconds=remaining,
        message_tr=f"Beyan edilen aktivite: {latest.activity_state}; yaklaşık {minutes} dk kaldı.",
    )


def declared_state_at(
    session: Session, mission_id: str, crew_member_id: str, observed_at: datetime
) -> str | None:
    """State declared for a moment, or None (unknown) if none covers it."""

    declaration = _latest_started_before(session, mission_id, crew_member_id, observed_at)
    if declaration is None:
        return None
    end = declaration.expected_end_at
    if declaration.ended_at is not None and declaration.ended_at < end:
        end = declaration.ended_at
    return declaration.activity_state if observed_at < end else None
