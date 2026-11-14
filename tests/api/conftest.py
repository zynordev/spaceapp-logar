from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from spaceapp_logar.db.session import create_database_engine, get_session
from spaceapp_logar.main import app


@pytest.fixture
def api_client(tmp_path: Path) -> Iterator[tuple[TestClient, Engine]]:
    """API client backed by a fresh migrated SQLite database."""

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
