from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    JSON,
    Integer,
    String,
    SmallInteger,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from spaceapp_logar.db.base import Base
from spaceapp_logar.db.types import UTCDateTime


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Observation(Base):
    """Append-only raw vital or environmental observation."""

    __tablename__ = "observations"
    __table_args__ = (
        CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type <> 'SYNTHETIC' AND scenario_id IS NULL)",
            name="ck_observations_synthetic_scenario",
        ),
        Index(
            "ix_observations_lookup",
            "mission_id",
            "target_id",
            "metric",
            "observed_at",
        ),
        Index("ix_observations_observed_at", "observed_at"),
        CheckConstraint(
            "activity_source IS NULL OR activity_source IN ('SENSOR', 'DECLARED')",
            name="ck_observations_activity_source",
        ),
    )
    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    mission_id: Mapped[str] = mapped_column(String(100))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(100))
    metric: Mapped[str] = mapped_column(String(100))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(32))
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime())
    source_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(100))
    scenario_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reported_quality: Mapped[str] = mapped_column(String(32))
    activity_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # SENSOR = sent with the measurement, DECLARED = stamped from a crew declaration.
    activity_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
    )


class RuleEvaluationRecord(Base):
    """Persisted, versioned explanation produced by one rule execution."""

    __tablename__ = "rule_evaluations"
    __table_args__ = (
        Index(
            "ix_rule_evaluations_lookup",
            "mission_id",
            "target_id",
            "rule_id",
            "evaluated_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    mission_id: Mapped[str] = mapped_column(String(100))
    target_id: Mapped[str] = mapped_column(String(100))
    rule_id: Mapped[str] = mapped_column(String(100))
    rule_version: Mapped[int] = mapped_column(Integer)
    evaluated_at: Mapped[datetime] = mapped_column(UTCDateTime())
    data_quality: Mapped[str] = mapped_column(String(32))
    health_attention: Mapped[str] = mapped_column(String(32))
    observed_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(32))
    threshold: Mapped[float] = mapped_column(Float)
    comparison: Mapped[str] = mapped_column(String(16))
    window_minutes: Mapped[int] = mapped_column(Integer)
    window_start: Mapped[datetime] = mapped_column(UTCDateTime())
    window_end: Mapped[datetime] = mapped_column(UTCDateTime())
    valid_minute_buckets: Mapped[int] = mapped_column(Integer)
    required_minute_buckets: Mapped[int] = mapped_column(Integer)
    longest_missing_run_minutes: Mapped[int] = mapped_column(Integer)
    ignored_observations: Mapped[int] = mapped_column(Integer)
    explanation: Mapped[str] = mapped_column(Text)
    # Text: rule source descriptions can exceed 255 characters and PostgreSQL
    # enforces VARCHAR lengths (SQLite does not).
    source: Mapped[str] = mapped_column(Text)
    source_uri: Mapped[str] = mapped_column(String(500))
    action_card_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action_card_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Personal baseline used by the rule, if any (snapshot of the facts used).
    baseline_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_classification: Mapped[str | None] = mapped_column(String(32), nullable=True)
    baseline_sample_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    baseline_profile_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class RuleEvaluationEvidence(Base):
    """Raw observation used as evidence by a persisted rule evaluation."""

    __tablename__ = "rule_evaluation_evidence"

    evaluation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rule_evaluations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    observation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("observations.id", ondelete="RESTRICT"),
        primary_key=True,
    )


