"""Create ground station sync acknowledgements and flight-surgeon escalations.

Revision ID: 20261115_0017
Revises: 20261115_0016
Create Date: 2026-11-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261115_0017"
down_revision: str | None = "20261115_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ground_sync_acks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("recipient", sa.String(length=32), nullable=False),
        sa.Column("packet_id", sa.Uuid(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acked_by", sa.String(length=100), nullable=False),
        sa.CheckConstraint(
            "recipient IN ('FLIGHT_SURGEON', 'LIFE_SUPPORT', 'RADIATION', "
            "'MISSION_CONTROL')",
            name="ck_ground_sync_acks_recipient",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ground_sync_acks_lookup",
        "ground_sync_acks",
        ["mission_id", "recipient", "until"],
        unique=False,
    )
    op.create_table(
        "ground_escalations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("alert_id", sa.Uuid(), nullable=False),
        sa.Column("crew_member_id", sa.String(length=100), nullable=True),
        sa.Column("priority", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("summary_tr", sa.String(length=500), nullable=False),
        sa.Column("packet", sa.JSON(), nullable=False),
        sa.Column("packet_sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "priority IN ('ALERT', 'CRITICAL')",
            name="ck_ground_escalations_priority",
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'ACKED')",
            name="ck_ground_escalations_status",
        ),
        sa.ForeignKeyConstraint(["alert_id"], ["alert_events.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_ground_escalations_alert",
        "ground_escalations",
        ["alert_id"],
        unique=True,
    )
    op.create_index(
        "ix_ground_escalations_lookup",
        "ground_escalations",
        ["mission_id", "status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ground_escalations_lookup", table_name="ground_escalations")
    op.drop_index("uq_ground_escalations_alert", table_name="ground_escalations")
    op.drop_table("ground_escalations")
    op.drop_index("ix_ground_sync_acks_lookup", table_name="ground_sync_acks")
    op.drop_table("ground_sync_acks")
