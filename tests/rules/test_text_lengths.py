"""Values written into bounded columns must fit (PostgreSQL enforces lengths)."""

from spaceapp_logar.db.models import (
    ActionStepLog,
    AlertEvent,
    RedFlagReport,
    RuleEvaluationRecord,
)
from spaceapp_logar.rules.action_cards import all_action_cards
from spaceapp_logar.rules.catalog import RULES
from spaceapp_logar.rules.red_flags import RedFlag
from spaceapp_logar.schemas.measurements import METRIC_SPECS, Metric


def limit(column) -> int:
    return column.property.columns[0].type.length


def test_rule_and_card_identifiers_fit() -> None:
    for rule_id in RULES:
        assert len(rule_id) <= limit(RuleEvaluationRecord.rule_id)
        assert len(rule_id) <= limit(AlertEvent.rule_id)
    for card in all_action_cards():
        assert len(card.card_id) <= limit(RuleEvaluationRecord.action_card_id)
        for key in card.step_keys:
            assert len(key) <= limit(ActionStepLog.step_key)


def test_units_comparisons_and_metrics_fit() -> None:
    for spec in METRIC_SPECS.values():
        assert len(spec.unit) <= limit(RuleEvaluationRecord.unit)
    for metric in Metric:
        assert len(metric.value) <= 100
    for comparison in (">", "<", ">=", "jump>", "x>=", "valid"):
        assert len(comparison) <= limit(RuleEvaluationRecord.comparison)


def test_all_red_flags_together_fit() -> None:
    joined = ",".join(flag.value for flag in RedFlag)

    assert len(joined) <= limit(RedFlagReport.flags)


def test_rule_source_is_unbounded_text() -> None:
    assert limit(RuleEvaluationRecord.source) is None
