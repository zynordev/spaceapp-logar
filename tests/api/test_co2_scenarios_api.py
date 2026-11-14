"""End-to-end CO2 scenarios: recovery, deterioration and symptoms without sensor change."""

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
    database_path = tmp_path / "co2-scenarios-test.db"
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


def co2_payload(hour: int, minute: int, value: float) -> dict[str, object]:
    return {
        "mission_id": "demo-iss-01",
        "target_type": "ENVIRONMENT",
        "target_id": "iss-destiny-lab",
        "metric": "CABIN_CO2_PARTIAL_PRESSURE",
        "value": value,
        "unit": "mmHg",
        "observed_at": f"2026-11-14T{hour:02d}:{minute:02d}:00Z",
        "source_type": "SYNTHETIC",
        "source_id": "co2-simulator-01",
        "scenario_id": "co2-scenario-test",
        "reported_quality": "VALID",
    }


def post_hour(client: TestClient, hour: int, value: float) -> dict[str, object]:
    """Post one reading per minute for a whole clock hour; return the last reply."""

    body: dict[str, object] = {}
    for minute in range(60):
        response = client.post(
            "/v1/observations",
            json=co2_payload(hour, minute, value),
        )
        assert response.status_code == 201
        body = response.json()
    return body


def test_recovery_after_intervention_clears_watch_and_card(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database

    elevated = post_hour(client, 8, 3.4)
    recovered = post_hour(client, 9, 2.4)

    assert elevated["evaluation"]["health_attention"] == "WATCH"
    assert elevated["action_card"] is not None
    assert recovered["evaluation"]["health_attention"] == "NORMAL"
    assert recovered["evaluation"]["observed_value"] == pytest.approx(2.4)
    assert recovered["action_card"] is None


def test_deterioration_after_normal_hour_raises_watch_and_card(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database

    normal = post_hour(client, 8, 2.5)
    worse = post_hour(client, 9, 3.5)

    assert normal["evaluation"]["health_attention"] == "NORMAL"
    assert normal["action_card"] is None
    assert worse["evaluation"]["health_attention"] == "WATCH"
    assert worse["evaluation"]["observed_value"] == pytest.approx(3.5)
    assert worse["action_card"]["card_id"] == "ENV_CO2_WATCH_CARD_V2"


def test_severe_symptom_with_normal_sensor_does_not_change_attention(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    """Current behaviour: subjective check-ins are context, not an alarm trigger.

    docs/API_DATA_MODEL.md states that check-ins do not change the attention
    level yet. If symptoms should escalate attention, that is a new medical
    rule and needs the project owner's approval first.
    """

    client, _ = api_with_database
    post_hour(client, 8, 2.2)
    check_in = {
        "mission_id": "demo-iss-01",
        "crew_member_id": "crew-01",
        "fatigue": 4,
        "dizziness": 4,
        "nausea": 0,
        "pain": 4,
        "mood_distress": 0,
        "observed_at": "2026-11-14T08:59:30Z",
        "source_type": "SYNTHETIC",
        "source_id": "demo-scenario-runner",
        "scenario_id": "co2-scenario-test",
    }
    assert client.post("/v1/check-ins", json=check_in).status_code == 201

    response = client.get(
        "/v1/crew/crew-01/status",
        params={
            "mission_id": "demo-iss-01",
            "environment_target_id": "iss-destiny-lab",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["co2"]["health_attention"] == "NORMAL"
    assert body["co2"]["action_card"] is None
    assert body["latest_check_in"]["pain"] == 4
    assert body["latest_check_in"]["dizziness"] == 4


def test_high_co2_without_symptoms_still_shows_the_card(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database

    post_hour(client, 8, 3.3)
    response = client.get(
        "/v1/crew/crew-01/status",
        params={
            "mission_id": "demo-iss-01",
            "environment_target_id": "iss-destiny-lab",
        },
    )

    body = response.json()
    assert body["co2"]["health_attention"] == "WATCH"
    assert body["co2"]["action_card"]["card_id"] == "ENV_CO2_WATCH_CARD_V2"
    assert body["latest_check_in"] is None
