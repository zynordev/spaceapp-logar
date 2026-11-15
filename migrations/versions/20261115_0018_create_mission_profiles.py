"""Create mission profiles (ISS / MOON / MARS communication context).

Revision ID: 20261115_0018
Revises: 20261115_0017
Create Date: 2026-11-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261115_0018"
down_revision: str | None = "20261115_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mission_profiles",
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("profile", sa.String(length=16), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.String(length=100), nullable=False),
        sa.CheckConstraint(
            "profile IN ('ISS', 'MOON', 'MARS')",
            name="ck_mission_profiles_profile",
        ),
        sa.PrimaryKeyConstraint("mission_id"),
    )


def downgrade() -> None:
    op.drop_table("mission_profiles")
