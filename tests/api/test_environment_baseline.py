from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

MISSION = "m-baseline"
CREW = "crew-01"
T0 = datetime(2026, 11, 10, 8, 0, tzinfo=timezone.utc)


def iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


def post_hr(client: TestClient, minute: int, value: float, *, quality: str = "VALID",
            activity: str = "REST") -> None:
    response = client.post(
        "/v1/measurements",
        json={
            "mission_id": MISSION,
            "target_type": "CREW_MEMBER",
            "target_id": CREW,
            "metric": "HEART_RATE",
            "value": value,
            "unit": "bpm",
            "observed_at": iso(T0 + timedelta(minutes=minute)),
            "source_type": "SYNTHETIC",
            "source_id": "sim",
            "scenario_id": "baseline-test",
            "reported_quality": quality,
            "activity_state": activity,
        },
    )
    assert response.status_code == 201, response.text


def context(client: TestClient, location: str, at: datetime, **extra) -> dict:
    body = {
        "mission_id": MISSION,
        "location": location,
        "gravity_g": {"ISS": 0.0, "LUNAR_HABITAT": 0.166, "MARS_HABITAT": 0.38}.get(location, 1.0),
        "communication_delay_seconds": 1.3,
        "expected_metrics": ["HEART_RATE", "SPO2"],
        "sensor_set": ["wearable-01"],
        "effective_at": iso(at),
    }
    body.update(extra)
    return client.post("/v1/environment-contexts", json=body)


def baseline(client: TestClient, before: datetime, activity: str | None = "REST") -> dict:
    params = {
        "mission_id": MISSION,
        "target_id": CREW,
        "metric": "HEART_RATE",
        "before": iso(before),
    }
    if activity:
        params["activity_state"] = activity
    response = client.get("/v1/baselines", params=params)
    assert response.status_code == 200, response.text
    return response.json()


# --- Environment context --------------------------------------------------------
def test_environment_context_and_mission_day(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    created = context(client, "ISS", T0)
    later = context(client, "LUNAR_HABITAT", T0 + timedelta(days=3))
    current = client.get(
        "/v1/environment-contexts/current",
        params={"mission_id": MISSION, "at": iso(T0 + timedelta(days=4, hours=1))},
    ).json()
    listed = client.get("/v1/environment-contexts", params={"mission_id": MISSION}).json()

    assert created.status_code == 201 and later.status_code == 201
    assert current["context"]["location"] == "LUNAR_HABITAT"
    assert current["mission_day"] == 5
    assert [item["location"] for item in listed] == ["ISS", "LUNAR_HABITAT"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"location": "EVA"},  # EVA requires an eva_state
        {"gravity_g": 4.0},
        {"expected_metrics": ["HEART_RATE", "HEART_RATE"]},
        {"location": "JUPITER"},
        {"effective_at": "2026-11-10T08:00:00"},
        {"communication_delay_seconds": -1},
    ],
)
def test_invalid_environment_contexts_are_rejected(
    api_client: tuple[TestClient, Engine], overrides: dict
) -> None:
    client, _ = api_client
    body = {"location": "ISS", **overrides}
    location = body.pop("location")

    assert context(client, location, T0, **body).status_code == 422


