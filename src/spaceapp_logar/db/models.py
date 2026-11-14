from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
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
    source: Mapped[str] = mapped_column(String(255))
    source_uri: Mapped[str] = mapped_column(String(500))
    action_card_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action_card_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


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
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime())
    source_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(100))
    scenario_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
    )
