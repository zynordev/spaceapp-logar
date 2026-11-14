from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

MISSION = "demo-iss-01"


def co2_payload(hour: int, minute: int, value: float) -> dict[str, object]:
    return {
        "mission_id": MISSION,
        "target_type": "ENVIRONMENT",
        "target_id": "iss-destiny-lab",
        "metric": "CABIN_CO2_PARTIAL_PRESSURE",
        "value": value,
        "unit": "mmHg",
        "observed_at": f"2026-11-14T{hour:02d}:{minute:02d}:00Z",
        "source_type": "SYNTHETIC",
        "source_id": "co2-simulator-01",
        "scenario_id": "alert-lifecycle-test",
        "reported_quality": "VALID",
    }


def post_hour(client: TestClient, hour: int, value: float) -> None:
    for minute in range(60):
        response = client.post("/v1/observations", json=co2_payload(hour, minute, value))
        assert response.status_code == 201


def list_alerts(client: TestClient, **params: str):
    return client.get("/v1/alerts", params={"mission_id": MISSION, **params})


def test_no_alerts_without_data(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    response = list_alerts(client)

    assert response.status_code == 200
    assert response.json() == []


def test_normal_co2_opens_no_alert(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    post_hour(client, 8, 2.4)

    assert list_alerts(client).json() == []


def test_sustained_high_co2_opens_one_open_alert_with_card(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    post_hour(client, 8, 3.4)
    alerts = list_alerts(client).json()

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert["status"] == "OPEN"
    assert alert["health_attention"] == "WATCH"
    assert alert["rule_id"] == "ENV_CO2_NOMINAL_V1"
    assert alert["target_id"] == "iss-destiny-lab"
    assert alert["acknowledged_at"] is None
    assert alert["resolved_at"] is None
    assert alert["action_card"]["card_id"] == "ENV_CO2_WATCH_CARD_V2"
    assert "3.40" in alert["explanation"]


def test_continued_high_co2_updates_the_same_alert_without_duplicates(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    post_hour(client, 8, 3.4)
    first = list_alerts(client).json()[0]
    post_hour(client, 9, 3.6)
    alerts = list_alerts(client).json()

    assert len(alerts) == 1
    assert alerts[0]["id"] == first["id"]
    assert alerts[0]["opened_at"] == first["opened_at"]
    assert alerts[0]["last_evaluated_at"] > first["last_evaluated_at"]
    assert alerts[0]["last_evaluation_id"] != first["last_evaluation_id"]


def test_acknowledge_records_who_and_is_idempotent(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_hour(client, 8, 3.4)
    alert_id = list_alerts(client).json()[0]["id"]

    first = client.post(
        f"/v1/alerts/{alert_id}/acknowledge",
        json={"crew_member_id": "crew-01"},
    )
    second = client.post(
        f"/v1/alerts/{alert_id}/acknowledge",
        json={"crew_member_id": "crew-02"},
    )

    assert first.status_code == 200
    assert first.json()["status"] == "ACKNOWLEDGED"
    assert first.json()["acknowledged_by"] == "crew-01"
    assert first.json()["acknowledged_at"] is not None
    assert second.status_code == 200
    assert second.json()["acknowledged_by"] == "crew-01"
    assert second.json()["acknowledged_at"] == first.json()["acknowledged_at"]


def test_acknowledged_alert_stays_single_while_co2_remains_high(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_hour(client, 8, 3.4)
    alert_id = list_alerts(client).json()[0]["id"]
    client.post(f"/v1/alerts/{alert_id}/acknowledge", json={"crew_member_id": "crew-01"})

    post_hour(client, 9, 3.5)
    alerts = list_alerts(client).json()

    assert len(alerts) == 1
    assert alerts[0]["status"] == "ACKNOWLEDGED"


def test_recovery_resolves_the_alert_and_blocks_acknowledge(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_hour(client, 8, 3.4)
    alert_id = list_alerts(client).json()[0]["id"]

    post_hour(client, 9, 2.4)
    alert = list_alerts(client).json()[0]
    response = client.post(
        f"/v1/alerts/{alert_id}/acknowledge",
        json={"crew_member_id": "crew-01"},
    )

    assert alert["status"] == "RESOLVED"
    assert alert["resolved_at"] is not None
    assert alert["resolved_evaluation_id"] is not None
    assert response.status_code == 409


def test_missing_data_does_not_resolve_an_open_alert(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_hour(client, 8, 3.4)

    # One lone reading two hours later: the window is insufficient, so the
    # evaluation is UNKNOWN. Bad data is not evidence that the situation ended.
    response = client.post("/v1/observations", json=co2_payload(10, 30, 2.0))
    assert response.status_code == 201
    assert response.json()["evaluation"]["health_attention"] == "UNKNOWN"

    alerts = list_alerts(client).json()
    assert len(alerts) == 1
    assert alerts[0]["status"] == "OPEN"


def test_high_co2_after_resolution_opens_a_new_alert(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_hour(client, 8, 3.4)
    post_hour(client, 9, 2.4)
    post_hour(client, 10, 3.6)

    alerts = list_alerts(client).json()

    assert len(alerts) == 2
    assert alerts[0]["status"] == "OPEN"
    assert alerts[1]["status"] == "RESOLVED"
    assert alerts[0]["id"] != alerts[1]["id"]


def test_status_and_target_filters(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    post_hour(client, 8, 3.4)
    post_hour(client, 9, 2.4)
    post_hour(client, 10, 3.6)

    open_alerts = list_alerts(client, status="OPEN").json()
    resolved = list_alerts(client, status="RESOLVED").json()
    other_target = list_alerts(client, target_id="other-module").json()
    other_mission = client.get("/v1/alerts", params={"mission_id": "other"}).json()

    assert [alert["status"] for alert in open_alerts] == ["OPEN"]
    assert [alert["status"] for alert in resolved] == ["RESOLVED"]
    assert other_target == []
    assert other_mission == []
    assert len(list_alerts(client, limit="1").json()) == 1


def test_invalid_requests_are_rejected(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    unknown = client.post(
        f"/v1/alerts/{uuid4()}/acknowledge",
        json={"crew_member_id": "crew-01"},
    )
    bad_status = list_alerts(client, status="CLOSED")
    no_mission = client.get("/v1/alerts")
    extra_field = client.post(
        f"/v1/alerts/{uuid4()}/acknowledge",
        json={"crew_member_id": "crew-01", "note": "x"},
    )
    bad_limit = list_alerts(client, limit="0")

    assert unknown.status_code == 404
    assert bad_status.status_code == 422
    assert no_mission.status_code == 422
    assert extra_field.status_code == 422
    assert bad_limit.status_code == 422


@pytest.mark.parametrize("value", [3.0, 2.9])
def test_values_at_or_below_the_limit_never_open_an_alert(
    api_client: tuple[TestClient, Engine],
    value: float,
) -> None:
    client, _ = api_client

    post_hour(client, 8, value)

    assert list_alerts(client).json() == []
