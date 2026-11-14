from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import RuleEvaluationRecord
from spaceapp_logar.rules import HealthAttention, get_action_card
from spaceapp_logar.rules.catalog import RULES, RuleInfo
from spaceapp_logar.schemas.action_cards import ActionCardRead
from spaceapp_logar.schemas.status import RuleStatusRead

SEVERITY = (
    HealthAttention.NORMAL,
    HealthAttention.WATCH,
    HealthAttention.ALERT,
    HealthAttention.CRITICAL,
)


def card_for_record(record: RuleEvaluationRecord) -> ActionCardRead | None:
    if record.action_card_id is None or record.action_card_version is None:
        return None
    card = get_action_card(record.action_card_id, record.action_card_version)
    return ActionCardRead.from_card(card) if card else None


def rule_status(record: RuleEvaluationRecord) -> RuleStatusRead:
    info: RuleInfo | None = RULES.get(record.rule_id)
    return RuleStatusRead(
        rule_id=record.rule_id,
        rule_version=record.rule_version,
        title=info.title if info else record.rule_id,
        metric=info.metric if info else "",
        related_metrics=list(info.related_metrics) if info else [],
        target_id=record.target_id,
        time_scale=info.time_scale if info else "",
        health_attention=HealthAttention(record.health_attention),
        data_quality=record.data_quality,
        observed_value=record.observed_value,
        unit=record.unit,
        threshold=record.threshold,
        comparison=record.comparison,
        window_minutes=record.window_minutes,
        evaluated_at=record.evaluated_at,
        explanation=record.explanation,
        source=record.source,
        source_uri=record.source_uri,
        evidence_level=info.evidence_level if info else "",
        validation_status=info.validation_status if info else "",
        action_card=card_for_record(record),
    )


def latest_rule_records(
    session: Session,
    *,
    mission_id: str,
    crew_member_id: str,
    environment_target_id: str | None,
) -> list[RuleEvaluationRecord]:
    records: list[RuleEvaluationRecord] = []
    for info in RULES.values():
        target_id = (
            environment_target_id
            if info.target_type == "ENVIRONMENT"
            else crew_member_id
        )
        if target_id is None:
            continue
        record = session.scalar(
            select(RuleEvaluationRecord)
            .where(
                RuleEvaluationRecord.mission_id == mission_id,
                RuleEvaluationRecord.target_id == target_id,
                RuleEvaluationRecord.rule_id == info.rule_id,
            )
            .order_by(
                RuleEvaluationRecord.evaluated_at.desc(),
                RuleEvaluationRecord.created_at.desc(),
            )
            .limit(1)
        )
        if record is not None:
            records.append(record)
    return records


def overall_attention(statuses: list[RuleStatusRead]) -> HealthAttention:
    """Highest known level, without letting bad data look like good health.

    If every assessable rule is NORMAL but at least one rule could not be
    assessed, the overall state is UNKNOWN rather than NORMAL.
    """

    known = [s.health_attention for s in statuses if s.health_attention in SEVERITY]
    if not known:
        return HealthAttention.UNKNOWN
    highest = max(known, key=SEVERITY.index)
    has_unknown = any(s.health_attention is HealthAttention.UNKNOWN for s in statuses)
    if highest is HealthAttention.NORMAL and has_unknown:
        return HealthAttention.UNKNOWN
    return highest
