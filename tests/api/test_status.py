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
def api_with_database(tmp_path: Path) -> Iterator[tuple[TestClient, Engine]]:
    database_path = tmp_path / "status-api-test.db"
    database_url = f"sqlite:///{database_path}"
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")

    engine = create_database_engine(database_url)
    testing_session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override_get_session() -> Iterator[Session]:
        with testing_session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as client:
        yield client, engine
    app.dependency_overrides.clear()
    engine.dispose()


def co2_payload(minute: int) -> dict[str, object]:
    return {
        "mission_id": "demo-iss-01",
        "target_type": "ENVIRONMENT",
        "target_id": "iss-destiny-lab",
        "metric": "CABIN_CO2_PARTIAL_PRESSURE",
        "value": 3.2,
        "unit": "mmHg",
        "observed_at": f"2026-11-14T08:{minute:02d}:00Z",
        "source_type": "SYNTHETIC",
        "source_id": "co2-simulator-01",
        "scenario_id": "co2-rise-demo-v1",
        "reported_quality": "VALID",
    }


def check_in_payload() -> dict[str, object]:
    return {
        "mission_id": "demo-iss-01",
        "crew_member_id": "crew-01",
        "fatigue": 1,
        "dizziness": 0,
        "nausea": 0,
        "pain": 2,
        "mood_distress": 1,
        "observed_at": "2026-11-14T08:59:30Z",
        "source_type": "SYNTHETIC",
        "source_id": "demo-scenario-runner",
        "scenario_id": "co2-rise-demo-v1",
    }


def get_status(client: TestClient):
    return client.get(
        "/v1/crew/crew-01/status",
        params={
            "mission_id": "demo-iss-01",
            "environment_target_id": "iss-destiny-lab",
        },
    )


def test_status_without_data_is_explicitly_empty(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database

    response = get_status(client)

    assert response.status_code == 200
    body = response.json()
    assert body["co2"] is None
    assert body["latest_check_in"] is None
    assert len(body["limitations"]) == 2


def test_status_combines_co2_watch_with_raw_subjective_context(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database
    for minute in range(60):
        response = client.post("/v1/observations", json=co2_payload(minute))
        assert response.status_code == 201
    check_in_response = client.post("/v1/check-ins", json=check_in_payload())
    assert check_in_response.status_code == 201

    response = get_status(client)

    assert response.status_code == 200
    body = response.json()
    assert body["co2"]["health_attention"] == "WATCH"
    assert body["co2"]["observed_value"] == pytest.approx(3.2)
    assert body["latest_check_in"]["pain"] == 2
    assert body["latest_check_in"]["fatigue"] == 1
    assert "teşhis" in body["limitations"][0]

