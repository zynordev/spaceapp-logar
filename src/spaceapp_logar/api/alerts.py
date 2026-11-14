from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.auth import Role, User, acting_crew_member, current_user, require_role
from spaceapp_logar.db.models import ActionStepLog, AlertEvent, RuleEvaluationRecord
from spaceapp_logar.db.session import get_session
from spaceapp_logar.rules import AlertStatus, get_action_card
from spaceapp_logar.schemas import ActionCardRead, AlertAcknowledge, AlertRead, AlertStepDone
from spaceapp_logar.services.red_flags import MANUAL_RESOLUTION_RULES, resolve_manually

router = APIRouter(prefix="/v1/alerts", tags=["alerts"])


def _to_read(
    alert: AlertEvent,
    explanations: dict[UUID, str],
) -> AlertRead:
    read = AlertRead.model_validate(alert)
    # The latest evaluation explains the alert's current level.
    read.explanation = explanations.get(alert.last_evaluation_id)
    read.manual_resolution = alert.rule_id in MANUAL_RESOLUTION_RULES
    read.completed_step_keys = [
        log.step_key for log in getattr(alert, "_step_logs", [])
    ]
    if alert.action_card_id is not None and alert.action_card_version is not None:
        card = get_action_card(alert.action_card_id, alert.action_card_version)
        if card is not None:
            read.action_card = ActionCardRead.from_card(card)
    return read


def _explanations(session: Session, alerts: list[AlertEvent]) -> dict[UUID, str]:
    evaluation_ids = {alert.last_evaluation_id for alert in alerts}
    if not evaluation_ids:
        return {}
    rows = session.execute(
        select(RuleEvaluationRecord.id, RuleEvaluationRecord.explanation).where(
            RuleEvaluationRecord.id.in_(evaluation_ids)
        )
    ).all()
    return {row.id: row.explanation for row in rows}


def _attach_step_logs(session: Session, alerts: list[AlertEvent]) -> None:
    """Attach steps done for each alert's current card (read-only helper)."""

    ids = [alert.id for alert in alerts]
    logs = (
        session.scalars(
            select(ActionStepLog)
            .where(ActionStepLog.alert_id.in_(ids))
            .order_by(ActionStepLog.done_at)
        ).all()
        if ids
        else []
    )
    for alert in alerts:
        alert._step_logs = [  # type: ignore[attr-defined]
            log
            for log in logs
            if log.alert_id == alert.id
            and log.card_id == alert.action_card_id
            and log.card_version == alert.action_card_version
        ]


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
    _attach_step_logs(session, alerts)
    return [_to_read(alert, explanations) for alert in alerts]


@router.post("/{alert_id}/acknowledge", response_model=AlertRead)
def acknowledge_alert(
    alert_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_user)],
    payload: Annotated[AlertAcknowledge | None, Body()] = None,
) -> AlertRead:
    """Record that a crew member has seen an alert.

    The acknowledging crew member is the token's user; without a token (demo
    mode) it is the body's crew_member_id (422 if missing). Acknowledging an
    already acknowledged alert is idempotent. A resolved alert can no longer
    be acknowledged.
    """

    actor = acting_crew_member(user, payload.crew_member_id if payload else None)
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
        alert.acknowledged_by = actor
        session.commit()
    _attach_step_logs(session, [alert])
    return _to_read(alert, _explanations(session, [alert]))


@router.post("/{alert_id}/resolve", response_model=AlertRead)
def resolve_alert(
    alert_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_user)],
    payload: Annotated[AlertAcknowledge | None, Body()] = None,
) -> AlertRead:
    """Close an alert that only a person can close (red flags).

    With a token only a CREW_MEDICAL_OFFICER may close it (403 otherwise) and
    resolved_by is the token's user; anonymous demo access (auth flag off)
    stays open and uses the body's crew_member_id. Measurement-based alerts
    close automatically when a full valid window is back to NORMAL, so they
    cannot be closed by hand (409).
    """

    actor = acting_crew_member(user, payload.crew_member_id if payload else None)
    alert = session.get(AlertEvent, alert_id)
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.rule_id not in MANUAL_RESOLUTION_RULES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This alert closes automatically when measurements return to normal",
        )
    require_role(user, Role.CREW_MEDICAL_OFFICER)
    if alert.status == AlertStatus.RESOLVED.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "Alert is already resolved")
    resolve_manually(
        session,
        alert,
        resolved_by=actor,
        now=datetime.now(timezone.utc),
    )
    session.commit()
    _attach_step_logs(session, [alert])
    return _to_read(alert, _explanations(session, [alert]))


@router.post("/{alert_id}/steps", response_model=AlertRead)
def mark_step_done(
    alert_id: UUID,
    payload: AlertStepDone,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_user)],
) -> AlertRead:
    """Record that a step of the alert's current action card was done.

    The crew member is the token's user, or the body's crew_member_id without
    a token (demo mode; 422 if missing). Marking the same step again keeps the first record (idempotent). Steps of a
    resolved alert, or keys not on the current card, are rejected.
    """

    actor = acting_crew_member(user, payload.crew_member_id)
    alert = session.get(AlertEvent, alert_id)
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.status == AlertStatus.RESOLVED.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "Alert is already resolved")
    card = (
        get_action_card(alert.action_card_id, alert.action_card_version)
        if alert.action_card_id is not None and alert.action_card_version is not None
        else None
    )
    if card is None or payload.step_key not in card.step_keys:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "step_key is not a step of this alert's current action card",
        )
    existing = session.scalar(
        select(ActionStepLog).where(
            ActionStepLog.alert_id == alert.id,
            ActionStepLog.card_id == card.card_id,
            ActionStepLog.card_version == card.version,
            ActionStepLog.step_key == payload.step_key,
        )
    )
    if existing is None:
        session.add(
            ActionStepLog(
                alert_id=alert.id,
                card_id=card.card_id,
                card_version=card.version,
                step_key=payload.step_key,
                crew_member_id=actor,
                done_at=datetime.now(timezone.utc),
            )
        )
        session.commit()
    _attach_step_logs(session, [alert])
    return _to_read(alert, _explanations(session, [alert]))
