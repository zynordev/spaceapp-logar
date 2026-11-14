from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

MISSION = "demo-red-flag-01"
CREW = "crew-01"


def report(client: TestClient, *flags: str, at: str = "2026-11-14T10:00:00Z", **extra):
    body = {
        "mission_id": MISSION,
        "crew_member_id": CREW,
        "flags": list(flags),
        "observed_at": at,
        "source_type": "MANUAL",
        "source_id": "dashboard-user",
    }
    body.update(extra)
    return client.post("/v1/red-flags", json=body)


def status(client: TestClient) -> dict:
    return client.get(
        f"/v1/crew/{CREW}/status", params={"mission_id": MISSION}
    ).json()


def alerts(client: TestClient) -> list[dict]:
    return client.get("/v1/alerts", params={"mission_id": MISSION}).json()


def test_catalog_lists_red_flags_with_labels(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    catalog = client.get("/v1/red-flags/catalog").json()

    assert len(catalog) == 9
    chest = next(item for item in catalog if item["flag"] == "CHEST_PAIN")
    assert "Göğüs" in chest["label"]


def test_red_flag_escalates_immediately_without_any_sensor_data(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    response = report(client, "CHEST_PAIN")

    assert response.status_code == 201
    evaluation = response.json()["evaluation"]
    assert evaluation["rule_id"] == "RED_FLAG_SYMPTOM_V1"
    assert evaluation["health_attention"] == "CRITICAL"
    assert evaluation["validation_status"] == "DEMO_PENDING_REVIEW"
    card = evaluation["action_card"]
    assert card["card_id"] == "RED_FLAG_EMERGENCY_CARD_V1"
    assert card["allows_automatic_vehicle_command"] is False
    assert "teşhis" in evaluation["explanation"].lower()
    assert response.json()["alert_id"] is not None

    current = status(client)
    assert current["overall_attention"] == "CRITICAL"
    [alert] = alerts(client)
    assert alert["status"] == "OPEN"
    assert alert["health_attention"] == "CRITICAL"
    assert alert["manual_resolution"] is True


def test_repeated_report_updates_the_same_alert(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    report(client, "CHEST_PAIN")
    report(client, "CHEST_PAIN", "SEVERE_SHORTNESS_OF_BREATH", at="2026-11-14T10:02:00Z")

    [alert] = alerts(client)
    assert "nefes darlığı" in alert["explanation"]


def test_resolution_needs_a_person_and_is_recorded(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    report(client, "FAINTING_OR_LOSS_OF_CONSCIOUSNESS")
    alert_id = alerts(client)[0]["id"]

    acknowledged = client.post(
        f"/v1/alerts/{alert_id}/acknowledge", json={"crew_member_id": CREW}
    )
    resolved = client.post(
        f"/v1/alerts/{alert_id}/resolve", json={"crew_member_id": "crew-medic"}
    )
    again = client.post(
        f"/v1/alerts/{alert_id}/resolve", json={"crew_member_id": "crew-medic"}
    )

    assert acknowledged.json()["status"] == "ACKNOWLEDGED"
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "RESOLVED"
    assert resolved.json()["resolved_by"] == "crew-medic"
    assert again.status_code == 409
    rules = {rule["rule_id"]: rule for rule in status(client)["rules"]}
    assert rules["RED_FLAG_SYMPTOM_V1"]["health_attention"] == "NORMAL"
    assert "crew-medic" in rules["RED_FLAG_SYMPTOM_V1"]["explanation"]


def test_new_report_after_resolution_opens_a_new_alert(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    report(client, "CHEST_PAIN")
    first_id = alerts(client)[0]["id"]
    client.post(f"/v1/alerts/{first_id}/resolve", json={"crew_member_id": "crew-medic"})

    report(client, "RAPID_WORSENING", at="2099-01-01T00:00:00Z")

    current = alerts(client)
    assert len(current) == 2
    assert current[0]["status"] == "OPEN"
    assert current[0]["id"] != first_id


def test_measurement_alerts_cannot_be_closed_by_hand(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    run = client.post("/v1/demo/scenarios/co2-headache/run").json()
    co2_alert = client.get(
        "/v1/alerts", params={"mission_id": run["mission_id"]}
    ).json()[0]

    response = client.post(
        f"/v1/alerts/{co2_alert['id']}/resolve", json={"crew_member_id": "crew-medic"}
    )

    assert co2_alert["manual_resolution"] is False
    assert response.status_code == 409


def test_resolve_unknown_alert_is_404(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    response = client.post(
        f"/v1/alerts/{uuid4()}/resolve", json={"crew_member_id": "crew-medic"}
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("flags", "extra"),
    [
        ((), {}),
        (("CHEST_PAIN", "CHEST_PAIN"), {}),
        (("HEADACHE",), {}),
        (("CHEST_PAIN",), {"scenario_id": "x"}),
        (("CHEST_PAIN",), {"source_type": "SYNTHETIC"}),
        (("CHEST_PAIN",), {"observed_at": "2026-11-14T10:00:00"}),
        (("CHEST_PAIN",), {"note": "free text"}),
    ],
)
def test_invalid_reports_are_rejected(
    api_client: tuple[TestClient, Engine], flags: tuple[str, ...], extra: dict
) -> None:
    client, _ = api_client

    assert report(client, *flags, **extra).status_code == 422


def test_chest_pain_demo_scenario(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    run = client.post("/v1/demo/scenarios/chest-pain-red-flag/run").json()
    current = client.get(
        f"/v1/crew/{run['crew_member_id']}/status",
        params={
            "mission_id": run["mission_id"],
            "environment_target_id": run["environment_target_id"],
        },
    ).json()
    rules = {rule["rule_id"]: rule for rule in current["rules"]}

    assert current["overall_attention"] == "CRITICAL"
    assert rules["RED_FLAG_SYMPTOM_V1"]["health_attention"] == "CRITICAL"
    # Vital signs stay normal: normal sensors do not rule out a serious event.
    for rule_id in ("VITAL_SPO2_SUSTAINED_V1", "MULTI_CARDIO_RESP_V1", "VITAL_TEMP_TREND_V1"):
        assert rules[rule_id]["health_attention"] == "NORMAL"
