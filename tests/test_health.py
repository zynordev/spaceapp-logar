from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest

from spaceapp_logar.db.session import create_database_engine
from spaceapp_logar.main import app
from spaceapp_logar.services.schema_check import SchemaMonitor, expected_head


@pytest.fixture
def monitor_for(tmp_path: Path) -> Iterator:
    original = app.state.schema_monitor
    engines = []

    def build(revision: str | None) -> None:
        url = f"sqlite:///{tmp_path / f'health-{revision}.db'}"
        if revision is not None:
            config = Config("alembic.ini")
            config.set_main_option("sqlalchemy.url", url)
            command.upgrade(config, revision)
        engine = create_database_engine(url)
        engines.append(engine)
        app.state.schema_monitor = SchemaMonitor(engine, ttl=0)

    yield build
    app.state.schema_monitor = original
    for engine in engines:
        engine.dispose()


def test_health_reports_current_schema(monitor_for) -> None:
    monitor_for("head")

    body = TestClient(app).get("/health").json()

    assert body["status"] == "ok"
    assert body["service"] == "spaceapp-logar-api"
    assert body["api_version"] == "0.2.0"
    assert body["database"] == "ok"
    assert body["schema_state"] == "current"
    assert body["schema_revision"] == expected_head()


def test_health_reports_outdated_schema_without_failing(monitor_for) -> None:
    monitor_for("20261114_0001")

    response = TestClient(app).get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["schema_state"] == "outdated"
    assert body["schema_revision"] == "20261114_0001"
    assert body["expected_revision"] == expected_head()


def test_health_reports_empty_database_as_outdated(monitor_for) -> None:
    monitor_for(None)

    body = TestClient(app).get("/health").json()

    assert body["status"] == "degraded"
    assert body["schema_revision"] is None
