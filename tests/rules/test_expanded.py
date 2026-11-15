import pytest

from spaceapp_logar.rules import select_action_card
from spaceapp_logar.rules.expanded import (
    SleepSymptoms,
    evaluate_cabin_atmosphere,
    evaluate_motion_sickness,
    evaluate_radiation,
    evaluate_sleep,
    evaluate_vision,
)
from spaceapp_logar.rules.models import HealthAttention


@pytest.mark.parametrize(
    ("o2", "pressure", "attention"),
    [
        (21.0, 101.3, HealthAttention.NORMAL),  # ISS-like sea-level atmosphere
        (34.0, 56.5, HealthAttention.NORMAL),  # low-pressure exploration atmosphere
        (17.0, 101.3, HealthAttention.WATCH),
        (15.0, 101.3, HealthAttention.ALERT),
        (21.0, 70.0, HealthAttention.ALERT),  # normal % but low pressure
    ],
)
def test_atmosphere_uses_oxygen_partial_pressure(o2, pressure, attention) -> None:
    evaluation = evaluate_cabin_atmosphere(o2, pressure, None)

    assert evaluation.health_attention is attention
    assert evaluation.unit == "kPa"


def test_atmosphere_without_data_is_unknown_and_reports_pressure_trend() -> None:
    assert evaluate_cabin_atmosphere(None, 101.3, None).health_attention is HealthAttention.UNKNOWN
    falling = evaluate_cabin_atmosphere(17.5, 99.0, -1.2)  # ppO2 17.3 kPa
    assert "falling" in falling.explanation
    assert select_action_card(falling).card_id == "ENV_CABIN_ATMOSPHERE_WATCH_CARD_V2"


@pytest.mark.parametrize(
    ("recent", "baseline", "attention"),
    [
        (26.0, 25.0, HealthAttention.NORMAL),
        (75.0, 25.0, HealthAttention.WATCH),
        (250.0, 25.0, HealthAttention.ALERT),
        (250.0, None, HealthAttention.UNKNOWN),
        (None, 25.0, HealthAttention.UNKNOWN),
    ],
)
def test_radiation_compares_with_module_baseline(recent, baseline, attention) -> None:
    evaluation = evaluate_radiation(recent, baseline, 0.123)

    assert evaluation.health_attention is attention
    assert "0.123 mSv" in evaluation.explanation
    assert "600 mSv" in evaluation.explanation


def test_radiation_alert_card_moves_crew_to_shelter() -> None:
    card = select_action_card(evaluate_radiation(400.0, 25.0, 1.0))

    assert card.card_id == "ENV_RADIATION_ALERT_CARD_V2"
    assert "move_to_shelter" in card.step_keys


@pytest.mark.parametrize(
    ("nights", "fatigue", "attention"),
    [
        ([7.0, 6.8], None, HealthAttention.NORMAL),
        ([5.5, 5.8, 5.6], None, HealthAttention.WATCH),
        ([4.5, 4.6, 4.4], None, HealthAttention.WATCH),  # very short but no symptom
        ([4.5, 4.6, 4.4], 3, HealthAttention.ALERT),
        ([4.5], 3, HealthAttention.UNKNOWN),
    ],
)
def test_sleep_debt(nights, fatigue, attention) -> None:
    evaluation = evaluate_sleep(nights, SleepSymptoms(fatigue=fatigue, mood_distress=None))

    assert evaluation.health_attention is attention


@pytest.mark.parametrize(
    ("nausea", "dizziness", "attention"),
    [
        (2, 2, HealthAttention.WATCH),
        (3, 1, HealthAttention.NORMAL),
        (0, 4, HealthAttention.NORMAL),
        (None, None, HealthAttention.UNKNOWN),
    ],
)
def test_motion_sickness_needs_both_symptoms(nausea, dizziness, attention) -> None:
    assert evaluate_motion_sickness(nausea, dizziness, None).health_attention is attention


def test_vision_change() -> None:
    assert evaluate_vision(2).health_attention is HealthAttention.WATCH
    assert evaluate_vision(1).health_attention is HealthAttention.NORMAL
    assert evaluate_vision(None).health_attention is HealthAttention.UNKNOWN
    assert select_action_card(evaluate_vision(3)).card_id == "SANS_VISION_WATCH_CARD_V2"
