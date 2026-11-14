"""Store rule source text without a length limit.

Rule source notes grew past 255 characters (e.g. the radiation rule). SQLite
ignores VARCHAR lengths, so this only failed on PostgreSQL, where every demo
scenario returned 500. Widening a column keeps all existing data.

Revision ID: 20261114_0011
Revises: 20261114_0010
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0011"
down_revision: str | None = "20261114_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("rule_evaluations") as batch_op:
        batch_op.alter_column(
            "source",
            existing_type=sa.String(length=255),
            type_=sa.Text(),
            existing_nullable=False,
        )


def downgrade() -> None:
    # Truncate so the narrower column can hold every existing row.
    op.execute("UPDATE rule_evaluations SET source = SUBSTR(source, 1, 255)")
    with op.batch_alter_table("rule_evaluations") as batch_op:
        batch_op.alter_column(
            "source",
            existing_type=sa.Text(),
            type_=sa.String(length=255),
            existing_nullable=False,
        )
