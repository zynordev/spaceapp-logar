"""End-to-end demo scenarios: each must produce its documented outcome."""

import time

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine


def run(client: TestClient, scenario_id: str) -> dict:
    response = client.post(f"/v1/demo/scenarios/{scenario_id}/run")
    assert response.status_code == 201, response.text
    return response.json()


def status_of(client: TestClient, run_result: dict) -> dict:
    response = client.get(
        f"/v1/crew/{run_result['crew_member_id']}/status",
        params={
            "mission_id": run_result["mission_id"],
            "environment_target_id": run_result["environment_target_id"],
        },
    )
    assert response.status_code == 200
    return response.json()


def rules_by_id(status: dict) -> dict[str, dict]:
    return {rule["rule_id"]: rule for rule in status["rules"]}


def alerts_of(client: TestClient, run_result: dict) -> list[dict]:
    return client.get(
        "/v1/alerts", params={"mission_id": run_result["mission_id"]}
    ).json()


def test_scenario_catalog_lists_four_scenarios(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    scenarios = client.get("/v1/demo/scenarios").json()

    assert {s["scenario_id"] for s in scenarios} == {
        "co2-headache",
        "fever-trend",
        "spo2-drop",
        "sensor-fault",
    }
    assert all(s["expected"] for s in scenarios)


def test_unknown_scenario_is_404(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    assert client.post("/v1/demo/scenarios/nope/run").status_code == 404


def test_co2_headache_scenario(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    started = time.perf_counter()
    result = run(client, "co2-headache")
    elapsed = time.perf_counter() - started

    status = status_of(client, result)
    rules = rules_by_id(status)

    assert rules["ENV_CO2_NOMINAL_V1"]["health_attention"] == "WATCH"
    assert rules["ENV_CO2_NOMINAL_V1"]["action_card"]["card_id"] == "ENV_CO2_WATCH_CARD_V1"
    assert rules["VITAL_SPO2_SUSTAINED_V1"]["health_attention"] == "NORMAL"
    assert rules["VITAL_TEMP_TREND_V1"]["health_attention"] == "NORMAL"
    assert rules["MULTI_CARDIO_RESP_V1"]["health_attention"] == "NORMAL"
    assert status["overall_attention"] == "WATCH"
    alerts = alerts_of(client, result)
    assert [a["rule_id"] for a in alerts] == ["ENV_CO2_NOMINAL_V1"]
    assert status["latest_check_in"]["pain"] == 2
    # Exercise raised the heart rate but never opened a cardio alert.
    assert not any(a["rule_id"] == "MULTI_CARDIO_RESP_V1" for a in alerts)
    assert elapsed < 60


def test_fever_trend_scenario(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    result = run(client, "fever-trend")

    status = status_of(client, result)
    rules = rules_by_id(status)

    assert rules["VITAL_TEMP_TREND_V1"]["health_attention"] == "ALERT"
    assert rules["VITAL_TEMP_TREND_V1"]["validation_status"] == "DEMO_PENDING_REVIEW"
    assert rules["MULTI_CARDIO_RESP_V1"]["health_attention"] == "ALERT"
    assert (
        rules["MULTI_CARDIO_RESP_V1"]["action_card"]["card_id"]
        == "MULTI_CARDIO_RESP_ALERT_CARD_V1"
    )
    assert rules["ENV_CO2_NOMINAL_V1"]["health_attention"] == "NORMAL"
    assert status["overall_attention"] == "ALERT"
    open_rules = {a["rule_id"] for a in alerts_of(client, result) if a["status"] == "OPEN"}
    assert {"VITAL_TEMP_TREND_V1", "MULTI_CARDIO_RESP_V1"} <= open_rules

    panel = client.get(
        f"/v1/crew/{result['crew_member_id']}/lab-results",
        params={"mission_id": result["mission_id"]},
    ).json()
    wbc = next(item for item in panel["results"] if item["analyte"] == "WBC")
    assert wbc["position_vs_reference"] == "ABOVE"
    assert wbc["baseline_value"] == pytest.approx(6.1)


def test_spo2_drop_scenario(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    result = run(client, "spo2-drop")

    rules = rules_by_id(status_of(client, result))
    spo2 = rules["VITAL_SPO2_SUSTAINED_V1"]

    assert spo2["health_attention"] == "ALERT"
    assert spo2["action_card"]["card_id"] == "VITAL_SPO2_ALERT_CARD_V1"
    assert spo2["action_card"]["allows_automatic_vehicle_command"] is False
    alerts = [a for a in alerts_of(client, result) if a["rule_id"] == spo2["rule_id"]]
    # WATCH escalated to ALERT inside the same alert, not a duplicate.
    assert len(alerts) == 1
    assert alerts[0]["health_attention"] == "ALERT"


def test_sensor_fault_scenario_never_looks_healthy(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    result = run(client, "sensor-fault")

    status = status_of(client, result)
    rules = rules_by_id(status)

    assert rules["VITAL_SPO2_SUSTAINED_V1"]["health_attention"] == "UNKNOWN"
    assert rules["VITAL_SPO2_SUSTAINED_V1"]["action_card"] is None
    jump = rules["DATA_HR_JUMP_V1"]
    assert jump["data_quality"] == "SUSPECT"
    assert jump["health_attention"] == "UNKNOWN"
    assert jump["action_card"]["card_id"] == "DATA_HR_SENSOR_CHECK_CARD_V1"
    assert status["overall_attention"] == "UNKNOWN"
    assert alerts_of(client, result) == []


def test_runs_never_overwrite_each_other(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    first = run(client, "sensor-fault")
    second = run(client, "sensor-fault")

    missions = {m["mission_id"] for m in client.get("/v1/missions").json()}

    assert first["mission_id"] != second["mission_id"]
    assert {first["mission_id"], second["mission_id"]} <= missions
