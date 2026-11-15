"""Live, factual context for an action card ("what is happening right now").

Everything here is a measured or recorded fact (value, limit, duration, trend,
reported symptoms, other modules, completed steps). Nothing is a diagnosis.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import (
    ActionStepLog,
    AlertEvent,
    Observation,
    RuleEvaluationRecord,
    SubjectiveCheckIn,
)
from spaceapp_logar.rules import get_action_card
from spaceapp_logar.rules.co2 import CO2_NOMINAL_LIMIT_MMHG
from spaceapp_logar.rules.co2 import RULE_ID as CO2_RULE_ID
from spaceapp_logar.rules.red_flags import RED_FLAG_RULE_ID
from spaceapp_logar.services.mission_profiles import earth_response
from spaceapp_logar.schemas.status import CompletedStepRead, SituationRead

ACTIVE = ("OPEN", "ACKNOWLEDGED")
TREND_MINUTES = 30
CHECK_IN_LOOKBACK_HOURS = 4
OTHER_MODULE_LOOKBACK_MINUTES = 15
SYMPTOM_NAMES = {
    "fatigue": "fatigue",
    "dizziness": "dizziness",
    "nausea": "nausea",
    "pain": "pain",
    "mood_distress": "mood distress",
}


def _num(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _minutes(delta: timedelta) -> int:
    return max(0, int(delta.total_seconds() // 60))


def active_alert(session: Session, record: RuleEvaluationRecord) -> AlertEvent | None:
    return session.scalar(
        select(AlertEvent)
        .where(
            AlertEvent.mission_id == record.mission_id,
            AlertEvent.target_id == record.target_id,
            AlertEvent.rule_id == record.rule_id,
            AlertEvent.status.in_(ACTIVE),
        )
        .order_by(AlertEvent.opened_at.desc())
        .limit(1)
    )


def completed_steps(
    session: Session, alert: AlertEvent, card_id: str, card_version: int
) -> list[ActionStepLog]:
    return list(
        session.scalars(
            select(ActionStepLog)
            .where(
                ActionStepLog.alert_id == alert.id,
                ActionStepLog.card_id == card_id,
                ActionStepLog.card_version == card_version,
            )
            .order_by(ActionStepLog.done_at)
        ).all()
    )


def _trend_fact(session: Session, record: RuleEvaluationRecord) -> str | None:
    if record.observed_value is None:
        return None
    earlier = session.scalar(
        select(RuleEvaluationRecord)
        .where(
            RuleEvaluationRecord.mission_id == record.mission_id,
            RuleEvaluationRecord.target_id == record.target_id,
            RuleEvaluationRecord.rule_id == record.rule_id,
            RuleEvaluationRecord.data_quality == "VALID",
            RuleEvaluationRecord.observed_value.is_not(None),
            RuleEvaluationRecord.evaluated_at
            <= record.evaluated_at - timedelta(minutes=TREND_MINUTES),
        )
        .order_by(RuleEvaluationRecord.evaluated_at.desc())
        .limit(1)
    )
    if earlier is None or earlier.observed_value is None:
        return None
    before, now = earlier.observed_value, record.observed_value
    if abs(now - before) <= 0.02 * max(abs(before), 1e-9):
        direction = "stable"
    elif now > before:
        direction = "rising"
    else:
        direction = "falling"
    minutes = _minutes(record.evaluated_at - earlier.evaluated_at)
    return (
        f"Trend: {minutes} min ago {_num(before)} {record.unit} → now "
        f"{_num(now)} {record.unit} ({direction})."
    )


def _symptom_fact(session: Session, record: RuleEvaluationRecord, is_crew: bool) -> str | None:
    query = select(SubjectiveCheckIn).where(
        SubjectiveCheckIn.mission_id == record.mission_id,
        SubjectiveCheckIn.observed_at <= record.evaluated_at + timedelta(minutes=1),
        SubjectiveCheckIn.observed_at
        >= record.evaluated_at - timedelta(hours=CHECK_IN_LOOKBACK_HOURS),
    )
    if is_crew:
        query = query.where(SubjectiveCheckIn.crew_member_id == record.target_id)
    check_in = session.scalar(
        query.order_by(SubjectiveCheckIn.observed_at.desc()).limit(1)
    )
    if check_in is None:
        return "No subjective check-in in the last 4 hours; recording symptoms strengthens the assessment."
    reported = [
        f"{label} {getattr(check_in, name)}/4"
        for name, label in SYMPTOM_NAMES.items()
        if getattr(check_in, name) >= 1
    ]
    minutes = _minutes(record.evaluated_at - check_in.observed_at)
    who = "" if is_crew else f" ({check_in.crew_member_id})"
    if not reported:
        return f"Last subjective check-in{who} {minutes} min ago: no symptoms reported."
    return f"Last subjective check-in{who} {minutes} min ago: {', '.join(reported)}."


def _other_modules_fact(session: Session, record: RuleEvaluationRecord) -> str | None:
    rows = session.scalars(
        select(Observation)
        .where(
            Observation.mission_id == record.mission_id,
            Observation.metric == "CABIN_CO2_PARTIAL_PRESSURE",
            Observation.target_id != record.target_id,
            Observation.reported_quality == "VALID",
            Observation.observed_at <= record.evaluated_at,
            Observation.observed_at
            >= record.evaluated_at - timedelta(minutes=OTHER_MODULE_LOOKBACK_MINUTES),
        )
        .order_by(Observation.observed_at.desc())
    ).all()
    latest: dict[str, float] = {}
    for row in rows:
        latest.setdefault(row.target_id, row.value)
    if not latest:
        return "No other module data to compare; it cannot be told whether this is local or cabin-wide."
    parts = ", ".join(f"{target} {_num(value)} mmHg" for target, value in sorted(latest.items()))
    if all(value <= CO2_NOMINAL_LIMIT_MMHG for value in latest.values()):
        verdict = "other modules are below the limit → the high reading may be specific to this module (local accumulation)."
    elif all(value > CO2_NOMINAL_LIMIT_MMHG for value in latest.values()):
        verdict = "other modules are also above the limit → a cabin-wide issue is possible."
    else:
        verdict = "modules differ; compare airflow."
    return f"Other modules (latest reading): {parts}; {verdict}"


def situation_for(session: Session, record: RuleEvaluationRecord) -> SituationRead | None:
    if record.action_card_id is None or record.action_card_version is None:
        return None
    card = get_action_card(record.action_card_id, record.action_card_version)
    facts: list[str] = []

    if record.rule_id != RED_FLAG_RULE_ID and record.observed_value is not None:
        facts.append(
            f"Measured: {_num(record.observed_value)} {record.unit} · Limit: "
            f"{record.comparison} {_num(record.threshold)} {record.unit} · Window: "
            f"{record.window_minutes} min."
        )

    alert = active_alert(session, record)
    if alert is not None:
        minutes = _minutes(record.evaluated_at - alert.opened_at)
        facts.append(
            "Condition just started." if minutes < 1 else f"This condition has lasted {minutes} min."
        )

    trend = _trend_fact(session, record)
    if trend and record.rule_id != RED_FLAG_RULE_ID:
        facts.append(trend)

    if record.rule_id == CO2_RULE_ID:
        other = _other_modules_fact(session, record)
        if other:
            facts.append(other)

    symptom = _symptom_fact(session, record, is_crew=record.rule_id != CO2_RULE_ID)
    if symptom:
        facts.append(symptom)

    logs: list[ActionStepLog] = []
    reassess_at = None
    if alert is not None and card is not None:
        logs = completed_steps(session, alert, card.card_id, card.version)
        if card.reassess_minutes:
            base = max([alert.opened_at, *(log.done_at for log in logs)])
            reassess_at = base + timedelta(minutes=card.reassess_minutes)
        if card.steps:
            facts.append(f"Completed steps: {len(logs)}/{len(card.steps)}.")

    return SituationRead(
        facts_tr=facts,
        alert_id=alert.id if alert else None,
        level_since=alert.opened_at if alert else None,
        reassess_at=reassess_at,
        earth_response=(
            earth_response(session, record.mission_id, card.reassess_minutes)
            if card is not None and card.reassess_minutes
            else None
        ),
        completed_steps=[
            CompletedStepRead(
                step_key=log.step_key,
                crew_member_id=log.crew_member_id,
                done_at=log.done_at,
            )
            for log in logs
        ],
    )
