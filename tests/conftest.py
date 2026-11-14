"""Shared database fixture: SQLite by default, PostgreSQL when requested.

Set ``TEST_DATABASE_URL`` (e.g. in CI) to run the whole suite against
PostgreSQL. Each test gets an empty ``public`` schema, so tests stay
independent exactly like with a fresh SQLite file.
"""

import os
from pathlib import Path

from alembic.config import Config
import pytest
from sqlalchemy import create_engine, text

from spaceapp_logar.db.url import is_sqlite, normalize_database_url

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")


def _reset_postgres(url: str) -> None:
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()


@pytest.fixture
def database_url(tmp_path: Path) -> str:
    if TEST_DATABASE_URL:
        url = normalize_database_url(TEST_DATABASE_URL)
        if not is_sqlite(url):
            _reset_postgres(url)
        return url
    return f"sqlite:///{tmp_path / 'test.db'}"


def alembic_config_for(url: str) -> Config:
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


@pytest.fixture
def make_alembic_config():
    """Factory: Alembic config bound to a given database URL."""

    return alembic_config_for
