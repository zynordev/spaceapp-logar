from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

MISSION = "demo-measure-01"


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
        "scenario_id": "measure-test",
        "reported_quality": "VALID",
        "activity_state": "REST",
    }
    body.update(overrides)
    return body


def test_metric_catalog_lists_twelve_metrics(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    metrics = client.get("/v1/metrics").json()

    assert len(metrics) == 12
    assert any(m["metric"] == "HRV_RMSSD" and m["unit"] == "ms" for m in metrics)
    heart = next(m for m in metrics if m["metric"] == "HEART_RATE")
    assert heart["unit"] == "bpm"
    assert heart["category"] == "vital"


def test_heart_rate_measurement_runs_its_rules(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    response = client.post("/v1/measurements", json=payload())

    assert response.status_code == 201
    body = response.json()
    assert body["measurement"]["activity_state"] == "REST"
    assert {e["rule_id"] for e in body["evaluations"]} == {
        "DATA_HR_JUMP_V1",
        "MULTI_CARDIO_RESP_V1",
    }


def test_co2_measurement_uses_the_approved_co2_rule(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    response = client.post(
        "/v1/measurements",
        json=payload(
            target_type="ENVIRONMENT",
            target_id="iss-destiny-lab",
            metric="CABIN_CO2_PARTIAL_PRESSURE",
            unit="mmHg",
            value=3.2,
            activity_state=None,
        ),
    )

    assert response.status_code == 201
    evaluation = response.json()["evaluations"][0]
    assert evaluation["rule_id"] == "ENV_CO2_NOMINAL_V1"
    assert evaluation["validation_status"] == "APPROVED"


def test_metric_without_rules_is_stored(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    response = client.post(
        "/v1/measurements",
        json=payload(metric="SYSTOLIC_BP", unit="mmHg", value=118.0),
    )

    assert response.status_code == 201
    assert response.json()["evaluations"] == []


@pytest.mark.parametrize(
    "overrides",
    [
        {"unit": "mmHg"},
        {"target_type": "ENVIRONMENT"},
        {"metric": "STEP_COUNT"},
        {"activity_state": "DANCING"},
        {"scenario_id": None},
        {"source_type": "SENSOR"},
        {"observed_at": "2026-11-14T08:00:00"},
        {"extra": 1},
    ],
)
def test_invalid_measurements_are_rejected(
    api_client: tuple[TestClient, Engine], overrides: dict[str, object]
) -> None:
    client, _ = api_client

    assert client.post("/v1/measurements", json=payload(**overrides)).status_code == 422


def test_environment_measurement_rejects_activity_state(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    response = client.post(
        "/v1/measurements",
        json=payload(
            target_type="ENVIRONMENT",
            target_id="iss-destiny-lab",
            metric="CABIN_O2_FRACTION",
            unit="%",
            value=21.0,
        ),
    )

    assert response.status_code == 422


def test_series_and_missions(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    for minute, value in [(2, 72.0), (0, 70.0), (1, 71.0)]:
        client.post(
            "/v1/measurements",
            json=payload(observed_at=f"2026-11-14T08:0{minute}:00Z", value=value),
        )

    series = client.get(
        "/v1/measurements",
        params={"mission_id": MISSION, "target_id": "crew-01", "metric": "HEART_RATE"},
    ).json()
    limited = client.get(
        "/v1/measurements",
        params={
            "mission_id": MISSION,
            "target_id": "crew-01",
            "metric": "HEART_RATE",
            "limit": 2,
        },
    ).json()
    missions = client.get("/v1/missions").json()

    assert [p["value"] for p in series["points"]] == [70.0, 71.0, 72.0]
    assert [p["value"] for p in limited["points"]] == [71.0, 72.0]
    assert missions[0]["mission_id"] == MISSION
    assert missions[0]["crew_member_ids"] == ["crew-01"]
    assert missions[0]["scenario_id"] == "measure-test"


def test_root_redirects_to_dashboard(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    response = client.get("/", follow_redirects=False)
    page = client.get("/ui/")

    assert response.status_code in (302, 307)
    assert response.headers["location"] == "/ui/"
    assert page.status_code == 200
    assert "SpaceApp Logar" in page.text
