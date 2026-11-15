from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import LabResult, Observation, SubjectiveCheckIn
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas.measurements import (
    METRIC_SPECS,
    MeasurementCreate,
    MeasurementPoint,
    MeasurementRead,
    MeasurementSeriesRead,
    MeasurementTrendRead,
    Metric,
    MetricRead,
    MissionRead,
    TrendBucket,
)
from spaceapp_logar.services.rule_engine import usable
from spaceapp_logar.schemas.status import RuleStatusRead
from spaceapp_logar.services.ingest import store_measurement
from spaceapp_logar.services.rule_engine import evaluate_observation
from spaceapp_logar.services.status_view import rule_status

router = APIRouter(tags=["measurements"])


class MeasurementAccepted(BaseModel):
    measurement: MeasurementRead
    evaluations: list[RuleStatusRead]


@router.post(
    "/v1/measurements",
    response_model=MeasurementAccepted,
    status_code=status.HTTP_201_CREATED,
)
def create_measurement(
    payload: MeasurementCreate,
    session: Annotated[Session, Depends(get_session)],
) -> MeasurementAccepted:
    """Append one vital or environment measurement and run its rules."""

    observation = store_measurement(session, payload)
    records = evaluate_observation(session, observation)
    session.commit()
    return MeasurementAccepted(
        measurement=MeasurementRead.model_validate(observation),
        evaluations=[rule_status(record, session) for record in records],
    )


MAX_BATCH_SIZE = 1000


class MeasurementBatchCreate(BaseModel):
    mode: Literal["all_or_nothing", "partial"] = "all_or_nothing"
    # Items stay raw so each one is validated on its own.
    measurements: list[Any]


class RejectedItem(BaseModel):
    index: int
    errors: list[dict[str, Any]]


class MeasurementBatchResult(BaseModel):
    mode: str
    accepted: int
    rejected: list[RejectedItem]
    evaluations: int


@router.post(
    "/v1/measurements/batch",
    response_model=MeasurementBatchResult,
    status_code=status.HTTP_201_CREATED,
    responses={422: {"model": MeasurementBatchResult}},
)
def create_measurement_batch(
    payload: MeasurementBatchCreate,
    session: Annotated[Session, Depends(get_session)],
) -> Any:
    """Append many measurements in one transaction, oldest first.

    ``all_or_nothing`` stores nothing if any item is invalid; ``partial``
    stores the valid items and reports the rejected ones by index.
    """

    if len(payload.measurements) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Bir istekte en fazla {MAX_BATCH_SIZE} ölçüm gönderilebilir.",
        )
    valid: list[MeasurementCreate] = []
    rejected: list[RejectedItem] = []
    for index, item in enumerate(payload.measurements):
        try:
            valid.append(MeasurementCreate.model_validate(item))
        except ValidationError as exc:
            errors = exc.errors(include_url=False, include_input=False)
            rejected.append(RejectedItem(index=index, errors=jsonable_encoder(errors)))

    if payload.mode == "all_or_nothing" and rejected:
        result = MeasurementBatchResult(
            mode=payload.mode, accepted=0, rejected=rejected, evaluations=0
        )
        return JSONResponse(status_code=422, content=result.model_dump())

    evaluations = 0
    try:
        for measurement in sorted(valid, key=lambda m: m.observed_at):
            observation = store_measurement(session, measurement)
            evaluations += len(evaluate_observation(session, observation))
        session.commit()
    except Exception:
        session.rollback()
        raise
    result = MeasurementBatchResult(
        mode=payload.mode, accepted=len(valid), rejected=rejected, evaluations=evaluations
    )
    if not valid:
        return JSONResponse(status_code=status.HTTP_200_OK, content=result.model_dump())
    return result


@router.get("/v1/measurements", response_model=MeasurementSeriesRead)
def list_measurements(
    session: Annotated[Session, Depends(get_session)],
    mission_id: Annotated[str, Query(min_length=1, max_length=100)],
    target_id: Annotated[str, Query(min_length=1, max_length=100)],
    metric: Metric,
    since: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
) -> MeasurementSeriesRead:
    """Raw time series for one metric, oldest first (latest ``limit`` points)."""

    query = select(Observation).where(
        Observation.mission_id == mission_id,
        Observation.target_id == target_id,
        Observation.metric == metric.value,
    )
    if since is not None:
        if since.tzinfo is None or since.utcoffset() is None:
            since = since.replace(tzinfo=timezone.utc)
        query = query.where(Observation.observed_at >= since)
    rows = list(
        session.scalars(
            query.order_by(Observation.observed_at.desc()).limit(limit)
        ).all()
    )
    rows.reverse()
    return MeasurementSeriesRead(
        metric=metric,
        unit=METRIC_SPECS[metric].unit,
        target_id=target_id,
        points=[
            MeasurementPoint(
                observed_at=row.observed_at,
                value=row.value,
                reported_quality=row.reported_quality,
                activity_state=row.activity_state,
            )
            for row in rows
        ],
    )


