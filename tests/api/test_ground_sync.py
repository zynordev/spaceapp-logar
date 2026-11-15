"""Ground sync packets, acknowledgements and automatic escalation.

Secrets and passcodes are fake values set per test with monkeypatch.
"""

import hashlib
import hmac
import json

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

MISSION = "m-sync"
CREW = "crew-01"
FAKE_SECRET = "test-only-secret"
FAKE_USERS = f"{CREW}:ASTRONAUT:crew-pass,ground-01:GROUND:ground-pass"


def red_flag(client: TestClient, at: str = "2026-11-14T10:00:00Z", mission: str = MISSION):
    return client.post(
        "/v1/red-flags",
        json={
            "mission_id": mission,
            "crew_member_id": CREW,
            "flags": ["CHEST_PAIN"],
            "observed_at": at,
            "source_type": "MANUAL",
            "source_id": "dashboard-user",
        },
    )


def packet(client: TestClient, recipient: str, mission: str = MISSION, **params):
    response = client.get(
        "/v1/sync/packet", params={"mission_id": mission, "recipient": recipient, **params}
    )
    assert response.status_code == 200, response.text
    return response.json()


def ack_body(pkt: dict, **override):
    body = {
        "mission_id": pkt["mission_id"],
        "recipient": pkt["recipient"],
        "packet_id": pkt["packet_id"],
        "sha256": pkt["sha256"],
        "until": pkt["until"],
    }
    body.update(override)
    return body


def kinds(pkt: dict) -> set[str]:
    return {item["kind"] for item in pkt["items"]}


def run_scenario(client: TestClient, scenario_id: str) -> str:
    run = client.post(f"/v1/demo/scenarios/{scenario_id}/run").json()
    return run["mission_id"]


