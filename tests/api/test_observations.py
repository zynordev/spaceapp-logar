from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from spaceapp_logar.db.models import Observation
from spaceapp_logar.db.session import create_database_engine, get_session
from spaceapp_logar.main import app


def valid_synthetic_payload() -> dict[str, object]:
    return {
        "mission_id": "demo-iss-01",
        "target_type": "ENVIRONMENT",
        "target_id": "iss-destiny-lab",
        "metric": "CABIN_CO2_PARTIAL_PRESSURE",
        "value": 3.2,
        "unit": "mmHg",
        "observed_at": "2026-11-14T11:00:00+03:00",
        "source_type": "SYNTHETIC",
        "source_id": "co2-simulator-01",
        "scenario_id": "co2-rise-demo-v1",
        "reported_quality": "VALID",
    }


@pytest.fixture
def api_with_database(tmp_path: Path) -> Iterator[tuple[TestClient, Engine]]:
    database_path = tmp_path / "api-test.db"
    database_url = f"sqlite:///{database_path}"

    alembic_config = Config("alembic.ini")
    alembic_config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(alembic_config, "head")

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


def test_post_observation_persists_immutable_raw_record(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, engine = api_with_database

    response = client.post("/v1/observations", json=valid_synthetic_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["id"]
    assert body["ingested_at"].endswith("Z")
    assert body["observed_at"] == "2026-11-14T08:00:00Z"
    assert body["value"] == 3.2
    assert body["scenario_id"] == "co2-rise-demo-v1"

    with Session(engine) as session:
        stored = session.scalar(select(Observation))

    assert stored is not None
    assert str(stored.id) == body["id"]
    assert stored.observed_at.isoformat() == "2026-11-14T08:00:00+00:00"
    assert stored.source_type == "SYNTHETIC"


def test_invalid_observation_returns_422_without_writing_record(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, engine = api_with_database
    payload = valid_synthetic_payload()
    payload["scenario_id"] = None

    response = client.post("/v1/observations", json=payload)

    assert response.status_code == 422
    with Session(engine) as session:
        stored_count = session.scalar(select(func.count()).select_from(Observation))
    assert stored_count == 0

