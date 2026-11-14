from datetime import datetime, timedelta, timezone

import pytest

from spaceapp_logar.rules import (
    CO2Sample,
    DataQuality,
    HealthAttention,
    assess_co2_window,
)

UTC = timezone.utc
AS_OF = datetime(2026, 11, 14, 8, 59, tzinfo=UTC)
WINDOW_START = datetime(2026, 11, 14, 8, 0, tzinfo=UTC)


def sample(minute: int, value: float = 3.2) -> CO2Sample:
    return CO2Sample(
        observed_at=WINDOW_START + timedelta(minutes=minute),
        ppco2_mmhg=value,
        data_quality=DataQuality.VALID,
    )


def test_complete_hour_produces_watch_for_elevated_average() -> None:
    assessment = assess_co2_window(
        [sample(minute) for minute in range(60)],
        as_of=AS_OF,
    )

    assert assessment.window.valid_minute_buckets == 60
    assert assessment.window.average_ppco2_mmhg == pytest.approx(3.2)
    assert assessment.window.data_quality is DataQuality.VALID
    assert assessment.evaluation.health_attention is HealthAttention.WATCH


def test_54_distributed_minutes_are_sufficient() -> None:
    missing = {5, 15, 25, 35, 45, 55}
    assessment = assess_co2_window(
        [sample(minute, 2.5) for minute in range(60) if minute not in missing],
        as_of=AS_OF,
    )

    assert assessment.window.valid_minute_buckets == 54
    assert assessment.window.longest_missing_run_minutes == 1
    assert assessment.window.data_quality is DataQuality.VALID
    assert assessment.evaluation.health_attention is HealthAttention.NORMAL


def test_fewer_than_54_minutes_produces_unknown() -> None:
    assessment = assess_co2_window(
        [sample(minute) for minute in range(53)],
        as_of=AS_OF,
    )

    assert assessment.window.data_quality is DataQuality.MISSING
    assert assessment.window.average_ppco2_mmhg is None
    assert assessment.evaluation.health_attention is HealthAttention.UNKNOWN


def test_six_minute_gap_produces_unknown_even_with_54_buckets() -> None:
    assessment = assess_co2_window(
        [sample(minute) for minute in range(6, 60)],
        as_of=AS_OF,
    )

    assert assessment.window.valid_minute_buckets == 54
    assert assessment.window.longest_missing_run_minutes == 6
    assert assessment.window.data_quality is DataQuality.MISSING
    assert assessment.evaluation.health_attention is HealthAttention.UNKNOWN


def test_each_minute_is_equally_weighted_despite_high_frequency_burst() -> None:
    samples = [sample(minute, 2.0) for minute in range(1, 60)]
    samples.extend(sample(0, 10.0) for _ in range(100))

    assessment = assess_co2_window(samples, as_of=AS_OF)

    expected = (10.0 + (59 * 2.0)) / 60
    assert assessment.window.average_ppco2_mmhg == pytest.approx(expected)


def test_suspect_samples_are_ignored() -> None:
    samples = [sample(minute) for minute in range(54)]
    samples.append(
        CO2Sample(
            observed_at=WINDOW_START + timedelta(minutes=54),
            ppco2_mmhg=3.2,
            data_quality=DataQuality.SUSPECT,
        )
    )

    assessment = assess_co2_window(samples, as_of=AS_OF)

    assert assessment.window.ignored_observations == 1
    assert assessment.window.valid_minute_buckets == 54


def test_window_rejects_naive_timestamps() -> None:
    with pytest.raises(ValueError, match="timezone"):
        assess_co2_window([], as_of=datetime(2026, 11, 14, 8, 59))