def test_eva_context_with_state_is_accepted(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    assert context(client, "EVA", T0, eva_state="ACTIVE").status_code == 201


# --- Baseline ------------------------------------------------------------------
def test_too_little_data_is_estimated_research(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    for minute in range(10):
        post_hr(client, minute, 70)

    result = baseline(client, T0 + timedelta(hours=1))

    assert result["is_sufficient"] is False
    assert result["classification"] == "ESTIMATED_RESEARCH"
    assert result["status_label"] == "tahmini/araştırma"
    assert result["sample_count"] == 10
    assert result["min_samples_required"] == 30
    assert "veri yetersiz" in result["limitation_note"]


def test_enough_rest_data_is_established_with_percentiles(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    for minute in range(40):
        post_hr(client, minute, 60 + (minute % 10))
    for minute in range(40, 50):
        post_hr(client, minute, 130, activity="EXERCISE")

    result = baseline(client, T0 + timedelta(hours=2))

    assert result["classification"] == "ESTABLISHED"
    assert result["status_label"] == "kişisel_kararlı"
    assert result["sample_count"] == 40  # exercise samples are not REST context
    assert result["p10"] <= result["p25"] <= result["median"] <= result["p75"] <= result["p90"]
    assert result["median"] == pytest.approx(64.5)


def test_faulty_data_and_symptomatic_periods_are_excluded(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    for minute in range(30):
        post_hr(client, minute, 65)
    for minute in range(30, 35):
        post_hr(client, minute, 66, quality="FAULT")
    check_in = client.post(
        "/v1/check-ins",
        json={
            "mission_id": MISSION,
            "crew_member_id": CREW,
            "fatigue": 3,
            "dizziness": 0,
            "nausea": 0,
            "pain": 0,
            "mood_distress": 0,
            "observed_at": iso(T0 + timedelta(minutes=35)),
            "source_type": "MANUAL",
            "source_id": "crew",
        },
    )
    assert check_in.status_code == 201
    for minute in range(36, 60):
        post_hr(client, minute, 100)  # unwell period: must not become "normal"

    result = baseline(client, T0 + timedelta(hours=2))

    assert result["sample_count"] == 30
    assert result["median"] == pytest.approx(65)
    assert result["excluded_count"] == 5 + 24
    assert "geçersiz" in result["limitation_note"]
    assert "belirtili öznel kayıt" in result["limitation_note"]


def test_red_flag_alert_period_is_excluded(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    for minute in range(30):
        post_hr(client, minute, 68)
    flag = client.post(
        "/v1/red-flags",
        json={
            "mission_id": MISSION,
            "crew_member_id": CREW,
            "flags": ["CHEST_PAIN"],
            "observed_at": iso(T0 + timedelta(minutes=30)),
            "source_type": "MANUAL",
            "source_id": "crew",
        },
    )
    assert flag.status_code == 201
    for minute in range(31, 45):
        post_hr(client, minute, 110)

    result = baseline(client, T0 + timedelta(hours=1))

    assert result["median"] == pytest.approx(68)
    assert "aktif alarm" in result["limitation_note"]


def test_new_environment_starts_a_new_profile(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    context(client, "ISS", T0 - timedelta(days=1))
    for minute in range(40):
        post_hr(client, minute, 60)
    context(client, "LUNAR_HABITAT", T0 + timedelta(minutes=40))
    for minute in range(41, 51):
        post_hr(client, minute, 75)

    iss = baseline(client, T0 + timedelta(minutes=39))
    moon = baseline(client, T0 + timedelta(hours=1))

    assert iss["environment_location"] == "ISS"
    assert iss["classification"] == "ESTABLISHED"
    assert iss["median"] == pytest.approx(60)
    assert moon["environment_location"] == "LUNAR_HABITAT"
    assert moon["sample_count"] == 10
    assert moon["classification"] == "ESTIMATED_RESEARCH"
    assert moon["median"] == pytest.approx(75)
    assert "Ay/Mars için nüfus normali yoktur" in moon["limitation_note"]


def test_snapshot_rollback_and_release(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    for minute in range(30):
        post_hr(client, minute, 60)

    def snapshot(reason: str, before: datetime) -> dict:
        response = client.post(
            "/v1/baseline-profiles",
            json={
                "mission_id": MISSION,
                "target_id": CREW,
                "metric": "HEART_RATE",
                "activity_state": "REST",
                "before": iso(before),
                "created_by": "crew-medic",
                "reason": reason,
            },
        )
        assert response.status_code == 201, response.text
        return response.json()

    v1 = snapshot("ilk stabil dönem", T0 + timedelta(minutes=30))
    for minute in range(30, 60):
        post_hr(client, minute, 64)
    v2 = snapshot("adaptasyon sonrası", T0 + timedelta(minutes=60))
    now = T0 + timedelta(hours=2)

    assert (v1["version"], v2["version"]) == (1, 2)
    assert baseline(client, now)["profile_version"] == 2

    rollback = client.post(
        f"/v1/baseline-profiles/{v1['id']}/activate",
        json={"activated_by": "crew-medic", "reason": "v2 hatalı veri içeriyor"},
    )
    pinned = baseline(client, now)
    assert rollback.status_code == 200
    assert pinned["profile_version"] == 1
    assert pinned["median"] == pytest.approx(60)
    assert "Sabitlenmiş profil sürümü v1" in pinned["limitation_note"]

    released = client.post(
        f"/v1/baseline-profiles/{v1['id']}/release",
        json={"activated_by": "crew-medic", "reason": "otomatik hesaba dön"},
    )
    automatic = baseline(client, now)
    assert released.status_code == 204
    assert automatic["profile_version"] == 0
    versions = client.get(
        "/v1/baseline-profiles",
        params={"mission_id": MISSION, "target_id": CREW, "metric": "HEART_RATE"},
    ).json()
    assert [item["version"] for item in versions] == [1, 2]


def test_rule_status_shows_which_baseline_was_used(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    run = client.post("/v1/demo/scenarios/fever-trend/run").json()
    status = client.get(
        f"/v1/crew/{run['crew_member_id']}/status",
        params={
            "mission_id": run["mission_id"],
            "environment_target_id": run["environment_target_id"],
        },
    ).json()
    rules = {rule["rule_id"]: rule for rule in status["rules"]}

    temp = rules["VITAL_TEMP_TREND_V1"]["baseline"]
    assert temp["classification"] == "ESTABLISHED"
    assert temp["status_label"] == "kişisel_kararlı"
    assert temp["value"] == pytest.approx(36.7, abs=0.1)
    assert rules["MULTI_CARDIO_RESP_V1"]["baseline"]["sample_count"] >= 30
    assert rules["ENV_RADIATION_V1"]["baseline"]["classification"] == "ESTABLISHED"
    assert rules["ENV_CO2_NOMINAL_V1"]["baseline"] is None

    environment = client.get(
        "/v1/environment-contexts/current",
        params={"mission_id": run["mission_id"]},
    ).json()
    assert environment["context"]["location"] == "ISS"
    assert environment["mission_day"] == 4