def test_routing_per_recipient(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    mission = run_scenario(client, "cabin-o2-drop")

    life = packet(client, "LIFE_SUPPORT", mission)
    radiation = packet(client, "RADIATION", mission)
    surgeon = packet(client, "FLIGHT_SURGEON", mission)
    control = packet(client, "MISSION_CONTROL", mission)

    life_rules = {i["data"]["rule_id"] for i in life["items"] if i["kind"] in ("ALERT", "RULE_EVALUATION")}
    assert life_rules == {"ENV_CABIN_ATMOSPHERE_V1"} or life_rules <= {
        "ENV_CABIN_ATMOSPHERE_V1",
        "ENV_CO2_NOMINAL_V1",
    }
    assert "ALERT" in kinds(life)
    assert "ESCALATION" not in kinds(life)
    assert "TREND" in kinds(life)
    assert all(
        i["data"]["metric"].startswith("CABIN")
        for i in life["items"]
        if i["kind"] == "TREND"
    )
    assert "ALERT" not in kinds(radiation)
    assert all(
        i["data"]["rule_id"] == "ENV_RADIATION_V1"
        for i in radiation["items"]
        if i["kind"] == "RULE_EVALUATION"
    )
    assert all(
        i["data"]["metric"] == "RADIATION_DOSE_RATE"
        for i in radiation["items"]
        if i["kind"] == "TREND"
    )

    surgeon_rules = {i["data"]["rule_id"] for i in surgeon["items"] if i["kind"] == "RULE_EVALUATION"}
    assert surgeon_rules and not surgeon_rules & {"ENV_CABIN_ATMOSPHERE_V1", "ENV_RADIATION_V1"}
    assert "ESCALATION" in kinds(surgeon)

    assert kinds(control) == {"ALERT", "ESCALATION"}
    assert len([i for i in control["items"] if i["kind"] == "ALERT"]) >= 2


def test_radiation_goes_to_radiation_team(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    mission = run_scenario(client, "radiation-spe")

    radiation = packet(client, "RADIATION", mission)
    life = packet(client, "LIFE_SUPPORT", mission)

    assert {"ALERT", "RULE_EVALUATION"} <= kinds(radiation)
    assert all(
        i["data"]["rule_id"] == "ENV_RADIATION_V1"
        for i in radiation["items"]
        if i["kind"] in ("ALERT", "RULE_EVALUATION")
    )
    assert "ALERT" not in kinds(life)


def test_surgeon_packet_has_red_flag_and_hash_is_stable_without_signature(
    api_client: tuple[TestClient, Engine], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("SPACEAPP_AUTH_SECRET", raising=False)
    client, _ = api_client
    red_flag(client)

    first = packet(client, "FLIGHT_SURGEON")
    second = packet(client, "FLIGHT_SURGEON")

    assert {"RED_FLAG", "ALERT", "ESCALATION", "RULE_EVALUATION"} <= kinds(first)
    assert first["sha256"] == second["sha256"]
    assert first["packet_id"] == second["packet_id"]
    assert first["signature"] is None and first["signature_alg"] is None
    body = {k: v for k, v in first.items() if k not in ("sha256", "signature", "signature_alg")}
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    assert hashlib.sha256(canonical.encode()).hexdigest() == first["sha256"]


def test_signature_present_only_with_secret(
    api_client: tuple[TestClient, Engine], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    red_flag(client)
    monkeypatch.setenv("SPACEAPP_AUTH_SECRET", FAKE_SECRET)

    signed = packet(client, "FLIGHT_SURGEON")

    body = {k: v for k, v in signed.items() if k not in ("sha256", "signature", "signature_alg")}
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    expected = hmac.new(FAKE_SECRET.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    assert signed["signature"] == expected
    assert signed["signature_alg"] == "HMAC-SHA256"


def test_ack_advances_cursor(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    red_flag(client, "2026-11-14T10:00:00Z")
    first = packet(client, "FLIGHT_SURGEON")
    assert first["item_count"] > 0

    response = client.post("/v1/sync/ack", json=ack_body(first))
    assert response.status_code == 200
    assert response.json()["acked_by"] == "demo-anonymous"
    assert packet(client, "FLIGHT_SURGEON")["items"] == []
    # Other recipients keep their own cursor.
    assert packet(client, "MISSION_CONTROL")["item_count"] > 0

    # A second packet only holds what is new since the ack.
    red_flag(client, "2026-11-14T11:00:00Z")
    second = packet(client, "FLIGHT_SURGEON")
    first_ids = {item["id"] for item in first["items"]}
    assert second["items"] and not first_ids & {i["id"] for i in second["items"]}
    assert second["since"] == first["until"]

    # Re-acknowledging the same packet is idempotent.
    again = client.post("/v1/sync/ack", json=ack_body(first))
    assert again.status_code == 200
    assert again.json()["id"] == response.json()["id"]


def test_limit_pages_oldest_first(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    red_flag(client)

    page = packet(client, "FLIGHT_SURGEON", limit=1)
    assert len([i for i in page["items"] if i["kind"] != "TREND"]) >= 1
    assert client.post("/v1/sync/ack", json=ack_body(page)).status_code == 200

    seen = {i["id"] for i in page["items"]}
    for _ in range(10):
        nxt = packet(client, "FLIGHT_SURGEON", limit=1)
        if not nxt["items"]:
            break
        assert not seen & {i["id"] for i in nxt["items"]}
        seen |= {i["id"] for i in nxt["items"]}
        assert client.post("/v1/sync/ack", json=ack_body(nxt)).status_code == 200
    else:
        pytest.fail("paging did not finish")
    assert any(i for i in seen)


def test_ack_with_wrong_hash_is_conflict(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    red_flag(client)
    pkt = packet(client, "FLIGHT_SURGEON")

    response = client.post("/v1/sync/ack", json=ack_body(pkt, sha256="0" * 64))

    assert response.status_code == 409
    assert packet(client, "FLIGHT_SURGEON")["item_count"] == pkt["item_count"]


def test_surgeon_ack_marks_escalations_acked(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    red_flag(client)
    pending = client.get("/v1/sync/escalations", params={"mission_id": MISSION, "status": "PENDING"})
    assert len(pending.json()) == 1
    status = client.get("/v1/sync/status", params={"mission_id": MISSION}).json()
    assert status["pending_escalations"] == 1
    assert [r["recipient"] for r in status["recipients"]] == [
        "FLIGHT_SURGEON", "LIFE_SUPPORT", "RADIATION", "MISSION_CONTROL"
    ]

    # Mission control ack does not acknowledge the escalation.
    control = packet(client, "MISSION_CONTROL")
    assert client.post("/v1/sync/ack", json=ack_body(control)).status_code == 200
    assert len(client.get("/v1/sync/escalations", params={"mission_id": MISSION, "status": "PENDING"}).json()) == 1

    surgeon = packet(client, "FLIGHT_SURGEON")
    assert client.post("/v1/sync/ack", json=ack_body(surgeon)).status_code == 200

    done = client.get("/v1/sync/escalations", params={"mission_id": MISSION, "status": "ACKED"}).json()
    assert len(done) == 1 and done[0]["acked_at"] is not None
    assert client.get("/v1/sync/status", params={"mission_id": MISSION}).json()["pending_escalations"] == 0


def test_link_delay_from_environment(
    api_client: tuple[TestClient, Engine], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    assert client.get("/v1/sync/status", params={"mission_id": MISSION}).json()["link_delay_seconds"] is None
    monkeypatch.setenv("SPACEAPP_LINK_DELAY_SECONDS", "720")
    assert client.get("/v1/sync/status", params={"mission_id": MISSION}).json()["link_delay_seconds"] == 720


def test_ack_requires_ground_role_when_auth_configured(
    api_client: tuple[TestClient, Engine], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SPACEAPP_AUTH_SECRET", FAKE_SECRET)
    monkeypatch.setenv("SPACEAPP_AUTH_USERS", FAKE_USERS)
    monkeypatch.setenv("SPACEAPP_AUTH_REQUIRED", "true")
    client, _ = api_client

    def token(user: str, passcode: str) -> dict[str, str]:
        access = client.post("/v1/auth/token", json={"user_id": user, "passcode": passcode}).json()
        return {"Authorization": f"Bearer {access['access_token']}"}

    crew, ground = token(CREW, "crew-pass"), token("ground-01", "ground-pass")
    red_flag_response = client.post(
        "/v1/red-flags",
        json={
            "mission_id": MISSION, "crew_member_id": CREW, "flags": ["CHEST_PAIN"],
            "observed_at": "2026-11-14T10:00:00Z", "source_type": "MANUAL", "source_id": "x",
        },
        headers=crew,
    )
    assert red_flag_response.status_code == 201
    pkt = client.get(
        "/v1/sync/packet",
        params={"mission_id": MISSION, "recipient": "FLIGHT_SURGEON"},
        headers=crew,
    ).json()
    assert pkt["signature"] is not None

    assert client.post("/v1/sync/ack", json=ack_body(pkt)).status_code == 401
    assert client.post("/v1/sync/ack", json=ack_body(pkt), headers=crew).status_code == 403
    done = client.post("/v1/sync/ack", json=ack_body(pkt), headers=ground)
    assert done.status_code == 200
    assert done.json()["acked_by"] == "ground-01"


def test_red_flag_creates_one_critical_escalation(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    red_flag(client)
    red_flag(client, "2026-11-14T10:05:00Z")  # same active alert: no second escalation

    [esc] = client.get("/v1/sync/escalations", params={"mission_id": MISSION}).json()
    assert esc["priority"] == "CRITICAL"
    assert esc["status"] == "PENDING"
    assert esc["crew_member_id"] == CREW
    assert "tanı değildir" in esc["summary_tr"]
    assert len(esc["packet_sha256"]) == 64
    alerts = client.get("/v1/alerts", params={"mission_id": MISSION}).json()
    assert esc["alert_id"] == alerts[0]["id"]


def test_alert_level_scenario_escalates_and_repeat_is_idempotent(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    mission = run_scenario(client, "radiation-spe")

    escalations = client.get("/v1/sync/escalations", params={"mission_id": mission}).json()
    assert escalations and {e["priority"] for e in escalations} <= {"ALERT", "CRITICAL"}
    alerts = client.get("/v1/alerts", params={"mission_id": mission}).json()
    assert {e["alert_id"] for e in escalations} <= {a["id"] for a in alerts}
    assert len({e["alert_id"] for e in escalations}) == len(escalations)

    run_scenario(client, "radiation-spe")  # fresh mission; the first stays untouched
    again = client.get("/v1/sync/escalations", params={"mission_id": mission}).json()
    assert [e["id"] for e in again] == [e["id"] for e in escalations]


def test_watch_alert_does_not_escalate(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    mission = "demo-watch"
    for minute in range(60):
        response = client.post(
            "/v1/observations",
            json={
                "mission_id": mission,
                "target_type": "ENVIRONMENT",
                "target_id": "iss-destiny-lab",
                "metric": "CABIN_CO2_PARTIAL_PRESSURE",
                "value": 3.4,
                "unit": "mmHg",
                "observed_at": f"2026-11-14T08:{minute:02d}:00Z",
                "source_type": "SYNTHETIC",
                "source_id": "co2-simulator-01",
                "scenario_id": "sync-watch-test",
                "reported_quality": "VALID",
            },
        )
        assert response.status_code == 201

    alerts = client.get("/v1/alerts", params={"mission_id": mission}).json()
    assert [a["health_attention"] for a in alerts] == ["WATCH"]
    assert client.get("/v1/sync/escalations", params={"mission_id": mission}).json() == []
    life = packet(client, "LIFE_SUPPORT", mission)
    assert "ALERT" in kinds(life) and "TREND" in kinds(life)


def test_ack_rejects_naive_until(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    red_flag(client)
    pkt = packet(client, "FLIGHT_SURGEON")

    response = client.post("/v1/sync/ack", json=ack_body(pkt, until="2026-11-14T10:00:00"))

    assert response.status_code == 422
