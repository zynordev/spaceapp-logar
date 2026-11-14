from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from spaceapp_logar.db.models import (
    Observation,
    RuleEvaluationEvidence,
    RuleEvaluationRecord,
)
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


def test_post_observation_persists_immutable_raw_record(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, engine = api_with_database

    response = client.post("/v1/observations", json=valid_synthetic_payload())

    assert response.status_code == 201
    body = response.json()
    observation = body["observation"]
    assert observation["id"]
    assert observation["ingested_at"].endswith("Z")
    assert observation["observed_at"] == "2026-11-14T08:00:00Z"
    assert observation["value"] == 3.2
    assert observation["scenario_id"] == "co2-rise-demo-v1"
    assert body["window"]["valid_minute_buckets"] == 1
    assert body["evaluation"]["health_attention"] == "UNKNOWN"

    with Session(engine) as session:
        stored = session.scalar(select(Observation))
        evaluation = session.scalar(select(RuleEvaluationRecord))
        evidence = session.scalar(select(RuleEvaluationEvidence))

    assert stored is not None
    assert str(stored.id) == observation["id"]
    assert stored.observed_at.isoformat() == "2026-11-14T08:00:00+00:00"
    assert stored.source_type == "SYNTHETIC"
    assert evaluation is not None
    assert evaluation.health_attention == "UNKNOWN"
    assert evidence is not None
    assert evidence.evaluation_id == evaluation.id
    assert evidence.observation_id == stored.id


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
        evaluation_count = session.scalar(
            select(func.count()).select_from(RuleEvaluationRecord)
        )
    assert stored_count == 0
    assert evaluation_count == 0


def test_sixty_balanced_minutes_produce_explainable_watch(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, _ = api_with_database
    latest_body: dict[str, object] | None = None

    for minute in range(60):
        payload = valid_synthetic_payload()
        payload["observed_at"] = f"2026-11-14T08:{minute:02d}:00Z"
        response = client.post("/v1/observations", json=payload)
        assert response.status_code == 201
        latest_body = response.json()

    assert latest_body is not None
    window = latest_body["window"]
    evaluation = latest_body["evaluation"]
    assert window["valid_minute_buckets"] == 60
    assert window["average_ppco2_mmhg"] == pytest.approx(3.2)
    assert evaluation["rule_id"] == "ENV_CO2_NOMINAL_V1"
    assert evaluation["health_attention"] == "WATCH"
    assert evaluation["source_uri"].startswith("https://www.nasa.gov/")

