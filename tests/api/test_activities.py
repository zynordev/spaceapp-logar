"""Crew activity declarations: lifecycle, current context and measurement stamping."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import Engine

MISSION = "m-activity"
CREW = "crew-01"
T0 = datetime(2026, 11, 10, 8, 0, tzinfo=timezone.utc)


def iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


def declare(client: TestClient, state: str = "EXERCISE", minutes: int = 45,
            start: datetime = T0, **extra):
    return client.post(
        "/v1/activities",
        json={
            "mission_id": MISSION,
            "crew_member_id": CREW,
            "activity_state": state,
            "planned_minutes": minutes,
            "started_at": iso(start),
            **extra,
        },
    )


def current(client: TestClient, at: datetime) -> dict:
    response = client.get(
        "/v1/activities/current",
        params={"mission_id": MISSION, "crew_member_id": CREW, "at": iso(at)},
    )
    assert response.status_code == 200, response.text
    return response.json()


def post_vital(client: TestClient, metric: str, unit: str, minute: int, value: float,
               activity: str | None = None) -> None:
    body = {
        "mission_id": MISSION,
        "target_type": "CREW_MEMBER",
        "target_id": CREW,
        "metric": metric,
        "value": value,
        "unit": unit,
        "observed_at": iso(T0 + timedelta(minutes=minute)),
        "source_type": "SYNTHETIC",
        "source_id": "sim",
        "scenario_id": "activity-test",
        "reported_quality": "VALID",
    }
    if activity:
        body["activity_state"] = activity
    response = client.post("/v1/measurements", json=body)
    assert response.status_code == 201, response.text


def points(client: TestClient, metric: str = "HEART_RATE") -> list[dict]:
    response = client.get(
        "/v1/measurements",
        params={"mission_id": MISSION, "target_id": CREW, "metric": metric, "limit": 500},
    )
    assert response.status_code == 200, response.text
    return response.json()["points"]


def test_start_returns_expected_end_and_current_is_active(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    response = declare(client)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["activity_state"] == "EXERCISE"
    assert body["ended_at"] is None
    assert body["source_type"] == "MANUAL"
    assert body["source_id"] == "dashboard-user"
    assert datetime.fromisoformat(body["expected_end_at"]) == T0 + timedelta(minutes=45)

    result = current(client, T0 + timedelta(minutes=15))
    assert result["state"] == "ACTIVE"
    assert result["activity"]["id"] == body["id"]
    assert result["remaining_seconds"] == 30 * 60
    assert result["message_tr"]


def test_current_expired_and_none(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    assert current(client, T0)["state"] == "NONE"
    declare(client)
    assert current(client, T0 - timedelta(minutes=1))["state"] == "NONE"
    expired = current(client, T0 + timedelta(minutes=46))
    assert expired["state"] == "EXPIRED"
    assert expired["activity"] is not None
    assert expired["remaining_seconds"] is None
    assert "unknown" in expired["message_tr"]


def test_end_makes_context_none_and_second_end_is_409(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    created = declare(client).json()
    ended = client.post(
        f"/v1/activities/{created['id']}/end",
        json={"ended_at": iso(T0 + timedelta(minutes=20))},
    )
    assert ended.status_code == 200, ended.text
    assert ended.json()["ended_at"] is not None
    assert current(client, T0 + timedelta(minutes=30))["state"] == "NONE"
    assert current(client, T0 + timedelta(minutes=10))["state"] == "ACTIVE"
    again = client.post(f"/v1/activities/{created['id']}/end")
    assert again.status_code == 409


def test_end_without_body_and_unknown_id(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    created = declare(client, start=datetime.now(timezone.utc) - timedelta(minutes=1)).json()
    assert client.post(f"/v1/activities/{created['id']}/end").status_code == 200
    missing = client.post("/v1/activities/00000000-0000-0000-0000-000000000000/end")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"


def test_new_declaration_closes_the_open_one(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    first = declare(client, "EXERCISE", 60).json()
    second_start = T0 + timedelta(minutes=30)
    second = declare(client, "REST", 30, start=second_start).json()
    assert second["ended_at"] is None
    assert client.post(f"/v1/activities/{first['id']}/end").status_code == 409

    result = current(client, T0 + timedelta(minutes=35))
    assert result["activity"]["id"] == second["id"]
    assert result["activity"]["activity_state"] == "REST"
    # The first one was cut at the second one's start.
    assert current(client, T0 + timedelta(minutes=29))["activity"]["id"] == first["id"]


def test_validation_errors(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    assert declare(client, minutes=4).status_code == 422
    assert declare(client, minutes=241).status_code == 422
    assert declare(client, state="RUNNING").status_code == 422
    assert declare(client, bogus=1).status_code == 422
    assert declare(client, source_type="SYNTHETIC").status_code == 422
    naive = client.post(
        "/v1/activities",
        json={"mission_id": MISSION, "crew_member_id": CREW, "activity_state": "REST",
              "planned_minutes": 10, "started_at": "2026-11-10T08:00:00"},
    )
    assert naive.status_code == 422
    no_crew = client.post(
        "/v1/activities",
        json={"mission_id": MISSION, "activity_state": "REST", "planned_minutes": 10},
    )
    assert no_crew.status_code == 422
    assert declare(client, minutes=5).status_code == 201
    assert declare(client, minutes=240, start=T0 + timedelta(hours=9)).status_code == 201


def test_declaration_stamps_crew_measurements(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    declare(client, "EXERCISE", 45)
    post_vital(client, "HEART_RATE", "bpm", -5, 70)  # before the declaration
    post_vital(client, "HEART_RATE", "bpm", 10, 150)  # covered
    post_vital(client, "HEART_RATE", "bpm", 20, 140, activity="REST")  # sensor wins
    post_vital(client, "HEART_RATE", "bpm", 50, 90)  # declaration expired

    by_value = {point["value"]: point for point in points(client)}
    assert by_value[70]["activity_state"] is None
    assert by_value[70]["activity_source"] is None
    assert by_value[150]["activity_state"] == "EXERCISE"
    assert by_value[150]["activity_source"] == "DECLARED"
    assert by_value[140]["activity_state"] == "REST"
    assert by_value[140]["activity_source"] == "SENSOR"
    assert by_value[90]["activity_state"] is None
    assert by_value[90]["activity_source"] is None


def test_ended_declaration_stops_stamping(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    created = declare(client, "SLEEP", 120).json()
    client.post(
        f"/v1/activities/{created['id']}/end", json={"ended_at": iso(T0 + timedelta(minutes=30))}
    )
    post_vital(client, "HEART_RATE", "bpm", 10, 55)
    post_vital(client, "HEART_RATE", "bpm", 40, 75)
    by_value = {point["value"]: point for point in points(client)}
    assert by_value[55]["activity_state"] == "SLEEP"
    assert by_value[75]["activity_state"] is None


def test_environment_measurements_are_never_stamped(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, engine = api_client
    declare(client, "EXERCISE", 45)
    response = client.post(
        "/v1/measurements",
        json={
            "mission_id": MISSION,
            "target_type": "ENVIRONMENT",
            "target_id": CREW,
            "metric": "CABIN_PRESSURE",
            "value": 101.0,
            "unit": "kPa",
            "observed_at": iso(T0 + timedelta(minutes=10)),
            "source_type": "SYNTHETIC",
            "source_id": "sim",
            "scenario_id": "activity-test",
            "reported_quality": "VALID",
        },
    )
    assert response.status_code == 201, response.text
    series = client.get(
        "/v1/measurements",
        params={"mission_id": MISSION, "target_id": CREW, "metric": "CABIN_PRESSURE"},
    ).json()
    assert series["points"][0]["activity_state"] is None
    assert series["points"][0]["activity_source"] is None


def cardio_rule(client: TestClient) -> dict:
    status = client.get(f"/v1/crew/{CREW}/status", params={"mission_id": MISSION}).json()
    return {rule["rule_id"]: rule for rule in status["rules"]}["MULTI_CARDIO_RESP_V1"]


def test_rest_only_rule_ignores_data_declared_as_exercise(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    declare(client, "EXERCISE", 120)
    for minute in range(0, 31):
        post_vital(client, "HEART_RATE", "bpm", minute, 150)
        post_vital(client, "RESPIRATION_RATE", "breaths/min", minute, 28)
    rule = cardio_rule(client)
    # Exercise-stamped data never reaches the REST-only rule: nothing to judge.
    assert rule["observed_value"] is None
    assert rule["health_attention"] in {"UNKNOWN", "NORMAL"}
    assert rule["health_attention"] != "ALERT"


def test_rest_only_rule_uses_data_declared_as_rest(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    declare(client, "REST", 120)
    for minute in range(0, 31):
        post_vital(client, "HEART_RATE", "bpm", minute, 60)
        post_vital(client, "RESPIRATION_RATE", "breaths/min", minute, 14)
    assert cardio_rule(client)["observed_value"] is not None


def test_crew_status_includes_current_activity(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    status = client.get(f"/v1/crew/{CREW}/status", params={"mission_id": MISSION}).json()
    assert status["current_activity"]["state"] == "NONE"
    declare(client, "LIGHT", 30, start=datetime.now(timezone.utc) - timedelta(minutes=1))
    status = client.get(f"/v1/crew/{CREW}/status", params={"mission_id": MISSION}).json()
    assert status["current_activity"]["state"] == "ACTIVE"
    assert status["current_activity"]["activity"]["activity_state"] == "LIGHT"
