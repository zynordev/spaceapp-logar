"""Personal baseline ("personal normal") per crew member or habitat target.

Policy (DEMO, docs/biyo.md section 5, decision 5.1-C):
- A baseline is the astronaut's (or module's) own earlier, stable data in the
  current environment and activity context. There are no population "normal
  range" tables for the Moon or Mars.
- A new environment context starts a new profile.
- Excluded from learning: non-VALID or physically impossible values, periods
  with an active alert on the same target, red-flag alerts, and the 12 hours
  after a check-in with any symptom >= 2/4. Sick or faulty periods never
  become "normal".
- Too little data => classification ESTIMATED_RESEARCH; rules must not treat
  it as an established normal.
- Snapshots (``baseline_profiles``) are immutable versions; activating an
  earlier snapshot is the rollback. The latest activation per key wins; a
  NULL profile means "computed automatically".
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import isfinite
from statistics import median
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import (
    AlertEvent,
    BaselineProfile,
    BaselineProfileActivation,
    EnvironmentContext,
    Observation,
    SubjectiveCheckIn,
)
from spaceapp_logar.rules.catalog import RULES
from spaceapp_logar.schemas.measurements import METRIC_SPECS, Metric, is_plausible
from spaceapp_logar.services.environment import context_at, context_by_id, next_context_start

ESTABLISHED = "ESTABLISHED"
ESTIMATED_RESEARCH = "ESTIMATED_RESEARCH"
STATUS_LABELS = {ESTABLISHED: "personal_stable", ESTIMATED_RESEARCH: "estimated/research"}
SYMPTOM_FIELDS = ("fatigue", "dizziness", "nausea", "pain", "mood_distress")
SYMPTOM_EXCLUSION_HOURS = 12
ANY = "ANY"
NO_ENVIRONMENT = "NONE"

# (min_samples, max_samples) per metric; minute-level vitals 30-60.
DEFAULT_SAMPLE_LIMITS: dict[str, tuple[int, int]] = {
    Metric.HEART_RATE.value: (30, 60),
    Metric.SPO2.value: (30, 60),
    Metric.RESPIRATION_RATE.value: (30, 60),
    Metric.BODY_TEMPERATURE.value: (30, 60),
    Metric.SYSTOLIC_BP.value: (5, 20),
    Metric.DIASTOLIC_BP.value: (5, 20),
    Metric.SLEEP_DURATION.value: (3, 7),
    Metric.CABIN_CO2_PARTIAL_PRESSURE.value: (30, 60),
    Metric.CABIN_O2_FRACTION.value: (30, 60),
    Metric.CABIN_PRESSURE.value: (30, 60),
    Metric.RADIATION_DOSE_RATE.value: (10, 60),
}


@dataclass(frozen=True, slots=True)
class BaselineProfileResult:
    median: float | None
    p10: float | None
    p25: float | None
    p75: float | None
    p90: float | None
    sample_count: int
    min_samples_required: int
    excluded_count: int
    is_sufficient: bool
    classification: str
    status_label: str
    evidence_level: str
    environment_location: str | None
    environment_context_id: UUID | None
    activity_state: str | None
    profile_id: UUID | None
    profile_version: int
    limitation_note: str


def percentile(values: list[float], fraction: float) -> float:
    """Linear-interpolated percentile of already sorted values."""

    if len(values) == 1:
        return values[0]
    position = (len(values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def activity_key(activity_state: str | None, allowed_activities: frozenset | None) -> str:
    if activity_state:
        return activity_state
    if allowed_activities:
        return "+".join(sorted(str(item) for item in allowed_activities if item))
    return ANY


def environment_key(context: EnvironmentContext | None) -> str:
    return str(context.id) if context is not None else NO_ENVIRONMENT


def _is_environment_metric(metric: str) -> bool:
    try:
        spec = METRIC_SPECS[Metric(metric)]
    except ValueError:
        return False
    return spec.target_type.value == "ENVIRONMENT"


def _rules_for_metric(metric: str) -> set[str]:
    return {
        rule_id
        for rule_id, info in RULES.items()
        if info.metric == metric or metric in info.related_metrics
    }


def _exclusion_windows(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    metric: str,
    start: datetime | None,
    before: datetime,
) -> tuple[list[tuple[datetime, datetime]], list[str]]:
    reasons: list[str] = []
    alert_query = select(AlertEvent).where(
        AlertEvent.mission_id == mission_id,
        AlertEvent.target_id == target_id,
        AlertEvent.opened_at < before,
        or_(AlertEvent.resolved_at.is_(None), AlertEvent.resolved_at > (start or datetime.min.replace(tzinfo=timezone.utc))),
    )
    if _is_environment_metric(metric):
        # A CO2 alert says nothing about the radiation baseline of a module.
        alert_query = alert_query.where(AlertEvent.rule_id.in_(_rules_for_metric(metric)))
    windows: list[tuple[datetime, datetime]] = []
    for alert in session.scalars(alert_query).all():
        windows.append((alert.opened_at, alert.resolved_at or before))
    if windows:
        reasons.append("active alarm windows (including red flags)")

    if not _is_environment_metric(metric):
        symptom_query = select(SubjectiveCheckIn).where(
            SubjectiveCheckIn.mission_id == mission_id,
            SubjectiveCheckIn.crew_member_id == target_id,
            SubjectiveCheckIn.observed_at < before,
            or_(*(getattr(SubjectiveCheckIn, name) >= 2 for name in SYMPTOM_FIELDS)),
        )
        hits = 0
        for check_in in session.scalars(symptom_query).all():
            windows.append(
                (
                    check_in.observed_at,
                    check_in.observed_at + timedelta(hours=SYMPTOM_EXCLUSION_HOURS),
                )
            )
            hits += 1
        if hits:
            reasons.append(f"{SYMPTOM_EXCLUSION_HOURS} hours after a subjective entry with a symptom score ≥2/4")
    return windows, reasons


def _active_snapshot(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    metric: str,
    activity: str,
    environment: str,
) -> BaselineProfile | None:
    activation = session.scalar(
        select(BaselineProfileActivation)
        .where(
            BaselineProfileActivation.mission_id == mission_id,
            BaselineProfileActivation.target_id == target_id,
            BaselineProfileActivation.metric == metric,
            BaselineProfileActivation.activity_key == activity,
            BaselineProfileActivation.environment_key == environment,
        )
        .order_by(BaselineProfileActivation.activated_at.desc())
        .limit(1)
    )
    if activation is None or activation.profile_id is None:
        return None
    return session.get(BaselineProfile, activation.profile_id)


def _from_snapshot(
    snapshot: BaselineProfile, activity_state: str | None
) -> BaselineProfileResult:
    sufficient = snapshot.classification == ESTABLISHED
    return BaselineProfileResult(
        median=snapshot.median,
        p10=snapshot.p10,
        p25=snapshot.p25,
        p75=snapshot.p75,
        p90=snapshot.p90,
        sample_count=snapshot.sample_count,
        min_samples_required=snapshot.min_samples_required,
        excluded_count=snapshot.excluded_count,
        is_sufficient=sufficient,
        classification=snapshot.classification,
        status_label=STATUS_LABELS[snapshot.classification],
        evidence_level="personal data" if sufficient else "F",
        environment_location=snapshot.environment_location,
        environment_context_id=snapshot.environment_context_id,
        activity_state=activity_state,
        profile_id=snapshot.id,
        profile_version=snapshot.version,
        limitation_note=(
            f"Pinned profile version v{snapshot.version} is in use "
            f"({snapshot.reason})."
        ),
    )


def get_personal_baseline(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    metric: str,
    before: datetime,
    activity_state: str | None = None,
    allowed_activities: frozenset | None = None,
    environment_location: str | None = None,
    environment_context_id: UUID | None = None,
    min_samples: int | None = None,
    max_samples: int | None = None,
    use_active_snapshot: bool = True,
) -> BaselineProfileResult:
    """Personal baseline from data recorded strictly before ``before``.

    If a snapshot is active for this key it is returned instead of a fresh
    computation (``use_active_snapshot=False`` forces a fresh computation).
    """

    default_min, default_max = DEFAULT_SAMPLE_LIMITS.get(metric, (30, 60))
    min_required = min_samples if min_samples is not None else default_min
    max_used = max_samples if max_samples is not None else default_max
    allowed = frozenset({activity_state}) if activity_state else allowed_activities

    context = (
        context_by_id(session, environment_context_id)
        if environment_context_id is not None
        else context_at(session, mission_id, before)
    )
    if (
        context is not None
        and environment_location is not None
        and context.location != environment_location
    ):
        context = None
    activity = activity_key(activity_state, allowed_activities)
    env_key = environment_key(context)

    snapshot = (
        _active_snapshot(
            session,
            mission_id=mission_id,
            target_id=target_id,
            metric=metric,
            activity=activity,
            environment=env_key,
        )
        if use_active_snapshot
        else None
    )
    if snapshot is not None:
        return _from_snapshot(snapshot, activity_state)

    start = context.effective_at if context is not None else None
    end = before
    if context is not None:
        following = next_context_start(session, mission_id, context.effective_at)
        if following is not None and following < end:
            end = following

    query = (
        select(Observation)
        .where(
            Observation.mission_id == mission_id,
            Observation.target_id == target_id,
            Observation.metric == metric,
            Observation.observed_at < end,
        )
        .order_by(Observation.observed_at.asc())
        .limit(max_used * 6)
    )
    if start is not None:
        query = query.where(Observation.observed_at >= start)
    rows = session.scalars(query).all()

    windows, reasons = _exclusion_windows(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=metric,
        start=start,
        before=end,
    )
    values: list[float] = []
    excluded = 0
    quality_excluded = 0
    for row in rows:
        if allowed is not None and row.activity_state not in allowed:
            continue
        if (
            row.reported_quality != "VALID"
            or not isfinite(row.value)
            or not is_plausible(row.metric, row.value)
        ):
            excluded += 1
            quality_excluded += 1
            continue
        if any(begin <= row.observed_at < finish for begin, finish in windows):
            excluded += 1
            continue
        values.append(row.value)
        if len(values) >= max_used:
            break
    if quality_excluded:
        reasons.insert(0, "invalid or physically impossible data")

    sufficient = len(values) >= min_required
    classification = ESTABLISHED if sufficient else ESTIMATED_RESEARCH
    ordered = sorted(values)
    location = context.location if context is not None else None
    notes = [
        f"{len(values)} samples (required {min_required}, at most {max_used})",
        f"environment: {location or 'undefined (whole mission)'}",
        f"context: {activity}",
    ]
    if reasons:
        notes.append("excluded: " + "; ".join(reasons) + f" ({excluded} samples)")
    if not sufficient:
        notes.append(
            "insufficient data: estimated/research; not used as an established personal norm"
        )
    if location in ("LUNAR_HABITAT", "MARS_HABITAT"):
        notes.append("No population norm exists for the Moon or Mars; only the person's own data is used")

    return BaselineProfileResult(
        median=float(median(ordered)) if ordered else None,
        p10=percentile(ordered, 0.10) if ordered else None,
        p25=percentile(ordered, 0.25) if ordered else None,
        p75=percentile(ordered, 0.75) if ordered else None,
        p90=percentile(ordered, 0.90) if ordered else None,
        sample_count=len(values),
        min_samples_required=min_required,
        excluded_count=excluded,
        is_sufficient=sufficient,
        classification=classification,
        status_label=STATUS_LABELS[classification],
        evidence_level="personal data" if sufficient else "F",
        environment_location=location,
        environment_context_id=context.id if context is not None else None,
        activity_state=activity_state,
        profile_id=None,
        profile_version=0,
        limitation_note="; ".join(notes) + ".",
    )


def snapshot_baseline(
    session: Session,
    *,
    mission_id: str,
    target_id: str,
    metric: str,
    before: datetime,
    activity_state: str | None,
    created_by: str,
    reason: str,
    activate: bool = True,
) -> BaselineProfile:
    """Freeze the currently computed baseline as a new immutable version."""

    context = context_at(session, mission_id, before)
    activity = activity_key(activity_state, None)
    env_key = environment_key(context)
    # Freeze what the data says now, not whatever snapshot is currently active.
    result = get_personal_baseline(
        session,
        mission_id=mission_id,
        target_id=target_id,
        metric=metric,
        before=before,
        activity_state=activity_state,
        use_active_snapshot=False,
    )
    version = (
        session.scalar(
            select(func.max(BaselineProfile.version)).where(
                BaselineProfile.mission_id == mission_id,
                BaselineProfile.target_id == target_id,
                BaselineProfile.metric == metric,
                BaselineProfile.activity_key == activity,
                BaselineProfile.environment_key == env_key,
            )
        )
        or 0
    ) + 1
    profile = BaselineProfile(
        mission_id=mission_id,
        target_id=target_id,
        metric=metric,
        activity_key=activity,
        environment_key=env_key,
        environment_context_id=context.id if context is not None else None,
        environment_location=context.location if context is not None else None,
        version=version,
        median=result.median,
        p10=result.p10,
        p25=result.p25,
        p75=result.p75,
        p90=result.p90,
        sample_count=result.sample_count,
        min_samples_required=result.min_samples_required,
        excluded_count=result.excluded_count,
        classification=result.classification,
        computed_before=before,
        created_by=created_by,
        reason=reason,
    )
    session.add(profile)
    session.flush()
    if activate:
        activate_profile(session, profile, activated_by=created_by, reason=reason)
    return profile


def activate_profile(
    session: Session,
    profile: BaselineProfile | None,
    *,
    activated_by: str,
    reason: str,
    key: tuple[str, str, str, str, str] | None = None,
) -> BaselineProfileActivation:
    """Put a snapshot in force (or ``None`` = automatic) for its profile key."""

    if profile is not None:
        key = (
            profile.mission_id,
            profile.target_id,
            profile.metric,
            profile.activity_key,
            profile.environment_key,
        )
    assert key is not None
    mission_id, target_id, metric, activity, env = key
    activation = BaselineProfileActivation(
        mission_id=mission_id,
        target_id=target_id,
        metric=metric,
        activity_key=activity,
        environment_key=env,
        profile_id=profile.id if profile is not None else None,
        activated_by=activated_by,
        reason=reason,
        activated_at=datetime.now(timezone.utc),
    )
    session.add(activation)
    session.flush()
    return activation
