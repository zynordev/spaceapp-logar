import json
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest

from spaceapp_logar.db.session import create_database_engine
from spaceapp_logar.main import app
from spaceapp_logar.observability import JsonFormatter, REQUEST_ID_HEADER
from spaceapp_logar.services.schema_check import SchemaMonitor


@pytest.fixture
def outdated_monitor(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    url = f"sqlite:///{tmp_path / 'old.db'}"
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "20261114_0003")
    engine = create_database_engine(url)
    original = app.state.schema_monitor
    app.state.schema_monitor = SchemaMonitor(engine, ttl=0)
    monkeypatch.setenv("SPACEAPP_SCHEMA_GUARD", "on")
    yield
    app.state.schema_monitor = original
    engine.dispose()


def test_outdated_schema_returns_clear_503_instead_of_500(outdated_monitor) -> None:
    response = TestClient(app).get("/v1/metrics")

    assert response.status_code == 503
    body = response.json()
    assert "alembic upgrade head" in body["detail"]
    assert body["schema"] == "outdated"
    assert body["schema_revision"] == "20261114_0003"
    assert body["request_id"] == response.headers[REQUEST_ID_HEADER]


def test_guard_never_blocks_health_or_dashboard(outdated_monitor) -> None:
    client = TestClient(app)

    assert client.get("/health").status_code == 200
    assert client.get("/ui/").status_code == 200


def test_request_id_is_generated_or_echoed() -> None:
    client = TestClient(app)

    generated = client.get("/v1/metrics")
    echoed = client.get("/v1/metrics", headers={REQUEST_ID_HEADER: "abc-123"})
    oversized = client.get("/v1/metrics", headers={REQUEST_ID_HEADER: "x" * 500})

    assert len(generated.headers[REQUEST_ID_HEADER]) == 32
    assert echoed.headers[REQUEST_ID_HEADER] == "abc-123"
    assert oversized.headers[REQUEST_ID_HEADER] != "x" * 500


def test_request_log_has_no_body_and_is_json(caplog: pytest.LogCaptureFixture) -> None:
    logger = logging.getLogger("spaceapp_logar")
    logger.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger="spaceapp_logar")
    try:
        TestClient(app).post(
            "/v1/check-ins",
            json={"mission_id": "m", "crew_member_id": "c", "secret_note": "do-not-log"},
        )
    finally:
        logger.removeHandler(caplog.handler)

    records = [r for r in caplog.records if r.getMessage() == "request"]
    assert records
    line = JsonFormatter().format(records[-1])
    payload = json.loads(line)
    assert payload["path"] == "/v1/check-ins"
    assert payload["status"] == 422
    assert "duration_ms" in payload
    assert "do-not-log" not in line


def test_unhandled_error_returns_json_with_request_id(monkeypatch: pytest.MonkeyPatch) -> None:
    from spaceapp_logar.api import measurements

    monkeypatch.setattr(measurements, "METRIC_SPECS", None)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/v1/metrics")

    assert response.status_code == 500
    assert response.json()["request_id"] == response.headers[REQUEST_ID_HEADER]
    assert "Traceback" not in response.text
