from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import BaselineProfile, EnvironmentContext
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas.environment import (
    CurrentEnvironmentRead,
    EnvironmentContextCreate,
    EnvironmentContextRead,
)
from spaceapp_logar.schemas.measurements import ActivityState, Metric
from spaceapp_logar.schemas.observations import Identifier
from spaceapp_logar.services.baseline import (
    activate_profile,
    get_personal_baseline,
    snapshot_baseline,
)
from spaceapp_logar.services.environment import context_at, mission_day, mission_started_at

router = APIRouter(tags=["environment-and-baselines"])

MissionId = Annotated[str, Query(min_length=1, max_length=100)]


def _utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# --- Environment contexts ------------------------------------------------------
@router.post(
    "/v1/environment-contexts",
    response_model=EnvironmentContextRead,
    status_code=status.HTTP_201_CREATED,
)
def create_environment_context(
    payload: EnvironmentContextCreate,
    session: Annotated[Session, Depends(get_session)],
) -> EnvironmentContextRead:
    """Record an environment change (append-only); a new baseline profile starts."""

    context = EnvironmentContext(
        mission_id=payload.mission_id,
        location=payload.location.value,
        gravity_g=payload.gravity_g,
        eva_state=payload.eva_state.value,
        communication_delay_seconds=payload.communication_delay_seconds,
        expected_metrics=[metric.value for metric in payload.expected_metrics],
        sensor_set=list(payload.sensor_set),
        effective_at=payload.effective_at,
        source_type=payload.source_type.value,
        source_id=payload.source_id,
    )
    session.add(context)
    session.commit()
    return EnvironmentContextRead.model_validate(context)


@router.get("/v1/environment-contexts", response_model=list[EnvironmentContextRead])
def list_environment_contexts(
    mission_id: MissionId,
    session: Annotated[Session, Depends(get_session)],
) -> list[EnvironmentContextRead]:
    rows = session.scalars(
        select(EnvironmentContext)
        .where(EnvironmentContext.mission_id == mission_id)
        .order_by(EnvironmentContext.effective_at, EnvironmentContext.created_at)
    ).all()
    return [EnvironmentContextRead.model_validate(row) for row in rows]


@router.get("/v1/environment-contexts/current", response_model=CurrentEnvironmentRead)
def current_environment(
    mission_id: MissionId,
    session: Annotated[Session, Depends(get_session)],
    at: datetime | None = None,
) -> CurrentEnvironmentRead:
    """Environment in force at ``at`` (default now) and the derived mission day."""

    moment = _utc(at)
    started = mission_started_at(session, mission_id)
    context = context_at(session, mission_id, moment)
    return CurrentEnvironmentRead(
        mission_id=mission_id,
        at=moment,
        mission_started_at=started,
        mission_day=mission_day(started, moment),
        context=EnvironmentContextRead.model_validate(context) if context else None,
    )


# --- Personal baselines --------------------------------------------------------
class BaselineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    median: float | None
    p10: float | None
    p25: float | None
    p75: float | None
    p90: float | None
    sample_count: int
    min_samples_required: int
    excluded_count: int
    is_sufficient: bool
    classification: str
    status_label: str
    evidence_level: str
    environment_location: str | None
    environment_context_id: UUID | None
    activity_state: str | None
    profile_id: UUID | None
    profile_version: int
    limitation_note: str


class BaselineSnapshotCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mission_id: Identifier
    target_id: Identifier
    metric: Metric
    activity_state: ActivityState | None = None
    before: datetime | None = None
    created_by: Identifier
    reason: Annotated[str, Field(min_length=3, max_length=500)]


class BaselineProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mission_id: str
    target_id: str
    metric: str
    activity_key: str
    environment_key: str
    environment_location: str | None
    version: int
    median: float | None
    p10: float | None
    p25: float | None
    p75: float | None
    p90: float | None
    sample_count: int
    min_samples_required: int
    excluded_count: int
    classification: str
    computed_before: datetime
    created_by: str
    reason: str
    created_at: datetime


class ActivationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    activated_by: Identifier
    reason: Annotated[str, Field(min_length=3, max_length=500)]


@router.get("/v1/baselines", response_model=BaselineRead)
def read_baseline(
    mission_id: MissionId,
    target_id: Annotated[str, Query(min_length=1, max_length=100)],
    metric: Metric,
    session: Annotated[Session, Depends(get_session)],
    activity_state: ActivityState | None = None,
    before: datetime | None = None,
) -> BaselineRead:
    """Personal baseline in force for a target and metric (computed or pinned)."""

    result = get_personal_baseline(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=metric.value,
        before=_utc(before),
        activity_state=activity_state.value if activity_state else None,
    )
    return BaselineRead.model_validate(result)


@router.post(
    "/v1/baseline-profiles",
    response_model=BaselineProfileRead,
    status_code=status.HTTP_201_CREATED,
)
def create_baseline_snapshot(
    payload: BaselineSnapshotCreate,
    session: Annotated[Session, Depends(get_session)],
) -> BaselineProfileRead:
    """Freeze the current baseline as a new immutable version and activate it."""

    profile = snapshot_baseline(
        session,
        mission_id=payload.mission_id,
        target_id=payload.target_id,
        metric=payload.metric.value,
        before=_utc(payload.before),
        activity_state=payload.activity_state.value if payload.activity_state else None,
        created_by=payload.created_by,
        reason=payload.reason,
    )
    session.commit()
    return BaselineProfileRead.model_validate(profile)


@router.get("/v1/baseline-profiles", response_model=list[BaselineProfileRead])
def list_baseline_snapshots(
    mission_id: MissionId,
    target_id: Annotated[str, Query(min_length=1, max_length=100)],
    metric: Metric,
    session: Annotated[Session, Depends(get_session)],
) -> list[BaselineProfileRead]:
    rows = session.scalars(
        select(BaselineProfile)
        .where(
            BaselineProfile.mission_id == mission_id,
            BaselineProfile.target_id == target_id,
            BaselineProfile.metric == metric.value,
        )
        .order_by(BaselineProfile.version)
    ).all()
    return [BaselineProfileRead.model_validate(row) for row in rows]


@router.post("/v1/baseline-profiles/{profile_id}/activate", response_model=BaselineProfileRead)
def activate_baseline_snapshot(
    profile_id: UUID,
    payload: ActivationCreate,
    session: Annotated[Session, Depends(get_session)],
) -> BaselineProfileRead:
    """Put an earlier snapshot back in force (rollback). Nothing is deleted."""

    profile = session.get(BaselineProfile, profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Baseline profile not found")
    activate_profile(session, profile, activated_by=payload.activated_by, reason=payload.reason)
    session.commit()
    return BaselineProfileRead.model_validate(profile)


@router.post("/v1/baseline-profiles/{profile_id}/release", status_code=status.HTTP_204_NO_CONTENT)
def release_baseline_snapshot(
    profile_id: UUID,
    payload: ActivationCreate,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Return the profile key of this snapshot to automatic computation."""

    profile = session.get(BaselineProfile, profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Baseline profile not found")
    activate_profile(
        session,
        None,
        activated_by=payload.activated_by,
        reason=payload.reason,
        key=(
            profile.mission_id,
            profile.target_id,
            profile.metric,
            profile.activity_key,
            profile.environment_key,
        ),
    )
    session.commit()
