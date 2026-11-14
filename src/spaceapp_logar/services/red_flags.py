from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from spaceapp_logar.db.models import AlertEvent, RedFlagReport, RuleEvaluationRecord
from spaceapp_logar.rules.red_flags import (
    RED_FLAG_RULE_ID,
    RedFlag,
    evaluate_red_flag_closed,
    evaluate_red_flags,
)
from spaceapp_logar.rules.models import RuleEvaluation
from spaceapp_logar.services.alerts import update_alert_lifecycle
from spaceapp_logar.services.rule_engine import RuleOutcome, persist_outcome

# Alerts that never close on their own and must be closed by a crew member.
MANUAL_RESOLUTION_RULES = frozenset({RED_FLAG_RULE_ID})


@dataclass(frozen=True, slots=True)
class RedFlagResult:
    report: RedFlagReport
    record: RuleEvaluationRecord
    alert: AlertEvent | None


def _instant_outcome(evaluation: RuleEvaluation, at: datetime) -> RuleOutcome:
    return RuleOutcome(
        evaluation=evaluation,
        window_start=at,
        window_end=at,
        valid_minute_buckets=1,
        required_minute_buckets=1,
        longest_missing_run_minutes=0,
        ignored_observations=0,
        evidence_ids=[],
    )


def record_red_flags(
    session: Session,
    *,
    mission_id: str,
    crew_member_id: str,
    flags: list[RedFlag],
    observed_at: datetime,
    source_type: str,
    source_id: str,
    scenario_id: str | None,
) -> RedFlagResult:
    """Store the report and escalate immediately to CRITICAL with a card."""

    record = persist_outcome(
        session,
        mission_id=mission_id,
        target_id=crew_member_id,
        evaluated_at=observed_at,
        outcome=_instant_outcome(evaluate_red_flags(flags), observed_at),
    )
    alert = update_alert_lifecycle(session, record)
    report = RedFlagReport(
        mission_id=mission_id,
        crew_member_id=crew_member_id,
        flags=",".join(flag.value for flag in flags),
        observed_at=observed_at,
        source_type=source_type,
        source_id=source_id,
        scenario_id=scenario_id,
        evaluation_id=record.id,
    )
    session.add(report)
    session.flush()
    return RedFlagResult(report=report, record=record, alert=alert)


def resolve_manually(
    session: Session,
    alert: AlertEvent,
    *,
    resolved_by: str,
    now: datetime,
) -> AlertEvent:
    """Close a red-flag alert after a crew member has assessed it.

    A NORMAL evaluation is stored so the rule status, the alert and the audit
    trail all agree that the red flag is no longer active.
    """

    at = max(now, alert.last_evaluated_at)
    record = persist_outcome(
        session,
        mission_id=alert.mission_id,
        target_id=alert.target_id,
        evaluated_at=at,
        outcome=_instant_outcome(evaluate_red_flag_closed(resolved_by, at), at),
    )
    update_alert_lifecycle(session, record)
    alert.resolved_by = resolved_by
    return alert
