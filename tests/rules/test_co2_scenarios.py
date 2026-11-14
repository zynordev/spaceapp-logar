"""CO2 scenario cases from docs/biyo.md section 13.5 that the current rule can answer.

Each case states the expected attention level and whether a card is shown.
"""

from datetime import datetime, timedelta, timezone
from math import inf, nan

import pytest

from spaceapp_logar.rules import (
    CO2Sample,
    DataQuality,
    HealthAttention,
    assess_co2_window,
    select_action_card,
)

UTC = timezone.utc
AS_OF = datetime(2026, 11, 14, 8, 59, tzinfo=UTC)
WINDOW_START = datetime(2026, 11, 14, 8, 0, tzinfo=UTC)


def sample(
    minute: int,
    value: float,
    quality: DataQuality = DataQuality.VALID,
) -> CO2Sample:
    return CO2Sample(
        observed_at=WINDOW_START + timedelta(minutes=minute),
        ppco2_mmhg=value,
        data_quality=quality,
    )


def hour(value: float) -> list[CO2Sample]:
    return [sample(minute, value) for minute in range(60)]


def test_normal_hour_shows_no_card() -> None:
    assessment = assess_co2_window(hour(2.2), as_of=AS_OF)

    assert assessment.evaluation.health_attention is HealthAttention.NORMAL
    assert select_action_card(assessment.evaluation) is None


def test_mild_deviation_just_above_limit_is_watch_with_card() -> None:
    assessment = assess_co2_window(hour(3.01), as_of=AS_OF)

    assert assessment.evaluation.health_attention is HealthAttention.WATCH
    assert select_action_card(assessment.evaluation) is not None


def test_average_exactly_at_limit_is_normal() -> None:
    assessment = assess_co2_window(hour(3.0), as_of=AS_OF)

    assert assessment.evaluation.health_attention is HealthAttention.NORMAL
    assert select_action_card(assessment.evaluation) is None


def test_single_transient_spike_does_not_trigger_watch() -> None:
    samples = [sample(minute, 2.0) for minute in range(59)]
    samples.append(sample(59, 12.0))

    assessment = assess_co2_window(samples, as_of=AS_OF)

    assert assessment.window.average_ppco2_mmhg == pytest.approx(
        (59 * 2.0 + 12.0) / 60
    )
    assert assessment.evaluation.health_attention is HealthAttention.NORMAL


def test_persistent_deviation_over_the_whole_hour_is_watch() -> None:
    assessment = assess_co2_window(hour(3.6), as_of=AS_OF)

    assert assessment.evaluation.health_attention is HealthAttention.WATCH
    assert assessment.evaluation.observed_value == pytest.approx(3.6)


def test_all_faulty_sensor_hour_is_unknown_and_shows_no_card() -> None:
    samples = [sample(minute, 3.5, DataQuality.FAULT) for minute in range(60)]

    assessment = assess_co2_window(samples, as_of=AS_OF)

    assert assessment.window.valid_minute_buckets == 0
    assert assessment.window.ignored_observations == 60
    assert assessment.evaluation.health_attention is HealthAttention.UNKNOWN
    assert select_action_card(assessment.evaluation) is None


def test_impossible_values_are_ignored_and_do_not_move_the_average() -> None:
    samples = [sample(minute, 2.5) for minute in range(57)]
    samples.extend(
        [
            sample(57, -1.0),
            sample(58, nan),
            sample(59, inf),
        ]
    )

    assessment = assess_co2_window(samples, as_of=AS_OF)

    assert assessment.window.ignored_observations == 3
    assert assessment.window.average_ppco2_mmhg == pytest.approx(2.5)
    assert assessment.evaluation.health_attention is HealthAttention.NORMAL


def test_bad_values_that_leave_a_long_gap_make_the_hour_unknown() -> None:
    samples = [sample(minute, 3.5) for minute in range(54)]
    samples.extend(sample(minute, -1.0) for minute in range(54, 60))

    assessment = assess_co2_window(samples, as_of=AS_OF)

    assert assessment.window.longest_missing_run_minutes == 6
    assert assessment.evaluation.health_attention is HealthAttention.UNKNOWN
    assert select_action_card(assessment.evaluation) is None


def test_suspect_high_readings_do_not_create_a_watch() -> None:
    samples = [sample(minute, 2.5) for minute in range(54)]
    samples.extend(
        sample(minute, 9.0, DataQuality.SUSPECT) for minute in range(54, 60)
    )

    assessment = assess_co2_window(samples, as_of=AS_OF)

    assert assessment.window.ignored_observations == 6
    assert assessment.evaluation.health_attention is HealthAttention.UNKNOWN
    assert select_action_card(assessment.evaluation) is None


def test_readings_outside_the_window_are_ignored() -> None:
    samples = hour(2.5)
    samples.append(
        CO2Sample(
            observed_at=WINDOW_START - timedelta(minutes=1),
            ppco2_mmhg=9.0,
            data_quality=DataQuality.VALID,
        )
    )
    samples.append(
        CO2Sample(
            observed_at=WINDOW_START + timedelta(minutes=60),
            ppco2_mmhg=9.0,
            data_quality=DataQuality.VALID,
        )
    )

    assessment = assess_co2_window(samples, as_of=AS_OF)

    assert assessment.window.average_ppco2_mmhg == pytest.approx(2.5)
    assert assessment.evaluation.health_attention is HealthAttention.NORMAL