MAX_TREND_BUCKETS = 1000
MAX_TREND_ROWS = 200_000
_BUCKET_SIZE = {"hour": timedelta(hours=1), "day": timedelta(days=1)}
_DEFAULT_WINDOW = {"hour": timedelta(days=7), "day": timedelta(days=30)}


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.get("/v1/measurements/trend", response_model=MeasurementTrendRead)
def measurement_trend(
    session: Annotated[Session, Depends(get_session)],
    mission_id: Annotated[str, Query(min_length=1, max_length=100)],
    target_id: Annotated[str, Query(min_length=1, max_length=100)],
    metric: Metric,
    bucket: Literal["hour", "day"],
    since: datetime | None = None,
    until: datetime | None = None,
) -> MeasurementTrendRead:
    """Hourly/daily aggregates (count, mean, min, max) in UTC-aligned buckets.

    Only VALID, finite, physically plausible observations are aggregated;
    FAULT/SUSPECT/MISSING-quality and implausible values are excluded. Empty
    buckets are omitted. The window is ``[since, until)``; by default it is the
    last 7 days (hour) or 30 days (day) ending at the latest observation, or
    now when there is none.
    """

    size = _BUCKET_SIZE[bucket]
    base = (
        Observation.mission_id == mission_id,
        Observation.target_id == target_id,
        Observation.metric == metric.value,
    )
    until_utc = _as_utc(until) if until is not None else None
    if until_utc is None:
        latest = session.scalar(select(func.max(Observation.observed_at)).where(*base))
        until_utc = (
            _as_utc(latest) + timedelta(microseconds=1)
            if latest is not None
            else datetime.now(timezone.utc)
        )
    since_utc = _as_utc(since) if since is not None else until_utc - _DEFAULT_WINDOW[bucket]
    if since_utc >= until_utc:
        raise HTTPException(status_code=422, detail="since, until değerinden önce olmalı.")

    def floor(moment: datetime) -> datetime:
        if bucket == "hour":
            return moment.replace(minute=0, second=0, microsecond=0)
        return moment.replace(hour=0, minute=0, second=0, microsecond=0)

    first = floor(since_utc)
    span = (until_utc - first) / size
    if span > MAX_TREND_BUCKETS:
        raise HTTPException(
            status_code=422,
            detail=f"En fazla {MAX_TREND_BUCKETS} dilim istenebilir; aralığı daraltın.",
        )

    rows = session.scalars(
        select(Observation)
        .where(
            *base,
            Observation.observed_at >= since_utc,
            Observation.observed_at < until_utc,
        )
        .order_by(Observation.observed_at)
        .limit(MAX_TREND_ROWS)
    ).all()
    groups: dict[datetime, list[float]] = {}
    for row in rows:
        if usable(row):
            groups.setdefault(floor(_as_utc(row.observed_at)), []).append(row.value)
    return MeasurementTrendRead(
        mission_id=mission_id,
        target_id=target_id,
        metric=metric,
        unit=METRIC_SPECS[metric].unit,
        bucket=bucket,
        since=since_utc,
        until=until_utc,
        buckets=[
            TrendBucket(
                start=start,
                end=start + size,
                count=len(values),
                mean=sum(values) / len(values),
                min=min(values),
                max=max(values),
            )
            for start, values in sorted(groups.items())
        ],
    )


@router.get("/v1/metrics", response_model=list[MetricRead])
def list_metrics() -> list[MetricRead]:
    return [
        MetricRead(
            metric=spec.metric,
            label=spec.label,
            unit=spec.unit,
            target_type=spec.target_type,
            category=spec.category,
            plausible_min=spec.plausible_min,
            plausible_max=spec.plausible_max,
        )
        for spec in METRIC_SPECS.values()
    ]


@router.get("/v1/missions", response_model=list[MissionRead])
def list_missions(
    session: Annotated[Session, Depends(get_session)],
) -> list[MissionRead]:
    """Missions that have data, newest activity first."""

    summary = session.execute(
        select(
            Observation.mission_id,
            func.max(Observation.observed_at),
            func.max(Observation.scenario_id),
        ).group_by(Observation.mission_id)
    ).all()
    targets = session.execute(
        select(
            Observation.mission_id, Observation.target_type, Observation.target_id
        ).distinct()
    ).all()
    check_in_crew = session.execute(
        select(SubjectiveCheckIn.mission_id, SubjectiveCheckIn.crew_member_id).distinct()
    ).all()
    lab_summary = session.execute(
        select(LabResult.mission_id, func.max(LabResult.sampled_at)).group_by(
            LabResult.mission_id
        )
    ).all()
    lab_crew = session.execute(
        select(LabResult.mission_id, LabResult.crew_member_id).distinct()
    ).all()

    crew: dict[str, set[str]] = {}
    environment: dict[str, set[str]] = {}
    for mission_id, target_type, target_id in targets:
        bucket = crew if target_type == "CREW_MEMBER" else environment
        bucket.setdefault(mission_id, set()).add(target_id)
    for mission_id, crew_member_id in [*check_in_crew, *lab_crew]:
        crew.setdefault(mission_id, set()).add(crew_member_id)

    observed_missions = {row[0] for row in summary}
    # Lab-only missions (e.g. the real OSDR import) are listed too.
    summary = [
        *summary,
        *[
            (mission_id, last_sampled_at, None)
            for mission_id, last_sampled_at in lab_summary
            if mission_id not in observed_missions
        ],
    ]

    missions = [
        MissionRead(
            mission_id=mission_id,
            scenario_id=scenario_id,
            last_observed_at=last_observed_at,
            crew_member_ids=sorted(crew.get(mission_id, set())),
            environment_target_ids=sorted(environment.get(mission_id, set())),
        )
        for mission_id, last_observed_at, scenario_id in summary
    ]
    missions.sort(key=lambda mission: mission.last_observed_at, reverse=True)
    return missions
