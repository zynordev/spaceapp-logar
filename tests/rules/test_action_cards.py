from spaceapp_logar.rules.action_cards_v2 import ENV_CO2_WATCH_CARD_V2
from spaceapp_logar.rules import (
    ENV_CO2_WATCH_CARD_V1,
    DataQuality,
    HealthAttention,
    evaluate_co2_nominal,
    get_action_card,
    select_action_card,
)


def test_co2_watch_selects_the_approved_card() -> None:
    evaluation = evaluate_co2_nominal(3.2)

    card = select_action_card(evaluation)

    assert evaluation.health_attention is HealthAttention.WATCH
    assert card is ENV_CO2_WATCH_CARD_V2


def test_normal_co2_shows_no_card() -> None:
    evaluation = evaluate_co2_nominal(2.5)

    assert select_action_card(evaluation) is None


def test_exactly_at_the_nominal_limit_shows_no_card() -> None:
    # The rule fires only when the average is strictly above 3 mmHg.
    assert select_action_card(evaluate_co2_nominal(3.0)) is None


def test_missing_or_suspect_data_never_shows_a_card() -> None:
    assert select_action_card(evaluate_co2_nominal(None)) is None
    assert (
        select_action_card(evaluate_co2_nominal(3.5, data_quality=DataQuality.SUSPECT))
        is None
    )
    assert (
        select_action_card(evaluate_co2_nominal(3.5, data_quality=DataQuality.FAULT))
        is None
    )


def test_card_keeps_its_approved_safety_limits() -> None:
    card = ENV_CO2_WATCH_CARD_V2

    assert card.card_id == "ENV_CO2_WATCH_CARD_V2"
    assert card.version == 2
    assert card.attention is HealthAttention.WATCH
    assert card.rule_id == "ENV_CO2_NOMINAL_V1"
    assert card.requires_mission_procedure is True
    # The software must never command vehicle equipment on its own.
    assert card.allows_automatic_vehicle_command is False
    assert card.step_keys == (
        "check_airflow",
        "compare_modules",
        "check_removal_system",
        "record_check_in",
    )
    assert card.title_tr.startswith("Cabin CO₂ high")
    assert all(step.why_tr for step in card.steps)
    assert card.reassess_minutes == 30
    assert card.escalate_if_tr and card.closes_when_tr
    assert card.validation_status == "APPROVED"


def test_stored_card_reference_resolves_to_the_catalog_entry() -> None:
    # Version 1 stays resolvable for evaluations stored before version 2.
    assert get_action_card("ENV_CO2_WATCH_CARD_V1", 1) is ENV_CO2_WATCH_CARD_V1
    assert get_action_card("ENV_CO2_WATCH_CARD_V2", 2) is ENV_CO2_WATCH_CARD_V2
    assert get_action_card("ENV_CO2_WATCH_CARD_V1", 2) is None
    assert get_action_card("UNKNOWN_CARD", 1) is None
