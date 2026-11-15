from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker

from spaceapp_logar.db.models import RuleEvaluationRecord
from spaceapp_logar.db.session import create_database_engine, get_session
from spaceapp_logar.main import app


def co2_payload(minute: int, value: float) -> dict[str, object]:
    return {
        "mission_id": "demo-iss-01",
        "target_type": "ENVIRONMENT",
        "target_id": "iss-destiny-lab",
        "metric": "CABIN_CO2_PARTIAL_PRESSURE",
        "value": value,
        "unit": "mmHg",
        "observed_at": f"2026-11-14T08:{minute:02d}:00Z",
        "source_type": "SYNTHETIC",
        "source_id": "co2-simulator-01",
        "scenario_id": "co2-rise-demo-v1",
        "reported_quality": "VALID",
    }


def post_full_hour(client: TestClient, value: float) -> dict[str, object]:
    body: dict[str, object] = {}
    for minute in range(60):
        response = client.post("/v1/observations", json=co2_payload(minute, value))
        assert response.status_code == 201
        body = response.json()
    return body


def get_status(client: TestClient):
    return client.get(
        "/v1/crew/crew-01/status",
        params={
            "mission_id": "demo-iss-01",
            "environment_target_id": "iss-destiny-lab",
        },
    )


def test_insufficient_window_shows_no_card(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database

    response = client.post("/v1/observations", json=co2_payload(0, 3.5))

    assert response.status_code == 201
    body = response.json()
    assert body["evaluation"]["health_attention"] == "UNKNOWN"
    assert body["action_card"] is None


def test_sustained_high_co2_returns_the_approved_watch_card(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database

    body = post_full_hour(client, 3.2)

    assert body["evaluation"]["health_attention"] == "WATCH"
    card = body["action_card"]
    assert card["card_id"] == "ENV_CO2_WATCH_CARD_V2"
    assert card["version"] == 2
    assert card["attention"] == "WATCH"
    assert card["title_tr"].startswith("Cabin CO₂ high")
    assert card["step_keys"] == [
        "check_airflow",
        "compare_modules",
        "check_removal_system",
        "record_check_in",
    ]
    assert all(step["why_tr"] for step in card["steps"])
    assert card["reassess_minutes"] == 30
    assert card["references"][0]["uri"].startswith("https://www.nasa.gov/")
    assert card["requires_mission_procedure"] is True
    assert card["allows_automatic_vehicle_command"] is False


def test_normal_co2_returns_no_card(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database

    body = post_full_hour(client, 2.5)

    assert body["evaluation"]["health_attention"] == "NORMAL"
    assert body["action_card"] is None


def test_shown_card_is_recorded_with_the_rule_evaluation(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, engine = api_with_database

    post_full_hour(client, 3.2)

    with Session(engine) as session:
        records = session.scalars(
            select(RuleEvaluationRecord).order_by(RuleEvaluationRecord.evaluated_at)
        ).all()
    assert len(records) == 60
    # Early evaluations had too little data, so no card was shown.
    assert records[0].action_card_id is None
    assert records[0].action_card_version is None
    # The final evaluation showed the approved card at version 2.
    assert records[-1].health_attention == "WATCH"
    assert records[-1].action_card_id == "ENV_CO2_WATCH_CARD_V2"
    assert records[-1].action_card_version == 2


def test_crew_status_includes_the_card_that_was_shown(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database

    post_full_hour(client, 3.2)
    response = get_status(client)

    assert response.status_code == 200
    card = response.json()["co2"]["action_card"]
    assert card["card_id"] == "ENV_CO2_WATCH_CARD_V2"
    assert card["allows_automatic_vehicle_command"] is False


def test_crew_status_without_a_card_has_null_action_card(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database

    post_full_hour(client, 2.5)
    response = get_status(client)

    assert response.status_code == 200
    assert response.json()["co2"]["action_card"] is None
