"""Create crew activity declarations and observation activity provenance.

Revision ID: 20261115_0015
Revises: 20261114_0014
Create Date: 2026-11-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

from spaceapp_logar.db.types import UTCDateTime

revision: str = "20261115_0015"
down_revision: str | None = "20261114_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activity_declarations",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("crew_member_id", sa.String(length=100), nullable=False),
        sa.Column("activity_state", sa.String(length=32), nullable=False),
        sa.Column("started_at", UTCDateTime(), nullable=False),
        sa.Column("expected_end_at", UTCDateTime(), nullable=False),
        sa.Column("ended_at", UTCDateTime(), nullable=True),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=100), nullable=False),
        sa.Column("scenario_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", UTCDateTime(), nullable=False),
        sa.CheckConstraint(
            "activity_state IN ('REST', 'LIGHT', 'EXERCISE', 'SLEEP')",
            name="ck_activity_declarations_state",
        ),
        sa.CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type <> 'SYNTHETIC' AND scenario_id IS NULL)",
            name="ck_activity_declarations_synthetic_scenario",
        ),
    )
    op.create_index(
        "ix_activity_declarations_lookup",
        "activity_declarations",
        ["mission_id", "crew_member_id", "started_at"],
    )
    with op.batch_alter_table("observations") as batch_op:
        batch_op.add_column(sa.Column("activity_source", sa.String(length=16), nullable=True))
        batch_op.create_check_constraint(
            "ck_observations_activity_source",
            "activity_source IS NULL OR activity_source IN ('SENSOR', 'DECLARED')",
        )


def downgrade() -> None:
    with op.batch_alter_table("observations") as batch_op:
        batch_op.drop_constraint("ck_observations_activity_source", type_="check")
        batch_op.drop_column("activity_source")
    op.drop_index("ix_activity_declarations_lookup", table_name="activity_declarations")
    op.drop_table("activity_declarations")
