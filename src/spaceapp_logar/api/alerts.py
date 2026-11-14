from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import AlertEvent, RuleEvaluationRecord
from spaceapp_logar.db.session import get_session
from spaceapp_logar.rules import AlertStatus, get_action_card
from spaceapp_logar.schemas import ActionCardRead, AlertAcknowledge, AlertRead

router = APIRouter(prefix="/v1/alerts", tags=["alerts"])


def _to_read(
    alert: AlertEvent,
    explanations: dict[UUID, str],
) -> AlertRead:
    read = AlertRead.model_validate(alert)
    read.explanation = explanations.get(alert.opened_evaluation_id)
    if alert.action_card_id is not None and alert.action_card_version is not None:
        card = get_action_card(alert.action_card_id, alert.action_card_version)
        if card is not None:
            read.action_card = ActionCardRead.from_card(card)
    return read


def _explanations(session: Session, alerts: list[AlertEvent]) -> dict[UUID, str]:
    evaluation_ids = {alert.opened_evaluation_id for alert in alerts}
    if not evaluation_ids:
        return {}
    rows = session.execute(
        select(RuleEvaluationRecord.id, RuleEvaluationRecord.explanation).where(
            RuleEvaluationRecord.id.in_(evaluation_ids)
        )
    ).all()
    return {row.id: row.explanation for row in rows}


@router.get("", response_model=list[AlertRead])
def list_alerts(
    session: Annotated[Session, Depends(get_session)],
    mission_id: Annotated[str, Query(min_length=1, max_length=100)],
    alert_status: Annotated[AlertStatus | None, Query(alias="status")] = None,
    target_id: Annotated[str | None, Query(min_length=1, max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[AlertRead]:
    """List alerts for a mission, newest first."""

    query = select(AlertEvent).where(AlertEvent.mission_id == mission_id)
    if alert_status is not None:
        query = query.where(AlertEvent.status == alert_status.value)
    if target_id is not None:
        query = query.where(AlertEvent.target_id == target_id)
    alerts = list(
        session.scalars(
            query.order_by(AlertEvent.opened_at.desc(), AlertEvent.created_at.desc())
            .limit(limit)
        ).all()
    )
    explanations = _explanations(session, alerts)
    return [_to_read(alert, explanations) for alert in alerts]


@router.post("/{alert_id}/acknowledge", response_model=AlertRead)
def acknowledge_alert(
    alert_id: UUID,
    payload: AlertAcknowledge,
    session: Annotated[Session, Depends(get_session)],
) -> AlertRead:
    """Record that a crew member has seen an alert.

    Acknowledging an already acknowledged alert is idempotent. A resolved
    alert can no longer be acknowledged.
    """

    alert = session.get(AlertEvent, alert_id)
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.status == AlertStatus.RESOLVED.value:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Alert is already resolved and cannot be acknowledged",
        )
    if alert.status == AlertStatus.OPEN.value:
        alert.status = AlertStatus.ACKNOWLEDGED.value
        alert.acknowledged_at = datetime.now(timezone.utc)
        alert.acknowledged_by = payload.crew_member_id
        session.commit()
    return _to_read(alert, _explanations(session, [alert]))
