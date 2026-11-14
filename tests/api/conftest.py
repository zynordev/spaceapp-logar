import os
from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session, sessionmaker

from spaceapp_logar.db.session import (
    create_database_engine,
    get_session,
    normalize_database_url,
)
from spaceapp_logar.main import app

# Set to a disposable PostgreSQL database to run these API tests against
# PostgreSQL instead of SQLite (CI does this). The schema is wiped per test.
POSTGRES_TEST_URL = os.getenv("SPACEAPP_TEST_POSTGRES_URL")


def _reset_postgres(url: str) -> None:
    engine = create_database_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()


@pytest.fixture
def api_client(tmp_path: Path) -> Iterator[tuple[TestClient, Engine]]:
    """API client backed by a fresh migrated database (SQLite or PostgreSQL)."""

    if POSTGRES_TEST_URL:
        database_url = normalize_database_url(POSTGRES_TEST_URL)
        _reset_postgres(database_url)
    else:
        database_url = f"sqlite:///{tmp_path / 'api-test.db'}"
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")

    engine = create_database_engine(database_url)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override_get_session() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as client:
        yield client, engine
    app.dependency_overrides.clear()
    engine.dispose()
