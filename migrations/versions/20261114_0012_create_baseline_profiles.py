"""Create immutable personal-baseline snapshots and their activations.

Revision ID: 20261114_0012
Revises: 20261114_0011
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0012"
down_revision: str | None = "20261114_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KEY = ["mission_id", "target_id", "metric", "activity_key", "environment_key"]


def upgrade() -> None:
    op.create_table(
        "baseline_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("target_id", sa.String(length=100), nullable=False),
        sa.Column("metric", sa.String(length=100), nullable=False),
        sa.Column("activity_key", sa.String(length=32), nullable=False),
        sa.Column("environment_key", sa.String(length=64), nullable=False),
        sa.Column("environment_context_id", sa.Uuid(), nullable=True),
        sa.Column("environment_location", sa.String(length=32), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("median", sa.Float(), nullable=True),
        sa.Column("p10", sa.Float(), nullable=True),
        sa.Column("p25", sa.Float(), nullable=True),
        sa.Column("p75", sa.Float(), nullable=True),
        sa.Column("p90", sa.Float(), nullable=True),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("min_samples_required", sa.Integer(), nullable=False),
        sa.Column("excluded_count", sa.Integer(), nullable=False),
        sa.Column("classification", sa.String(length=32), nullable=False),
        sa.Column("computed_before", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=100), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["environment_context_id"], ["environment_contexts.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_baseline_profiles_version",
        "baseline_profiles",
        [*KEY, "version"],
        unique=True,
    )
    op.create_table(
        "baseline_profile_activations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("target_id", sa.String(length=100), nullable=False),
        sa.Column("metric", sa.String(length=100), nullable=False),
        sa.Column("activity_key", sa.String(length=32), nullable=False),
        sa.Column("environment_key", sa.String(length=64), nullable=False),
        sa.Column("profile_id", sa.Uuid(), nullable=True),
        sa.Column("activated_by", sa.String(length=100), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["baseline_profiles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_baseline_profile_activations_key",
        "baseline_profile_activations",
        [*KEY, "activated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_baseline_profile_activations_key", table_name="baseline_profile_activations"
    )
    op.drop_table("baseline_profile_activations")
    op.drop_index("uq_baseline_profiles_version", table_name="baseline_profiles")
    op.drop_table("baseline_profiles")
