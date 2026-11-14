"""Which environment applies at a given time, and the mission day."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import EnvironmentContext, Observation


def context_at(
    session: Session, mission_id: str, at: datetime
) -> EnvironmentContext | None:
    """Latest context effective at or before ``at`` (contexts are append-only)."""

    return session.scalar(
        select(EnvironmentContext)
        .where(
            EnvironmentContext.mission_id == mission_id,
            EnvironmentContext.effective_at <= at,
        )
        .order_by(EnvironmentContext.effective_at.desc(), EnvironmentContext.created_at.desc())
        .limit(1)
    )


def context_by_id(session: Session, context_id: UUID) -> EnvironmentContext | None:
    return session.get(EnvironmentContext, context_id)


def next_context_start(
    session: Session, mission_id: str, after: datetime
) -> datetime | None:
    return session.scalar(
        select(func.min(EnvironmentContext.effective_at)).where(
            EnvironmentContext.mission_id == mission_id,
            EnvironmentContext.effective_at > after,
        )
    )


def mission_started_at(session: Session, mission_id: str) -> datetime | None:
    """Earliest environment context or, if none, the earliest observation.

    The mission day is always derived from this; it is never stored.
    """

    first_context = session.scalar(
        select(func.min(EnvironmentContext.effective_at)).where(
            EnvironmentContext.mission_id == mission_id
        )
    )
    if first_context is not None:
        return first_context
    return session.scalar(
        select(func.min(Observation.observed_at)).where(Observation.mission_id == mission_id)
    )


def mission_day(started_at: datetime | None, at: datetime) -> int | None:
    if started_at is None or at < started_at:
        return None
    return int((at - started_at).total_seconds() // 86400) + 1
