from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import isfinite
from statistics import fmean

from spaceapp_logar.rules.co2 import evaluate_co2_nominal
from spaceapp_logar.rules.models import DataQuality, RuleEvaluation

WINDOW_MINUTES = 60
MIN_VALID_MINUTE_BUCKETS = 54
MAX_CONSECUTIVE_MISSING_MINUTES = 5


@dataclass(frozen=True, slots=True)
class CO2Sample:
    observed_at: datetime
    ppco2_mmhg: float
    data_quality: DataQuality


@dataclass(frozen=True, slots=True)
class CO2WindowSummary:
    window_start: datetime
    window_end: datetime
    valid_minute_buckets: int
    required_minute_buckets: int
    longest_missing_run_minutes: int
    ignored_observations: int
    average_ppco2_mmhg: float | None
    data_quality: DataQuality


@dataclass(frozen=True, slots=True)
class CO2WindowAssessment:
    window: CO2WindowSummary
    evaluation: RuleEvaluation


def co2_window_bounds(as_of: datetime) -> tuple[datetime, datetime]:
    """Return the 60 wall-clock minute buckets containing ``as_of``."""

    as_of_utc = _as_utc(as_of)
    window_end = as_of_utc.replace(second=0, microsecond=0) + timedelta(minutes=1)
    return window_end - timedelta(minutes=WINDOW_MINUTES), window_end


def aggregate_co2_window(
    samples: list[CO2Sample],
    *,
    as_of: datetime,
) -> CO2WindowSummary:
    """Build an equally weighted one-hour summary from valid minute buckets."""

    window_start, window_end = co2_window_bounds(as_of)
    buckets: list[list[float]] = [[] for _ in range(WINDOW_MINUTES)]
    ignored_observations = 0

    for sample in samples:
        observed_at = _as_utc(sample.observed_at)
        if not window_start <= observed_at < window_end:
            continue
        if (
            sample.data_quality is not DataQuality.VALID
            or not isfinite(sample.ppco2_mmhg)
            or sample.ppco2_mmhg < 0
        ):
            ignored_observations += 1
            continue

        bucket_index = int((observed_at - window_start).total_seconds() // 60)
        buckets[bucket_index].append(sample.ppco2_mmhg)

    bucket_averages = [fmean(values) if values else None for values in buckets]
    valid_bucket_count = sum(value is not None for value in bucket_averages)
    longest_missing_run = _longest_missing_run(bucket_averages)
    sufficient = (
        valid_bucket_count >= MIN_VALID_MINUTE_BUCKETS
        and longest_missing_run <= MAX_CONSECUTIVE_MISSING_MINUTES
    )
    average = (
        fmean(value for value in bucket_averages if value is not None)
        if sufficient
        else None
    )

    return CO2WindowSummary(
        window_start=window_start,
        window_end=window_end,
        valid_minute_buckets=valid_bucket_count,
        required_minute_buckets=MIN_VALID_MINUTE_BUCKETS,
        longest_missing_run_minutes=longest_missing_run,
        ignored_observations=ignored_observations,
        average_ppco2_mmhg=average,
        data_quality=DataQuality.VALID if sufficient else DataQuality.MISSING,
    )


def assess_co2_window(
    samples: list[CO2Sample],
    *,
    as_of: datetime,
) -> CO2WindowAssessment:
    summary = aggregate_co2_window(samples, as_of=as_of)
    evaluation = evaluate_co2_nominal(
        summary.average_ppco2_mmhg,
        summary.data_quality,
    )
    return CO2WindowAssessment(window=summary, evaluation=evaluation)


def _longest_missing_run(values: list[float | None]) -> int:
    longest = 0
    current = 0
    for value in values:
        if value is None:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("CO2 window timestamps must include a timezone")
    return value.astimezone(timezone.utc)

