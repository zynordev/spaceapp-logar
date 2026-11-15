from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine

from spaceapp_logar.db import session as db_session
from spaceapp_logar.db.schema_check import CURRENT, OUTDATED, SchemaGuard, check_schema
from spaceapp_logar.main import app


def migrated_engine(tmp_path: Path, revision: str):
    url = f"sqlite:///{tmp_path / 'schema.db'}"
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, revision)
    return create_engine(url)


def test_head_database_is_current(tmp_path: Path) -> None:
    engine = migrated_engine(tmp_path, "head")

    status = check_schema(engine)

    assert status.state == CURRENT
    assert status.database_revision == status.code_revision


def test_database_behind_code_is_outdated(tmp_path: Path) -> None:
    engine = migrated_engine(tmp_path, "20261114_0010")

    status = check_schema(engine)

    assert status.state == OUTDATED
    assert status.database_revision == "20261114_0010"
    assert "alembic upgrade head" in status.message


def test_outdated_schema_returns_clear_503_not_500(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = migrated_engine(tmp_path, "20261114_0010")
    monkeypatch.setattr(db_session, "schema_guard", SchemaGuard(engine))
    client = TestClient(app)

    data = client.get("/v1/missions")
    health = client.get("/health")
    ui = client.get("/ui/")

    assert data.status_code == 503
    assert data.json()["detail"]["code"] == "SCHEMA_OUTDATED"
    assert "alembic upgrade head" in data.json()["detail"]["message"]
    assert health.status_code == 200
    assert health.json()["schema"] == "outdated"
    assert ui.status_code == 200  # the dashboard (or its build hint page) still loads
    assert "SpaceApp Logar" in ui.text


def test_guard_recovers_after_migration(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    engine = migrated_engine(tmp_path, "20261114_0010")
    guard = SchemaGuard(engine)
    assert guard.status().state == OUTDATED

    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", f"sqlite:///{tmp_path / 'schema.db'}")
    command.upgrade(config, "head")
    monkeypatch.setattr("spaceapp_logar.db.schema_check.RECHECK_SECONDS", 0.0)

    assert guard.status().state == CURRENT
