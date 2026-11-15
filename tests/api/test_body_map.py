from fastapi.testclient import TestClient
from sqlalchemy import Engine

from spaceapp_logar.rules.body_map import METRIC_REGIONS, REGION_KEYS, RULE_REGIONS
from spaceapp_logar.rules.catalog import RULES
from spaceapp_logar.schemas.measurements import Metric

EXPECTED_ORDER = [
    "head",
    "eyes",
    "inner_ear",
    "heart",
    "lungs",
    "torso",
    "musculoskeletal",
    "skin",
    "cabin",
]


def run(client: TestClient, scenario_id: str) -> dict:
    response = client.post(f"/v1/demo/scenarios/{scenario_id}/run")
    assert response.status_code == 201, response.text
    return response.json()


def body_map(client: TestClient, result: dict) -> dict:
    response = client.get(
        f"/v1/crew/{result['crew_member_id']}/body-map",
        params={
            "mission_id": result["mission_id"],
            "environment_target_id": result["environment_target_id"],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_every_rule_and_metric_is_mapped() -> None:
    assert set(RULES) <= set(RULE_REGIONS), "rule added without body-map mapping"
    assert {m.value for m in Metric} <= set(METRIC_REGIONS)
    assert "HRV_RMSSD" in METRIC_REGIONS
    for regions in (*RULE_REGIONS.values(), *METRIC_REGIONS.values()):
        assert regions and set(regions) <= set(REGION_KEYS)
    assert list(REGION_KEYS) == EXPECTED_ORDER


def test_response_has_all_regions_in_order(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    data = body_map(client, run(client, "co2-headache"))

    assert [r["region"] for r in data["regions"]] == EXPECTED_ORDER
    by_region = {r["region"]: r for r in data["regions"]}
    assert by_region["musculoskeletal"]["attention"] == "UNKNOWN"
    assert by_region["musculoskeletal"]["coverage"] == "GAP"
    assert by_region["heart"]["coverage"] == "RULE"
    assert all(r["label_tr"] and r["description_tr"] for r in data["regions"])
    heart_metrics = {v["metric"] for v in by_region["heart"]["latest_values"]}
    assert "HEART_RATE" in heart_metrics
    cabin_metrics = {v["metric"] for v in by_region["cabin"]["latest_values"]}
    assert "CABIN_CO2_PARTIAL_PRESSURE" in cabin_metrics


def test_worst_attention_and_alerts_linked(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    result = run(client, "co2-headache")
    data = body_map(client, result)
    by_region = {r["region"]: r for r in data["regions"]}
    alerts = client.get(
        "/v1/alerts", params={"mission_id": result["mission_id"]}
    ).json()
    co2_alert = next(a for a in alerts if a["rule_id"] == "ENV_CO2_NOMINAL_V1")

    assert data["overall_attention"] == "WATCH"
    assert by_region["cabin"]["attention"] == "WATCH"
    assert by_region["head"]["attention"] == "WATCH"
    assert co2_alert["id"] in by_region["cabin"]["open_alert_ids"]
    assert co2_alert["id"] in by_region["head"]["open_alert_ids"]
    assert by_region["heart"]["open_alert_ids"] == []
    assert by_region["lungs"]["attention"] == "NORMAL"


def test_red_flag_marks_torso_and_head(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    result = run(client, "chest-pain-red-flag")
    data = body_map(client, result)
    by_region = {r["region"]: r for r in data["regions"]}

    assert data["overall_attention"] == "CRITICAL"
    assert by_region["torso"]["attention"] == "CRITICAL"
    assert by_region["head"]["attention"] == "CRITICAL"
    assert by_region["torso"]["open_alert_ids"]
    assert set(by_region["torso"]["open_alert_ids"]) <= set(
        by_region["head"]["open_alert_ids"]
    )


def test_mission_id_is_required(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    assert client.get("/v1/crew/crew-1/body-map").status_code == 422
