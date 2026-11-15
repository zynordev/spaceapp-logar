from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import AlertEvent, Observation
from spaceapp_logar.db.session import get_session
from spaceapp_logar.rules import AlertStatus, HealthAttention
from spaceapp_logar.rules.body_map import REGIONS, metrics_for, rule_ids_for
from spaceapp_logar.rules.risk_coverage import DATA_ONLY, GAP, RULE
from spaceapp_logar.schemas.body_map import (
    BodyMapRead,
    BodyRegionRead,
    BodyRegionRuleRead,
    BodyRegionValueRead,
)
from spaceapp_logar.schemas.measurements import METRIC_SPECS, Metric, TargetType
from spaceapp_logar.services.status_view import (
    latest_rule_records,
    overall_attention,
    rule_status,
)

router = APIRouter(prefix="/v1/crew", tags=["body-map"])

# Worst-case ordering for a region; UNKNOWN outranks NORMAL so bad data never
# looks like good health.
RANK = (
    HealthAttention.NORMAL,
    HealthAttention.UNKNOWN,
    HealthAttention.WATCH,
    HealthAttention.ALERT,
    HealthAttention.CRITICAL,
)


def _metric_target_type(metric: str) -> TargetType:
    try:
        return METRIC_SPECS[Metric(metric)].target_type
    except ValueError:
        return TargetType.CREW_MEMBER


def _metric_label(metric: str) -> str:
    try:
        return METRIC_SPECS[Metric(metric)].label
    except ValueError:
        return metric


def _latest_value(
    session: Session, mission_id: str, target_id: str, metric: str
) -> Observation | None:
    return session.scalar(
        select(Observation)
        .where(
            Observation.mission_id == mission_id,
            Observation.target_id == target_id,
            Observation.metric == metric,
        )
        .order_by(Observation.observed_at.desc(), Observation.ingested_at.desc())
        .limit(1)
    )


@router.get("/{crew_member_id}/body-map", response_model=BodyMapRead)
def get_body_map(
    crew_member_id: str,
    mission_id: Annotated[str, Query(min_length=1, max_length=100)],
    session: Annotated[Session, Depends(get_session)],
    environment_target_id: Annotated[
        str | None, Query(min_length=1, max_length=100)
    ] = None,
) -> BodyMapRead:
    """Per-region attention built from the same latest rule results as /status."""

    statuses = [
        rule_status(record, session)
        for record in latest_rule_records(
            session,
            mission_id=mission_id,
            crew_member_id=crew_member_id,
            environment_target_id=environment_target_id,
        )
    ]
    by_rule = {s.rule_id: s for s in statuses}

    target_ids = [crew_member_id] + (
        [environment_target_id] if environment_target_id else []
    )
    alerts = session.scalars(
        select(AlertEvent)
        .where(
            AlertEvent.mission_id == mission_id,
            AlertEvent.target_id.in_(target_ids),
            AlertEvent.status.in_(
                [AlertStatus.OPEN.value, AlertStatus.ACKNOWLEDGED.value]
            ),
        )
        .order_by(AlertEvent.opened_at)
    ).all()

    regions: list[BodyRegionRead] = []
    for region in REGIONS:
        rule_ids = rule_ids_for(region.key)
        region_rules = [by_rule[r] for r in rule_ids if r in by_rule]
        metrics = metrics_for(region.key)

        values: list[BodyRegionValueRead] = []
        for metric in metrics:
            target_id = (
                environment_target_id
                if _metric_target_type(metric) is TargetType.ENVIRONMENT
                else crew_member_id
            )
            if target_id is None:
                continue
            obs = _latest_value(session, mission_id, target_id, metric)
            if obs is not None:
                values.append(
                    BodyRegionValueRead(
                        metric=metric,
                        label=_metric_label(metric),
                        value=obs.value,
                        unit=obs.unit,
                        observed_at=obs.observed_at,
                    )
                )

        if rule_ids:
            coverage = RULE
        elif values:
            coverage = DATA_ONLY
        else:
            coverage = GAP
        attention = (
            max((s.health_attention for s in region_rules), key=RANK.index)
            if region_rules
            else HealthAttention.UNKNOWN
        )
        regions.append(
            BodyRegionRead(
                region=region.key,
                label_tr=region.label_tr,
                description_tr=region.description_tr,
                attention=attention,
                coverage=coverage,
                rules=[
                    BodyRegionRuleRead(
                        rule_id=s.rule_id,
                        title=s.title,
                        health_attention=s.health_attention,
                        data_quality=s.data_quality,
                        explanation=s.explanation,
                    )
                    for s in region_rules
                ],
                metrics=metrics,
                latest_values=values,
                open_alert_ids=[a.id for a in alerts if a.rule_id in rule_ids],
            )
        )

    return BodyMapRead(
        mission_id=mission_id,
        crew_member_id=crew_member_id,
        generated_at=datetime.now(timezone.utc),
        overall_attention=overall_attention(statuses),
        regions=regions,
    )
