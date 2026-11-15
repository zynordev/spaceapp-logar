"""Mission profiles: delay context and who answers inside a card's window.

Secrets and passcodes are fake values set per test with monkeypatch.
"""

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

MISSION = "m-profile"


def profile_url(mission: str = MISSION) -> str:
    return f"/v1/missions/{mission}/profile"


def test_default_profile_is_iss(api_client: tuple[TestClient, Engine], monkeypatch) -> None:
    client, _ = api_client
    monkeypatch.delenv("SPACEAPP_DEFAULT_PROFILE", raising=False)

    body = client.get(profile_url()).json()
    assert body["profile"] == "ISS"
    assert body["one_way_delay_seconds"] == {"min": 0, "typical": 1, "max": 2}
    assert body["round_trip_typical_seconds"] == 2
    assert body["escalation_owner"] == "FLIGHT_SURGEON"
    assert "NASA" in body["source_note_tr"]


def test_default_profile_from_environment(
    api_client: tuple[TestClient, Engine], monkeypatch
) -> None:
    client, _ = api_client
    monkeypatch.setenv("SPACEAPP_DEFAULT_PROFILE", "mars")
    assert client.get(profile_url()).json()["profile"] == "MARS"
    monkeypatch.setenv("SPACEAPP_DEFAULT_PROFILE", "bogus")
    assert client.get(profile_url()).json()["profile"] == "ISS"


def test_set_profile_and_values(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    moon = client.post(profile_url(), json={"profile": "MOON"}).json()
    assert moon["one_way_delay_seconds"] == {"min": 1.2, "typical": 1.3, "max": 1.4}
    mars = client.post(profile_url(), json={"profile": "MARS"}).json()
    assert mars["one_way_delay_seconds"] == {"min": 182, "typical": 750, "max": 1342}
    assert mars["round_trip_typical_seconds"] == 1500
    assert client.get(profile_url()).json()["profile"] == "MARS"
    # Other missions are unaffected.
    assert client.get(profile_url("m-other")).json()["profile"] == "ISS"
    assert client.post(profile_url(), json={"profile": "VENUS"}).status_code == 422


def test_profile_write_requires_medic_or_ground_with_token(
    api_client: tuple[TestClient, Engine], monkeypatch
) -> None:
    client, _ = api_client
    monkeypatch.setenv("SPACEAPP_AUTH_SECRET", "test-only-secret")
    monkeypatch.setenv(
        "SPACEAPP_AUTH_USERS",
        "crew-01:ASTRONAUT:crew-pass,medic-01:CREW_MEDICAL_OFFICER:medic-pass,"
        "ground-01:GROUND:ground-pass",
    )

    def token(user: str, passcode: str) -> dict[str, str]:
        response = client.post("/v1/auth/token", json={"user_id": user, "passcode": passcode})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    body = {"profile": "MARS"}
    crew = token("crew-01", "crew-pass")
    assert client.post(profile_url(), json=body, headers=crew).status_code == 403
    assert client.post(profile_url(), json=body, headers=token("medic-01", "medic-pass")).status_code == 200
    assert client.post(profile_url(), json=body, headers=token("ground-01", "ground-pass")).status_code == 200
    assert client.get(profile_url(), headers=crew).json()["profile"] == "MARS"


def test_sync_status_link_delay_follows_profile(
    api_client: tuple[TestClient, Engine], monkeypatch
) -> None:
    client, _ = api_client
    monkeypatch.delenv("SPACEAPP_LINK_DELAY_SECONDS", raising=False)

    def status() -> dict:
        return client.get("/v1/sync/status", params={"mission_id": MISSION}).json()

    assert (status()["profile"], status()["link_delay_seconds"]) == ("ISS", 1)
    client.post(profile_url(), json={"profile": "MOON"})
    assert (status()["profile"], status()["link_delay_seconds"]) == ("MOON", 1)
    client.post(profile_url(), json={"profile": "MARS"})
    assert (status()["profile"], status()["link_delay_seconds"]) == ("MARS", 750)
    monkeypatch.setenv("SPACEAPP_LINK_DELAY_SECONDS", "42")
    assert status()["link_delay_seconds"] == 42


def situations(client: TestClient, scenario_id: str, profile: str | None) -> list[dict]:
    run = client.post(f"/v1/demo/scenarios/{scenario_id}/run").json()
    if profile:
        client.post(profile_url(run["mission_id"]), json={"profile": profile})
    params = {"mission_id": run["mission_id"]}
    if run.get("environment_target_id"):
        params["environment_target_id"] = run["environment_target_id"]
    status = client.get(f"/v1/crew/{run['crew_member_id']}/status", params=params).json()
    return [rule["situation"] for rule in status["rules"] if rule.get("situation")]


def earth(client: TestClient, scenario_id: str, profile: str | None) -> list[dict]:
    return [
        item["earth_response"]
        for item in situations(client, scenario_id, profile)
        if item.get("earth_response")
    ]


def test_earth_response_owner_switches_between_iss_and_mars(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    iss = earth(client, "co2-headache", "ISS")
    assert iss, "the CO2 card must carry an earth_response"
    assert all(item["owner"] == "FLIGHT_SURGEON" for item in iss)
    assert all(item["ground_can_respond_in_time"] for item in iss)
    assert iss[0]["profile"] == "ISS" and iss[0]["round_trip_seconds"] == 2

    # Find a scenario whose card window is shorter than the Mars round trip (25 min).
    found = False
    for scenario in ("spo2-drop", "cabin-o2-drop", "chest-pain-red-flag", "fever-trend"):
        mars = earth(client, scenario, "MARS")
        short = [item for item in mars if item["act_within_minutes"] < 25]
        if short:
            found = True
            assert short[0]["owner"] == "CREW_MEDICAL_OFFICER"
            assert short[0]["ground_can_respond_in_time"] is False
            assert short[0]["round_trip_seconds"] == 1500
            assert "gemideki" in short[0]["note_tr"]
            on_iss = earth(client, scenario, "ISS")
            assert all(item["owner"] == "FLIGHT_SURGEON" for item in on_iss)
            break
    assert found, "expected a demo scenario with a card window under 25 minutes"


@pytest.mark.parametrize(
    ("profile", "window", "owner"),
    [("ISS", 5, "FLIGHT_SURGEON"), ("MOON", 5, "FLIGHT_SURGEON"),
     ("MARS", 5, "CREW_MEDICAL_OFFICER"), ("MARS", 30, "FLIGHT_SURGEON")],
)
def test_owner_rule_boundaries(profile: str, window: int, owner: str) -> None:
    from spaceapp_logar.services.mission_profiles import _DEFS, owner_for

    assert owner_for(_DEFS[profile][2] * 2, window) == owner
