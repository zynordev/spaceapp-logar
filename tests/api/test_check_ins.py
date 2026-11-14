from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from spaceapp_logar.db.models import SubjectiveCheckIn
from spaceapp_logar.db.session import create_database_engine, get_session
from spaceapp_logar.main import app


def valid_manual_payload() -> dict[str, object]:
    return {
        "mission_id": "demo-iss-01",
        "crew_member_id": "crew-01",
        "fatigue": 1,
        "dizziness": 0,
        "nausea": 0,
        "pain": 2,
        "mood_distress": 1,
        "observed_at": "2026-11-14T08:05:00Z",
        "source_type": "MANUAL",
        "source_id": "crew-tablet-01",
        "scenario_id": None,
    }


def test_post_check_in_persists_five_raw_scores(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, engine = api_with_database

    response = client.post("/v1/check-ins", json=valid_manual_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["id"]
    assert body["fatigue"] == 1
    assert body["pain"] == 2
    assert body["observed_at"] == "2026-11-14T08:05:00Z"

    with Session(engine) as session:
        stored = session.scalar(select(SubjectiveCheckIn))
    assert stored is not None
    assert stored.crew_member_id == "crew-01"
    assert stored.mood_distress == 1


def test_invalid_check_in_returns_422_without_writing(
    api_with_database: tuple[TestClient, Engine],
) -> None:
    client, engine = api_with_database
    payload = valid_manual_payload()
    payload["pain"] = 5

    response = client.post("/v1/check-ins", json=payload)

    assert response.status_code == 422
    with Session(engine) as session:
        count = session.scalar(select(func.count()).select_from(SubjectiveCheckIn))
    assert count == 0

