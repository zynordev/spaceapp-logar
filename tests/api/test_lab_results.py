from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

MISSION = "demo-iss-01"
CREW = "crew-01"


def lab_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "mission_id": MISSION,
        "crew_member_id": CREW,
        "analyte": "GLUCOSE",
        "value": 90.0,
        "unit": "mg/dL",
        "reference_low": 70.0,
        "reference_high": 99.0,
        "phase": "PRE_FLIGHT",
        "sampled_at": "2026-10-01T08:00:00Z",
        "source_type": "SYNTHETIC",
        "source_id": "lab-simulator-01",
        "scenario_id": "lab-test",
    }
    payload.update(overrides)
    return payload


def post_lab(client: TestClient, **overrides: object):
    return client.post("/v1/lab-results", json=lab_payload(**overrides))


def get_panel(client: TestClient, crew: str = CREW, mission: str = MISSION):
    return client.get(
        f"/v1/crew/{crew}/lab-results",
        params={"mission_id": mission},
    )


def test_valid_lab_result_is_stored_and_returned(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    response = post_lab(client)

    assert response.status_code == 201
    body = response.json()
    assert body["analyte"] == "GLUCOSE"
    assert body["value"] == 90.0
    assert body["reference_low"] == 70.0
    assert body["id"]
    assert body["ingested_at"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"analyte": "HEMOGLOBIN", "unit": "mmol/L"},
        {"analyte": "HEMOGLOBIN", "unit": "%"},
        {"analyte": "ALT", "unit": "mg/dL"},
        {"reference_low": 100.0, "reference_high": 70.0},
        {"value": -1.0},
        {"source_type": "SYNTHETIC", "scenario_id": None},
        {"source_type": "MANUAL", "scenario_id": "lab-test"},
        {"source_type": "OSDR", "source_id": "569", "scenario_id": None},
        {"sampled_at": "2026-10-01T08:00:00"},
        {"analyte": "VITAMIN_D"},
        {"phase": "DURING_LUNCH"},
        {"mission_id": "bad id!"},
        {"unexpected": "field"},
    ],
)
def test_invalid_lab_results_are_rejected(
    api_client: tuple[TestClient, Engine],
    overrides: dict[str, object],
) -> None:
    client, _ = api_client

    response = post_lab(client, **overrides)

    assert response.status_code == 422


def test_osdr_result_needs_a_dataset_id(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    response = post_lab(
        client,
        source_type="OSDR",
        source_id="OSD-569",
        scenario_id=None,
    )

    assert response.status_code == 201


def test_empty_panel_has_no_results_but_states_limitations(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    response = get_panel(client)

    assert response.status_code == 200
    body = response.json()
    assert body["results"] == []
    assert len(body["limitations"]) == 2


def test_panel_shows_latest_value_with_previous_and_baseline_changes(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_lab(client, value=90.0, phase="PRE_FLIGHT", sampled_at="2026-10-01T08:00:00Z")
    post_lab(client, value=105.0, phase="IN_FLIGHT", sampled_at="2026-10-20T08:00:00Z")
    post_lab(client, value=98.0, phase="POST_FLIGHT", sampled_at="2026-11-10T08:00:00Z")

    results = get_panel(client).json()["results"]

    assert len(results) == 1
    glucose = results[0]
    assert glucose["analyte"] == "GLUCOSE"
    assert glucose["value"] == 98.0
    assert glucose["position_vs_reference"] == "WITHIN"
    assert glucose["previous_value"] == 105.0
    assert glucose["change_from_previous"] == pytest.approx(-7.0)
    assert glucose["baseline_value"] == 90.0
    assert glucose["change_from_baseline"] == pytest.approx(8.0)


def test_panel_orders_by_sample_time_not_arrival_order(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_lab(client, value=98.0, phase="POST_FLIGHT", sampled_at="2026-11-10T08:00:00Z")
    post_lab(client, value=90.0, phase="PRE_FLIGHT", sampled_at="2026-10-01T08:00:00Z")

    glucose = get_panel(client).json()["results"][0]

    assert glucose["value"] == 98.0
    assert glucose["previous_value"] == 90.0


def test_reference_position_reports_below_within_and_above(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_lab(client, analyte="GLUCOSE", value=60.0)
    post_lab(client, analyte="SODIUM", value=140.0, unit="mmol/L",
             reference_low=135.0, reference_high=145.0)
    post_lab(client, analyte="POTASSIUM", value=5.4, unit="mmol/L",
             reference_low=3.5, reference_high=5.1)

    positions = {
        item["analyte"]: item["position_vs_reference"]
        for item in get_panel(client).json()["results"]
    }

    assert positions == {
        "GLUCOSE": "BELOW",
        "SODIUM": "WITHIN",
        "POTASSIUM": "ABOVE",
    }


def test_values_exactly_on_the_reference_limits_are_within(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_lab(client, analyte="GLUCOSE", value=70.0)
    post_lab(client, analyte="ALT", value=99.0, unit="U/L")

    positions = {
        item["analyte"]: item["position_vs_reference"]
        for item in get_panel(client).json()["results"]
    }

    assert positions["GLUCOSE"] == "WITHIN"
    assert positions["ALT"] == "WITHIN"


def test_unit_change_never_produces_a_misleading_difference(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_lab(client, value=90.0, unit="mg/dL", sampled_at="2026-10-01T08:00:00Z")
    post_lab(
        client,
        value=5.4,
        unit="mmol/L",
        reference_low=3.9,
        reference_high=5.5,
        phase="IN_FLIGHT",
        sampled_at="2026-10-20T08:00:00Z",
    )

    glucose = get_panel(client).json()["results"][0]

    assert glucose["unit"] == "mmol/L"
    assert glucose["previous_value"] is None
    assert glucose["change_from_previous"] is None
    assert glucose["baseline_value"] is None
    assert glucose["change_from_baseline"] is None


def test_single_result_has_no_change_context(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_lab(client)

    glucose = get_panel(client).json()["results"][0]

    assert glucose["previous_value"] is None
    assert glucose["baseline_value"] is None


def test_panel_is_limited_to_the_requested_crew_and_mission(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_lab(client)
    post_lab(client, crew_member_id="crew-02", value=120.0)
    post_lab(client, mission_id="other-mission", value=130.0)

    own = get_panel(client).json()["results"]
    other_crew = get_panel(client, crew="crew-02").json()["results"]
    other_mission = get_panel(client, mission="other-mission").json()["results"]

    assert [item["value"] for item in own] == [90.0]
    assert [item["value"] for item in other_crew] == [120.0]
    assert [item["value"] for item in other_mission] == [130.0]


def test_panel_lists_analytes_in_a_stable_order(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    post_lab(client, analyte="AST", value=25.0, unit="U/L")
    post_lab(client, analyte="GLUCOSE")
    post_lab(client, analyte="HEMOGLOBIN", value=14.0, unit="g/dL",
             reference_low=12.0, reference_high=17.0)

    order = [item["analyte"] for item in get_panel(client).json()["results"]]

    assert order == ["GLUCOSE", "HEMOGLOBIN", "AST"]


def test_panel_requires_a_mission(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    assert client.get(f"/v1/crew/{CREW}/lab-results").status_code == 422
