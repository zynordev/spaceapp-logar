from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import AlertEvent, RuleEvaluationRecord
from spaceapp_logar.rules import AlertStatus, HealthAttention
from spaceapp_logar.services.ground_sync import create_escalation

ACTIVE_STATUSES = (AlertStatus.OPEN.value, AlertStatus.ACKNOWLEDGED.value)
ALERTING_LEVELS = (
    HealthAttention.WATCH.value,
    HealthAttention.ALERT.value,
    HealthAttention.CRITICAL.value,
)


def update_alert_lifecycle(
    session: Session,
    record: RuleEvaluationRecord,
) -> AlertEvent | None:
    """Open, refresh, escalate or resolve the alert for one rule evaluation.

    - A WATCH/ALERT/CRITICAL evaluation that showed a pre-written card opens an
      alert, or refreshes the active one for the same mission, target and rule
      (also updating its level and card, e.g. WATCH -> ALERT).
    - A NORMAL evaluation resolves the active alert.
    - UNKNOWN evaluations never resolve an alert: missing or bad data is not
      evidence that the situation ended.
    - An evaluation older than the alert's latest evaluation is ignored so
      late-arriving data cannot reorder the lifecycle.
    """

    latest = session.scalar(
        select(AlertEvent)
        .where(
            AlertEvent.mission_id == record.mission_id,
            AlertEvent.target_id == record.target_id,
            AlertEvent.rule_id == record.rule_id,
        )
        .order_by(AlertEvent.opened_at.desc(), AlertEvent.created_at.desc())
        .limit(1)
    )
    if latest is not None and latest.last_evaluated_at > record.evaluated_at:
        return None

    active = latest if latest is not None and latest.status in ACTIVE_STATUSES else None

    if record.health_attention in ALERTING_LEVELS and record.action_card_id is not None:
        if active is not None:
            escalated = ALERTING_LEVELS.index(record.health_attention) > (
                ALERTING_LEVELS.index(active.health_attention)
            )
            if escalated and active.status == AlertStatus.ACKNOWLEDGED.value:
                # A higher level must be seen again by the crew.
                active.status = AlertStatus.OPEN.value
                active.acknowledged_at = None
                active.acknowledged_by = None
            active.last_evaluation_id = record.id
            active.last_evaluated_at = record.evaluated_at
            active.health_attention = record.health_attention
            active.action_card_id = record.action_card_id
            active.action_card_version = record.action_card_version
            create_escalation(session, active, record)  # ALERT/CRITICAL only, once per alert
            return active
        alert = AlertEvent(
            mission_id=record.mission_id,
            target_id=record.target_id,
            rule_id=record.rule_id,
            status=AlertStatus.OPEN.value,
            health_attention=record.health_attention,
            action_card_id=record.action_card_id,
            action_card_version=record.action_card_version,
            opened_at=record.evaluated_at,
            opened_evaluation_id=record.id,
            last_evaluated_at=record.evaluated_at,
            last_evaluation_id=record.id,
        )
        session.add(alert)
        session.flush()
        create_escalation(session, alert, record)  # ALERT/CRITICAL only, once per alert
        return alert

    if record.health_attention == HealthAttention.NORMAL.value and active is not None:
        active.status = AlertStatus.RESOLVED.value
        active.resolved_at = record.evaluated_at
        active.resolved_evaluation_id = record.id
        active.last_evaluation_id = record.id
        active.last_evaluated_at = record.evaluated_at
        return active

    return active