class AlertEvent(Base):
    """User-facing alert with a tracked lifecycle.

    One active (OPEN or ACKNOWLEDGED) alert exists per mission, target and
    rule; repeated WATCH evaluations of the same root cause update it instead
    of creating duplicates.
    """

    __tablename__ = "alert_events"
    __table_args__ = (
        CheckConstraint(
            "status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')",
            name="ck_alert_events_status",
        ),
        CheckConstraint(
            "(status = 'OPEN' AND acknowledged_at IS NULL "
            "AND resolved_at IS NULL) OR "
            "(status = 'ACKNOWLEDGED' AND acknowledged_at IS NOT NULL "
            "AND resolved_at IS NULL) OR "
            "(status = 'RESOLVED' AND resolved_at IS NOT NULL)",
            name="ck_alert_events_lifecycle",
        ),
        Index(
            "ix_alert_events_lookup",
            "mission_id",
            "target_id",
            "rule_id",
            "opened_at",
        ),
        Index("ix_alert_events_status", "mission_id", "status", "opened_at"),
        Index(
            "uq_alert_events_active",
            "mission_id",
            "target_id",
            "rule_id",
            unique=True,
            sqlite_where=text("status IN ('OPEN', 'ACKNOWLEDGED')"),
            postgresql_where=text("status IN ('OPEN', 'ACKNOWLEDGED')"),
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    mission_id: Mapped[str] = mapped_column(String(100))
    target_id: Mapped[str] = mapped_column(String(100))
    rule_id: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(32))
    health_attention: Mapped[str] = mapped_column(String(32))
    action_card_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action_card_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime())
    opened_evaluation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rule_evaluations.id", ondelete="RESTRICT"),
    )
    last_evaluated_at: Mapped[datetime] = mapped_column(UTCDateTime())
    last_evaluation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rule_evaluations.id", ondelete="RESTRICT"),
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        UTCDateTime(),
        nullable=True,
    )
    acknowledged_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        UTCDateTime(),
        nullable=True,
    )
    resolved_evaluation_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rule_evaluations.id", ondelete="RESTRICT"),
        nullable=True,
    )
    resolved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class ActionStepLog(Base):
    """Append-only record that a crew member completed one action-card step."""

    __tablename__ = "action_step_logs"
    __table_args__ = (
        Index(
            "uq_action_step_logs_step",
            "alert_id",
            "card_id",
            "card_version",
            "step_key",
            unique=True,
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    alert_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("alert_events.id", ondelete="RESTRICT"),
    )
    card_id: Mapped[str] = mapped_column(String(100))
    card_version: Mapped[int] = mapped_column(Integer)
    step_key: Mapped[str] = mapped_column(String(100))
    crew_member_id: Mapped[str] = mapped_column(String(100))
    done_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class RedFlagReport(Base):
    """Append-only red-flag symptom report from a crew member."""

    __tablename__ = "red_flag_reports"
    __table_args__ = (
        CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type = 'MANUAL' AND scenario_id IS NULL)",
            name="ck_red_flag_reports_source",
        ),
        Index(
            "ix_red_flag_reports_lookup",
            "mission_id",
            "crew_member_id",
            "observed_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    mission_id: Mapped[str] = mapped_column(String(100))
    crew_member_id: Mapped[str] = mapped_column(String(100))
    flags: Mapped[str] = mapped_column(String(500))
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime())
    source_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(100))
    scenario_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    evaluation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rule_evaluations.id", ondelete="RESTRICT"),
    )
    ingested_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class LabResult(Base):
    """Append-only periodic laboratory measurement with its source range."""

    __tablename__ = "lab_results"
    __table_args__ = (
        CheckConstraint(
            "reference_low <= reference_high",
            name="ck_lab_results_reference_range",
        ),
        CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type <> 'SYNTHETIC' AND scenario_id IS NULL)",
            name="ck_lab_results_synthetic_scenario",
        ),
        Index(
            "ix_lab_results_lookup",
            "mission_id",
            "crew_member_id",
            "analyte",
            "sampled_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    mission_id: Mapped[str] = mapped_column(String(100))
    crew_member_id: Mapped[str] = mapped_column(String(100))
    analyte: Mapped[str] = mapped_column(String(32))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(32))
    reference_low: Mapped[float] = mapped_column(Float)
    reference_high: Mapped[float] = mapped_column(Float)
    phase: Mapped[str] = mapped_column(String(32))
    sampled_at: Mapped[datetime] = mapped_column(UTCDateTime())
    source_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(100))
    scenario_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class SubjectiveCheckIn(Base):
    """Append-only five-field subjective crew check-in."""

    __tablename__ = "subjective_check_ins"
    __table_args__ = (
        CheckConstraint(
            "fatigue BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_fatigue",
        ),
        CheckConstraint(
            "dizziness BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_dizziness",
        ),
        CheckConstraint(
            "nausea BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_nausea",
        ),
        CheckConstraint(
            "pain BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_pain",
        ),
        CheckConstraint(
            "mood_distress BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_mood_distress",
        ),
        CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type = 'MANUAL' AND scenario_id IS NULL)",
            name="ck_subjective_check_ins_source",
        ),
        Index(
            "ix_subjective_check_ins_lookup",
            "mission_id",
            "crew_member_id",
            "observed_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    mission_id: Mapped[str] = mapped_column(String(100))
    crew_member_id: Mapped[str] = mapped_column(String(100))
    fatigue: Mapped[int] = mapped_column(SmallInteger)
    dizziness: Mapped[int] = mapped_column(SmallInteger)
    nausea: Mapped[int] = mapped_column(SmallInteger)
    pain: Mapped[int] = mapped_column(SmallInteger)
    mood_distress: Mapped[int] = mapped_column(SmallInteger)
    vision_change: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    back_pain: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    congestion: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime())
    source_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(100))
    scenario_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
    )


