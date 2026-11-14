"""Rule and card text must fit the columns that store it.

SQLite does not enforce VARCHAR lengths, so a too-long value only fails on
PostgreSQL. These checks catch it locally.
"""

from spaceapp_logar.rules.action_cards import all_action_cards
from spaceapp_logar.rules.catalog import RULES

STRING_LIMITS = {"rule_id": 100, "source_uri": 500, "card_id": 100, "step_key": 100}


def test_rule_ids_fit_their_columns() -> None:
    for rule_id in RULES:
        assert len(rule_id) <= STRING_LIMITS["rule_id"], rule_id


def test_card_ids_and_step_keys_fit_their_columns() -> None:
    for card in all_action_cards():
        assert len(card.card_id) <= STRING_LIMITS["card_id"], card.card_id
        for key in card.step_keys:
            assert len(key) <= STRING_LIMITS["step_key"], key
