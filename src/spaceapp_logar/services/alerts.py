from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import AlertEvent, RuleEvaluationRecord
from spaceapp_logar.rules import AlertStatus, HealthAttention

ACTIVE_STATUSES = (AlertStatus.OPEN.value, AlertStatus.ACKNOWLEDGED.value)


def update_alert_lifecycle(
    session: Session,
    record: RuleEvaluationRecord,
) -> AlertEvent | None:
    """Open, refresh or resolve the alert for one persisted rule evaluation.

    - A WATCH evaluation that showed an approved card opens an alert, or
      refreshes the active one for the same mission, target and rule.
    - A NORMAL evaluation (a full valid window within the limit) resolves the
      active alert.
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

    if (
        record.health_attention == HealthAttention.WATCH.value
        and record.action_card_id is not None
    ):
        if active is not None:
            active.last_evaluation_id = record.id
            active.last_evaluated_at = record.evaluated_at
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
        return alert

    if record.health_attention == HealthAttention.NORMAL.value and active is not None:
        active.status = AlertStatus.RESOLVED.value
        active.resolved_at = record.evaluated_at
        active.resolved_evaluation_id = record.id
        active.last_evaluation_id = record.id
        active.last_evaluated_at = record.evaluated_at
        return active

    return active
