from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session

from spaceapp_logar.api import measurements as measurements_api
from spaceapp_logar.db.models import Observation
from spaceapp_logar.schemas.measurements import MeasurementCreate
from spaceapp_logar.services.ingest import store_measurement
from tests.api.test_measurements import payload


def count_observations(engine: Engine) -> int:
    with Session(engine) as session:
        return session.scalar(select(func.count()).select_from(Observation)) or 0


def test_all_or_nothing_rejects_everything_with_per_index_errors(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, engine = api_client

    response = client.post(
        "/v1/measurements/batch",
        json={
            "mode": "all_or_nothing",
            "measurements": [payload(), payload(unit="kPa"), payload(), {"x": 1}],
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["accepted"] == 0
    assert [item["index"] for item in body["rejected"]] == [1, 3]
    assert body["rejected"][0]["errors"]
    assert count_observations(engine) == 0


def test_partial_stores_valid_items_and_reports_rejected(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, engine = api_client

    response = client.post(
        "/v1/measurements/batch",
        json={
            "mode": "partial",
            "measurements": [payload(), payload(metric="NOPE"), payload(value=72.0)],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["accepted"] == 2
    assert [item["index"] for item in body["rejected"]] == [1]
    assert body["evaluations"] > 0
    assert count_observations(engine) == 2


def test_valid_batch_runs_rules_like_single_endpoint(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    response = client.post(
        "/v1/measurements/batch",
        json={"mode": "all_or_nothing", "measurements": [payload()]},
    )

    assert response.status_code == 201
    # Single endpoint yields two evaluations for one heart-rate point.
    assert response.json()["evaluations"] == 2


def test_items_are_stored_in_observed_at_order(
    api_client: tuple[TestClient, Engine],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, engine = api_client
    stored: list[float] = []

    def recording_store(session: Session, measurement: MeasurementCreate) -> Observation:
        stored.append(measurement.value)
        return store_measurement(session, measurement)

    monkeypatch.setattr(measurements_api, "store_measurement", recording_store)
    times = ["2026-11-14T08:02:00Z", "2026-11-14T08:00:00Z", "2026-11-14T08:01:00Z"]

    response = client.post(
        "/v1/measurements/batch",
        json={
            "mode": "partial",
            "measurements": [payload(observed_at=t, value=60.0 + i) for i, t in enumerate(times)],
        },
    )

    assert response.status_code == 201
    assert stored == [61.0, 62.0, 60.0]
    assert count_observations(engine) == 3


def test_batch_limit_is_enforced(api_client: tuple[TestClient, Engine]) -> None:
    client, engine = api_client

    response = client.post(
        "/v1/measurements/batch",
        json={"mode": "partial", "measurements": [payload()] * 1001},
    )

    assert response.status_code == 413
    assert "1000" in response.json()["detail"]
    assert count_observations(engine) == 0


def test_unknown_mode_is_a_validation_error(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    response = client.post(
        "/v1/measurements/batch", json={"mode": "maybe", "measurements": []}
    )

    assert response.status_code == 422
