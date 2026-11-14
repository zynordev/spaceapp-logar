from collections.abc import Iterator

from alembic import command
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from spaceapp_logar.db.session import create_database_engine, get_session
from spaceapp_logar.main import app


@pytest.fixture
def api_client(database_url: str, make_alembic_config) -> Iterator[tuple[TestClient, Engine]]:
    """API client backed by a fresh migrated database (SQLite or PostgreSQL)."""

    command.upgrade(make_alembic_config(database_url), "head")

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


@pytest.fixture
def api_with_database(api_client: tuple[TestClient, Engine]) -> tuple[TestClient, Engine]:
    """Older test modules use this name; it is the same fixture."""

    return api_client
