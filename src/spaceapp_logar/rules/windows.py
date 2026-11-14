"""Generic minute-bucket time windows shared by vital-sign rules.

Same idea as the CO2 window: readings are first averaged per minute so a burst
of samples cannot dominate, and a window is only usable with enough coverage
and no long gap.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import ceil
from statistics import fmean


@dataclass(frozen=True, slots=True)
class WindowSample:
    observed_at: datetime
    value: float
    usable: bool


@dataclass(frozen=True, slots=True)
class MinuteWindow:
    window_start: datetime
    window_end: datetime
    window_minutes: int
    valid_minute_buckets: int
    required_minute_buckets: int
    longest_missing_run_minutes: int
    max_missing_run_minutes: int
    ignored_observations: int
    average: float | None

    @property
    def sufficient(self) -> bool:
        return self.average is not None


def required_buckets(window_minutes: int) -> int:
    """At least 90% of the minute buckets must hold usable data."""

    return ceil(window_minutes * 0.9)


def max_missing_run(window_minutes: int) -> int:
    """Longest tolerated gap: one twelfth of the window, at least one minute."""

    return max(1, window_minutes // 12)


def window_bounds(as_of: datetime, window_minutes: int) -> tuple[datetime, datetime]:
    as_of_utc = as_utc(as_of)
    window_end = as_of_utc.replace(second=0, microsecond=0) + timedelta(minutes=1)
    return window_end - timedelta(minutes=window_minutes), window_end


def aggregate_minute_window(
    samples: list[WindowSample],
    *,
    as_of: datetime,
    window_minutes: int,
) -> MinuteWindow:
    window_start, window_end = window_bounds(as_of, window_minutes)
    buckets: list[list[float]] = [[] for _ in range(window_minutes)]
    ignored = 0
    for sample in samples:
        observed_at = as_utc(sample.observed_at)
        if not window_start <= observed_at < window_end:
            continue
        if not sample.usable:
            ignored += 1
            continue
        index = int((observed_at - window_start).total_seconds() // 60)
        buckets[index].append(sample.value)

    averages = [fmean(values) if values else None for values in buckets]
    valid = sum(value is not None for value in averages)
    longest = _longest_missing_run(averages)
    needed = required_buckets(window_minutes)
    allowed_gap = max_missing_run(window_minutes)
    sufficient = valid >= needed and longest <= allowed_gap
    average = (
        fmean(value for value in averages if value is not None) if sufficient else None
    )
    return MinuteWindow(
        window_start=window_start,
        window_end=window_end,
        window_minutes=window_minutes,
        valid_minute_buckets=valid,
        required_minute_buckets=needed,
        longest_missing_run_minutes=longest,
        max_missing_run_minutes=allowed_gap,
        ignored_observations=ignored,
        average=average,
    )


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


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamps must include a timezone")
    return value.astimezone(timezone.utc)
