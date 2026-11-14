from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

from spaceapp_logar.rules.catalog import RULES
from spaceapp_logar.rules.risk_coverage import HAZARDS


def run_and_status(client: TestClient, scenario_id: str) -> tuple[dict, dict, list[dict]]:
    run = client.post(f"/v1/demo/scenarios/{scenario_id}/run").json()
    status = client.get(
        f"/v1/crew/{run['crew_member_id']}/status",
        params={
            "mission_id": run["mission_id"],
            "environment_target_id": run["environment_target_id"],
        },
    ).json()
    alerts = client.get("/v1/alerts", params={"mission_id": run["mission_id"]}).json()
    return run, status, alerts


def by_id(status: dict) -> dict[str, dict]:
    return {rule["rule_id"]: rule for rule in status["rules"]}


def test_cabin_o2_drop_scenario(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    _, status, alerts = run_and_status(client, "cabin-o2-drop")
    rules = by_id(status)

    assert rules["ENV_CABIN_ATMOSPHERE_V1"]["health_attention"] == "ALERT"
    assert rules["VITAL_SPO2_SUSTAINED_V1"]["health_attention"] == "WATCH"
    assert status["overall_attention"] == "ALERT"
    assert {"ENV_CABIN_ATMOSPHERE_V1", "VITAL_SPO2_SUSTAINED_V1"} <= {a["rule_id"] for a in alerts}


def test_radiation_scenario_reports_cumulative_dose(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    _, status, alerts = run_and_status(client, "radiation-spe")
    radiation = by_id(status)["ENV_RADIATION_V1"]

    assert radiation["health_attention"] == "ALERT"
    assert "kümülatif doz" in radiation["explanation"]
    assert radiation["action_card"]["card_id"] == "ENV_RADIATION_ALERT_CARD_V2"
    [alert] = [a for a in alerts if a["rule_id"] == "ENV_RADIATION_V1"]
    assert alert["health_attention"] == "ALERT"


def test_sleep_debt_scenario(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    _, status, _ = run_and_status(client, "sleep-debt")
    sleep = by_id(status)["BEHAV_SLEEP_V1"]

    assert sleep["health_attention"] == "ALERT"
    assert "4,8" in sleep["explanation"]


def test_gravity_adaptation_scenario(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    _, status, _ = run_and_status(client, "gravity-adaptation")
    rules = by_id(status)

    assert rules["SENS_MOTION_SICKNESS_V1"]["health_attention"] == "WATCH"
    assert rules["SANS_VISION_SYMPTOM_V1"]["health_attention"] == "WATCH"
    assert status["latest_check_in"]["back_pain"] == 3
    assert status["latest_check_in"]["congestion"] == 3


def test_check_in_without_vision_answer_does_not_create_unknown(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    body = {
        "mission_id": "m-ci",
        "crew_member_id": "crew-01",
        "fatigue": 0,
        "dizziness": 0,
        "nausea": 0,
        "pain": 0,
        "mood_distress": 0,
        "observed_at": "2026-11-14T10:00:00Z",
        "source_type": "MANUAL",
        "source_id": "dashboard-user",
    }
    assert client.post("/v1/check-ins", json=body).status_code == 201

    status = client.get("/v1/crew/crew-01/status", params={"mission_id": "m-ci"}).json()
    rules = by_id(status)

    assert rules["SENS_MOTION_SICKNESS_V1"]["health_attention"] == "NORMAL"
    assert "SANS_VISION_SYMPTOM_V1" not in rules
    assert "BEHAV_SLEEP_V1" not in rules
    assert status["overall_attention"] == "NORMAL"


@pytest.mark.parametrize("field", ["vision_change", "back_pain", "congestion"])
def test_new_symptom_fields_are_validated(
    api_client: tuple[TestClient, Engine], field: str
) -> None:
    client, _ = api_client
    body = {
        "mission_id": "m-ci",
        "crew_member_id": "crew-01",
        "fatigue": 0,
        "dizziness": 0,
        "nausea": 0,
        "pain": 0,
        "mood_distress": 0,
        "observed_at": "2026-11-14T10:00:00Z",
        "source_type": "MANUAL",
        "source_id": "dashboard-user",
        field: 5,
    }

    assert client.post("/v1/check-ins", json=body).status_code == 422


def test_risk_coverage_map(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    coverage = client.get("/v1/risk-coverage").json()

    assert len(coverage["hazards"]) == 6
    summary = coverage["summary"]
    assert sum(summary.values()) == sum(len(h.risks) for h in HAZARDS)
    assert summary["RULE"] >= 10 and summary["GAP"] >= 1
    for hazard in coverage["hazards"]:
        for risk in hazard["risks"]:
            for rule in risk["rules"]:
                assert rule["rule_id"] in RULES
            if risk["coverage"] == "RULE":
                assert risk["rules"]
    co2 = next(
        risk
        for hazard in coverage["hazards"]
        for risk in hazard["risks"]
        if risk["key"] == "cabin_co2"
    )
    assert co2["rules"][0]["validation_status"] == "APPROVED"
