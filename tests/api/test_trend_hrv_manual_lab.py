"""Trend endpoint, HRV metric (data only) and manual glucose lab entry."""

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

MISSION = "demo-trend-01"


def payload(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "mission_id": MISSION,
        "target_type": "CREW_MEMBER",
        "target_id": "crew-01",
        "metric": "HEART_RATE",
        "value": 70.0,
        "unit": "bpm",
        "observed_at": "2026-11-14T08:00:00Z",
        "source_type": "SYNTHETIC",
        "source_id": "sim-01",
        "scenario_id": "trend-test",
        "reported_quality": "VALID",
        "activity_state": "REST",
    }
    body.update(overrides)
    return body


def _post(client: TestClient, **overrides: object):
    return client.post("/v1/measurements", json=payload(**overrides))


def _trend(client: TestClient, **params: object):
    query = {
        "mission_id": MISSION,
        "target_id": "crew-01",
        "metric": "HEART_RATE",
        "bucket": "hour",
        **params,
    }
    return client.get("/v1/measurements/trend", params=query)


def test_hrv_rmssd_is_accepted_and_has_no_rule(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    response = _post(client, metric="HRV_RMSSD", value=42.0, unit="ms")

    assert response.status_code == 201
    assert response.json()["evaluations"] == []
    assert _post(client, metric="HRV_RMSSD", value=42.0, unit="bpm").status_code == 422
    metrics = {m["metric"]: m for m in client.get("/v1/metrics").json()}
    assert metrics["HRV_RMSSD"]["unit"] == "ms"
    assert metrics["HRV_RMSSD"]["category"] == "vital"


def test_trend_buckets_are_utc_aligned_with_stats(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    for when, value in [
        ("2026-11-14T08:05:00Z", 60.0),
        ("2026-11-14T08:55:00Z", 80.0),
        ("2026-11-14T10:00:00Z", 100.0),
        ("2026-11-14T09:10:00Z", 70.0),
    ]:
        assert _post(client, observed_at=when, value=value).status_code == 201
    # Excluded from the trend: non-VALID quality and an implausible value.
    fault = _post(
        client, observed_at="2026-11-14T08:10:00Z", value=200.0, reported_quality="FAULT"
    )
    assert fault.status_code == 201
    assert _post(client, observed_at="2026-11-14T08:20:00Z", value=5.0).status_code == 201

    response = _trend(client, since="2026-11-14T08:00:00Z", until="2026-11-14T11:00:00Z")

    assert response.status_code == 200
    body = response.json()
    assert body["unit"] == "bpm" and body["bucket"] == "hour"
    buckets = body["buckets"]
    assert [b["start"] for b in buckets] == [
        "2026-11-14T08:00:00Z",
        "2026-11-14T09:00:00Z",
        "2026-11-14T10:00:00Z",
    ]
    first = buckets[0]
    assert first["end"] == "2026-11-14T09:00:00Z"
    assert (first["count"], first["mean"], first["min"], first["max"]) == (2, 70.0, 60.0, 80.0)
    assert buckets[1]["count"] == 1 and buckets[2]["mean"] == 100.0

    daily = _trend(client, bucket="day").json()
    assert len(daily["buckets"]) == 1
    assert daily["buckets"][0]["start"] == "2026-11-14T00:00:00Z"
    assert daily["buckets"][0]["count"] == 4


def test_trend_empty_and_validation(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    empty = _trend(client, since="2026-11-01T00:00:00Z", until="2026-11-02T00:00:00Z")
    assert empty.status_code == 200 and empty.json()["buckets"] == []
    assert _trend(client).json()["buckets"] == []

    too_many = _trend(client, since="2026-01-01T00:00:00Z", until="2026-11-01T00:00:00Z")
    assert too_many.status_code == 422
    backwards = _trend(client, since="2026-11-02T00:00:00Z", until="2026-11-01T00:00:00Z")
    assert backwards.status_code == 422
    assert _trend(client, bucket="week").status_code == 422


@pytest.mark.parametrize(
    ("unit", "value", "low", "high"),
    [("mg/dL", 92.0, 70.0, 99.0), ("mmol/L", 5.1, 3.9, 5.5)],
)
def test_manual_glucose_entry_accepts_both_units(
    api_client: tuple[TestClient, Engine],
    unit: str,
    value: float,
    low: float,
    high: float,
) -> None:
    client, _ = api_client

    response = client.post(
        "/v1/lab-results",
        json={
            "mission_id": MISSION,
            "crew_member_id": "crew-01",
            "analyte": "GLUCOSE",
            "value": value,
            "unit": unit,
            "reference_low": low,
            "reference_high": high,
            "phase": "IN_FLIGHT",
            "sampled_at": "2026-11-14T08:00:00Z",
            "source_type": "MANUAL",
            "source_id": "crew-entry",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["unit"] == unit and body["source_type"] == "MANUAL"


def test_trend_has_no_silent_row_cap(
    api_client: tuple[TestClient, Engine], monkeypatch: pytest.MonkeyPatch
) -> None:
    from spaceapp_logar.api import measurements

    monkeypatch.setattr(measurements, "TREND_FETCH_BATCH", 2)
    client, _ = api_client
    for minute in range(10):
        assert _post(
            client, observed_at=f"2026-11-14T0{minute // 5 + 8 if minute < 5 else 9}:{(minute % 5) * 10:02d}:00Z"
        ).status_code == 201

    body = _trend(client, since="2026-11-14T00:00:00Z", until="2026-11-15T00:00:00Z").json()

    assert sum(b["count"] for b in body["buckets"]) == 10
    assert body["buckets"][-1]["start"] == "2026-11-14T09:00:00Z"
