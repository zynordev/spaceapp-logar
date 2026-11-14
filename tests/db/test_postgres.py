"""PostgreSQL compatibility: migrations up/down and model/migration parity.

Skipped unless SPACEAPP_TEST_POSTGRES_URL points to a disposable database
(CI provides one). API behaviour on PostgreSQL is covered by running
tests/api with the same variable (see tests/api/conftest.py).
"""

import os

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import inspect, text

from spaceapp_logar.db.session import create_database_engine, normalize_database_url

POSTGRES_TEST_URL = os.getenv("SPACEAPP_TEST_POSTGRES_URL")

pytestmark = pytest.mark.skipif(
    not POSTGRES_TEST_URL, reason="SPACEAPP_TEST_POSTGRES_URL is not set"
)


def test_migrations_upgrade_check_and_downgrade_on_postgres() -> None:
    url = normalize_database_url(POSTGRES_TEST_URL or "")
    engine = create_database_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url)

    command.upgrade(config, "head")
    tables = set(inspect(engine).get_table_names())
    indexes = {index["name"] for index in inspect(engine).get_indexes("alert_events")}
    command.check(config)
    command.downgrade(config, "base")
    remaining = set(inspect(engine).get_table_names()) - {"alembic_version"}
    engine.dispose()

    assert {"observations", "rule_evaluations", "alert_events", "lab_results"} <= tables
    assert "uq_alert_events_active" in indexes
    assert remaining == set()


def test_active_alert_uniqueness_is_enforced_on_postgres() -> None:
    url = normalize_database_url(POSTGRES_TEST_URL or "")
    engine = create_database_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")

    [index] = [
        index
        for index in inspect(engine).get_indexes("alert_events")
        if index["name"] == "uq_alert_events_active"
    ]
    engine.dispose()

    assert index["unique"]
    where = index.get("dialect_options", {}).get("postgresql_where", "")
    assert "OPEN" in str(where) and "ACKNOWLEDGED" in str(where)
