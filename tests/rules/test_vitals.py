from datetime import datetime, timedelta, timezone

import pytest

from spaceapp_logar.rules import select_action_card
from spaceapp_logar.rules.models import DataQuality, HealthAttention
from spaceapp_logar.rules.vitals import (
    SymptomContext,
    evaluate_cardio_resp,
    evaluate_hr_jump,
    evaluate_spo2,
    evaluate_temperature,
)
from spaceapp_logar.rules.windows import (
    WindowSample,
    aggregate_minute_window,
    max_missing_run,
    required_buckets,
)

UTC = timezone.utc
END = datetime(2026, 11, 14, 9, 59, tzinfo=UTC)


def window(value: float, minutes: int, *, usable: bool = True, count: int | None = None):
    start = END - timedelta(minutes=minutes - 1)
    samples = [
        WindowSample(start + timedelta(minutes=m), value, usable)
        for m in range(count if count is not None else minutes)
    ]
    return aggregate_minute_window(samples, as_of=END, window_minutes=minutes)


NO_SYMPTOMS = SymptomContext(max_score=None, fields=())


@pytest.mark.parametrize(
    ("minutes", "needed", "gap"),
    [(10, 9, 1), (15, 14, 1), (60, 54, 5)],
)
def test_window_coverage_rules(minutes: int, needed: int, gap: int) -> None:
    assert required_buckets(minutes) == needed
    assert max_missing_run(minutes) == gap


def test_unusable_samples_leave_the_window_insufficient() -> None:
    result = window(98.0, 10, usable=False)

    assert result.average is None
    assert result.ignored_observations == 10


@pytest.mark.parametrize(
    ("value", "attention"),
    [
        (98.0, HealthAttention.NORMAL),
        (95.0, HealthAttention.NORMAL),
        (94.9, HealthAttention.WATCH),
        (92.0, HealthAttention.WATCH),
        (91.9, HealthAttention.ALERT),
    ],
)
def test_spo2_levels(value: float, attention: HealthAttention) -> None:
    evaluation = evaluate_spo2(window(value, 10))

    assert evaluation.health_attention is attention
    assert evaluation.data_quality is DataQuality.VALID


def test_spo2_without_enough_data_is_unknown_and_has_no_card() -> None:
    evaluation = evaluate_spo2(window(90.0, 10, count=5))

    assert evaluation.health_attention is HealthAttention.UNKNOWN
    assert select_action_card(evaluation) is None


def test_spo2_cards_follow_the_level() -> None:
    watch = select_action_card(evaluate_spo2(window(93.0, 10)))
    alert = select_action_card(evaluate_spo2(window(90.0, 10)))

    assert watch.card_id == "VITAL_SPO2_WATCH_CARD_V1"
    assert alert.card_id == "VITAL_SPO2_ALERT_CARD_V1"
    assert watch.validation_status == "DEMO_PENDING_REVIEW"
    assert alert.allows_automatic_vehicle_command is False


@pytest.mark.parametrize(
    ("mean", "baseline", "attention"),
    [
        (36.8, 36.7, HealthAttention.NORMAL),
        (37.7, 36.7, HealthAttention.WATCH),
        (37.6, 36.7, HealthAttention.NORMAL),
        (38.0, 36.7, HealthAttention.ALERT),
        (38.0, None, HealthAttention.ALERT),
        (37.5, None, HealthAttention.UNKNOWN),
    ],
)
def test_temperature_levels(
    mean: float, baseline: float | None, attention: HealthAttention
) -> None:
    assert evaluate_temperature(window(mean, 60), baseline).health_attention is attention


def test_cardio_resp_needs_both_signals_and_a_symptom_for_alert() -> None:
    high_hr = window(90.0, 15)
    high_rr = window(22.0, 15)
    normal_rr = window(15.0, 15)
    symptomatic = SymptomContext(max_score=3, fields=("yorgunluk",))
    mild = SymptomContext(max_score=1, fields=())

    assert (
        evaluate_cardio_resp(high_hr, high_rr, 68.0, symptomatic).health_attention
        is HealthAttention.ALERT
    )
    assert (
        evaluate_cardio_resp(high_hr, high_rr, 68.0, mild).health_attention
        is HealthAttention.WATCH
    )
    assert (
        evaluate_cardio_resp(high_hr, high_rr, 68.0, NO_SYMPTOMS).health_attention
        is HealthAttention.WATCH
    )
    assert (
        evaluate_cardio_resp(high_hr, normal_rr, 68.0, symptomatic).health_attention
        is HealthAttention.NORMAL
    )


def test_symptom_alone_never_raises_cardio_resp() -> None:
    evaluation = evaluate_cardio_resp(
        window(70.0, 15),
        window(14.0, 15),
        68.0,
        SymptomContext(max_score=4, fields=("baş dönmesi",)),
    )

    assert evaluation.health_attention is HealthAttention.NORMAL


def test_cardio_resp_without_baseline_is_unknown() -> None:
    evaluation = evaluate_cardio_resp(window(95.0, 15), window(24.0, 15), None, NO_SYMPTOMS)

    assert evaluation.health_attention is HealthAttention.UNKNOWN


@pytest.mark.parametrize(
    ("previous", "latest", "seconds", "quality"),
    [
        (70.0, 165.0, 60, DataQuality.SUSPECT),
        (70.0, 105.0, 60, DataQuality.VALID),
        (70.0, 165.0, 600, DataQuality.VALID),
        (None, 165.0, None, DataQuality.VALID),
    ],
)
def test_hr_jump(previous, latest, seconds, quality) -> None:
    evaluation = evaluate_hr_jump(previous, latest, seconds)

    assert evaluation.data_quality is quality
    if quality is DataQuality.SUSPECT:
        assert evaluation.health_attention is HealthAttention.UNKNOWN
        assert select_action_card(evaluation).card_id == "DATA_HR_SENSOR_CHECK_CARD_V1"
