"""PostgreSQL-only checks; skipped unless TEST_DATABASE_URL points to Postgres."""

import os

from alembic import command
import pytest
from sqlalchemy import create_engine, text

URL = os.getenv("TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not URL.startswith(("postgres", "postgresql")),
    reason="needs TEST_DATABASE_URL pointing to PostgreSQL",
)


def test_partial_unique_index_exists_on_postgres(
    database_url: str, make_alembic_config
) -> None:
    command.upgrade(make_alembic_config(database_url), "head")
    engine = create_engine(database_url)
    with engine.connect() as connection:
        definition = connection.execute(
            text(
                "SELECT indexdef FROM pg_indexes "
                "WHERE indexname = 'uq_alert_events_active'"
            )
        ).scalar_one()
    engine.dispose()

    assert "UNIQUE" in definition
    assert "WHERE" in definition


def test_long_rule_source_is_accepted(database_url: str, make_alembic_config) -> None:
    command.upgrade(make_alembic_config(database_url), "head")
    engine = create_engine(database_url)
    with engine.connect() as connection:
        data_type = connection.execute(
            text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = 'rule_evaluations' AND column_name = 'source'"
            )
        ).scalar_one()
    engine.dispose()

    assert data_type == "text"