class EnvironmentContext(Base):
    """Append-only mission environment; the latest one at a time applies."""

    __tablename__ = "environment_contexts"
    __table_args__ = (
        CheckConstraint(
            "location IN ('EARTH', 'ISS', 'TRANSIT_VEHICLE', 'LUNAR_HABITAT', "
            "'MARS_HABITAT', 'EVA')",
            name="ck_environment_contexts_location",
        ),
        CheckConstraint(
            "gravity_g >= 0 AND gravity_g <= 3",
            name="ck_environment_contexts_gravity",
        ),
        Index("ix_environment_contexts_lookup", "mission_id", "effective_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    mission_id: Mapped[str] = mapped_column(String(100))
    location: Mapped[str] = mapped_column(String(32))
    gravity_g: Mapped[float] = mapped_column(Float)
    eva_state: Mapped[str] = mapped_column(String(32))
    communication_delay_seconds: Mapped[float] = mapped_column(Float)
    expected_metrics: Mapped[list] = mapped_column(JSON)
    sensor_set: Mapped[list] = mapped_column(JSON)
    effective_at: Mapped[datetime] = mapped_column(UTCDateTime())
    source_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class BaselineProfile(Base):
    """Immutable snapshot of a personal baseline (one version of a profile)."""

    __tablename__ = "baseline_profiles"
    __table_args__ = (
        Index(
            "uq_baseline_profiles_version",
            "mission_id",
            "target_id",
            "metric",
            "activity_key",
            "environment_key",
            "version",
            unique=True,
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    mission_id: Mapped[str] = mapped_column(String(100))
    target_id: Mapped[str] = mapped_column(String(100))
    metric: Mapped[str] = mapped_column(String(100))
    activity_key: Mapped[str] = mapped_column(String(32))
    environment_key: Mapped[str] = mapped_column(String(64))
    environment_context_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("environment_contexts.id", ondelete="RESTRICT"),
        nullable=True,
    )
    environment_location: Mapped[str | None] = mapped_column(String(32), nullable=True)
    version: Mapped[int] = mapped_column(Integer)
    median: Mapped[float | None] = mapped_column(Float, nullable=True)
    p10: Mapped[float | None] = mapped_column(Float, nullable=True)
    p25: Mapped[float | None] = mapped_column(Float, nullable=True)
    p75: Mapped[float | None] = mapped_column(Float, nullable=True)
    p90: Mapped[float | None] = mapped_column(Float, nullable=True)
    sample_count: Mapped[int] = mapped_column(Integer)
    min_samples_required: Mapped[int] = mapped_column(Integer)
    excluded_count: Mapped[int] = mapped_column(Integer)
    classification: Mapped[str] = mapped_column(String(32))
    computed_before: Mapped[datetime] = mapped_column(UTCDateTime())
    created_by: Mapped[str] = mapped_column(String(100))
    reason: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class BaselineProfileActivation(Base):
    """Append-only: which snapshot is in force for a profile key.

    The latest row per key wins. ``profile_id`` NULL means "use the
    automatically computed baseline". Rolling back is activating an earlier
    snapshot again; nothing is deleted or overwritten.
    """

    __tablename__ = "baseline_profile_activations"
    __table_args__ = (
        Index(
            "ix_baseline_profile_activations_key",
            "mission_id",
            "target_id",
            "metric",
            "activity_key",
            "environment_key",
            "activated_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    mission_id: Mapped[str] = mapped_column(String(100))
    target_id: Mapped[str] = mapped_column(String(100))
    metric: Mapped[str] = mapped_column(String(100))
    activity_key: Mapped[str] = mapped_column(String(32))
    environment_key: Mapped[str] = mapped_column(String(64))
    profile_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("baseline_profiles.id", ondelete="RESTRICT"),
        nullable=True,
    )
    activated_by: Mapped[str] = mapped_column(String(100))
    reason: Mapped[str] = mapped_column(String(500))
    activated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class ActivityDeclaration(Base):
    """Crew-declared activity context (e.g. EXERCISE for 45 minutes)."""

    __tablename__ = "activity_declarations"
    __table_args__ = (
        CheckConstraint(
            "activity_state IN ('REST', 'LIGHT', 'EXERCISE', 'SLEEP')",
            name="ck_activity_declarations_state",
        ),
        CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type <> 'SYNTHETIC' AND scenario_id IS NULL)",
            name="ck_activity_declarations_synthetic_scenario",
        ),
        Index(
            "ix_activity_declarations_lookup",
            "mission_id",
            "crew_member_id",
            "started_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    mission_id: Mapped[str] = mapped_column(String(100))
    crew_member_id: Mapped[str] = mapped_column(String(100))
    activity_state: Mapped[str] = mapped_column(String(32))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime())
    expected_end_at: Mapped[datetime] = mapped_column(UTCDateTime())
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    source_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(100))
    scenario_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


_ROUTINE_KINDS = (
    "HYDRATION",
    "EXERCISE",
    "SLEEP_WINDOW",
    "CHECK_IN",
    "BODY_MASS_WEEKLY",
    "GRIP_STRENGTH_WEEKLY",
    "MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY",
)


class RoutineSchedule(Base):
    """A recurring reminder for one crew member (fixed catalogue kinds)."""

    __tablename__ = "routine_schedules"
    __table_args__ = (
        CheckConstraint(
            "kind IN (" + ", ".join(f"'{k}'" for k in _ROUTINE_KINDS) + ")",
            name="ck_routine_schedules_kind",
        ),
        CheckConstraint(
            "interval_minutes >= 30 AND interval_minutes <= 20160",
            name="ck_routine_schedules_interval",
        ),
        Index("ix_routine_schedules_lookup", "mission_id", "crew_member_id", "kind"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    mission_id: Mapped[str] = mapped_column(String(100))
    crew_member_id: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(64))
    interval_minutes: Mapped[int] = mapped_column(Integer)
    anchor_at: Mapped[datetime] = mapped_column(UTCDateTime())
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class RoutineCompletion(Base):
    """Append-only record that a routine was done."""

    __tablename__ = "routine_completions"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('MANUAL')", name="ck_routine_completions_source"
        ),
        Index("ix_routine_completions_schedule", "schedule_id", "completed_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    schedule_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("routine_schedules.id", ondelete="RESTRICT"),
    )
    crew_member_id: Mapped[str] = mapped_column(String(100))
    completed_at: Mapped[datetime] = mapped_column(UTCDateTime())
    source_type: Mapped[str] = mapped_column(String(32), default="MANUAL")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
