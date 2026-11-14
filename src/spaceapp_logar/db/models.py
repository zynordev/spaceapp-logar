from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from spaceapp_logar.db.base import Base


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
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(100))
    scenario_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reported_quality: Mapped[str] = mapped_column(String(32))
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

