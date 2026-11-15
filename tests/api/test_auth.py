"""Optional token auth and roles (SPACEAPP_AUTH_REQUIRED transition flag).

All secrets and passcodes here are fake values set per test with monkeypatch.
"""

import base64
from datetime import datetime, timezone
import json
import time

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from spaceapp_logar import auth
from spaceapp_logar.db.models import ActionStepLog

MISSION = "m-auth"
CREW = "crew-01"
MEDIC = "medic-01"
FAKE_SECRET = "test-only-secret"
FAKE_USERS = (
    f"{CREW}:ASTRONAUT:crew-pass,"
    f"{MEDIC}:CREW_MEDICAL_OFFICER:medic-pass,"
    "ground-01:GROUND:ground-pass"
)
PASSCODES = {CREW: "crew-pass", MEDIC: "medic-pass"}


@pytest.fixture
def auth_env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    monkeypatch.setenv("SPACEAPP_AUTH_SECRET", FAKE_SECRET)
    monkeypatch.setenv("SPACEAPP_AUTH_USERS", FAKE_USERS)
    monkeypatch.delenv("SPACEAPP_AUTH_REQUIRED", raising=False)
    return monkeypatch


@pytest.fixture
def required(auth_env: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    auth_env.setenv("SPACEAPP_AUTH_REQUIRED", "true")
    return auth_env


def login(client: TestClient, user_id: str, passcode: str | None = None):
    return client.post(
        "/v1/auth/token",
        json={"user_id": user_id, "passcode": passcode or PASSCODES[user_id]},
    )


def bearer(client: TestClient, user_id: str) -> dict[str, str]:
    response = login(client, user_id)
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def open_red_flag(client: TestClient, headers: dict[str, str] | None = None) -> str:
    response = client.post(
        "/v1/red-flags",
        json={
            "mission_id": MISSION,
            "crew_member_id": CREW,
            "flags": ["CHEST_PAIN"],
            "observed_at": "2026-11-14T10:00:00Z",
            "source_type": "MANUAL",
            "source_id": "dashboard-user",
        },
        headers=headers or {},
    )
    assert response.status_code == 201
    return response.json()["alert_id"]


def alerts_url(alert_id: str, action: str) -> str:
    return f"/v1/alerts/{alert_id}/{action}"


# --- token issuing -----------------------------------------------------------


def test_token_is_issued_for_correct_passcode(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    client, _ = api_client

    response = login(client, MEDIC)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user_id"] == MEDIC
    assert body["role"] == "CREW_MEDICAL_OFFICER"
    expires_at = datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
    assert expires_at.tzinfo is not None
    remaining = (expires_at - datetime.now(timezone.utc)).total_seconds()
    assert 11 * 3600 < remaining <= 12 * 3600
    assert auth.verify_token(body["access_token"]) == auth.User(
        MEDIC, auth.Role.CREW_MEDICAL_OFFICER
    )


@pytest.mark.parametrize(
    ("user_id", "passcode"),
    [(CREW, "wrong-pass"), ("nobody", "crew-pass"), (CREW, "medic-pass")],
)
def test_wrong_credentials_are_401(
    api_client: tuple[TestClient, Engine],
    auth_env: pytest.MonkeyPatch,
    user_id: str,
    passcode: str,
) -> None:
    client, _ = api_client

    response = login(client, user_id, passcode)

    assert response.status_code == 401
    assert "access_token" not in response.json()


def test_token_endpoint_without_secret_is_503(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    auth_env.delenv("SPACEAPP_AUTH_SECRET")

    assert login(client, CREW).status_code == 503


def test_token_endpoint_itself_needs_no_token(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client

    assert login(client, CREW).status_code == 200


# --- flag on: /v1 needs a token ----------------------------------------------


@pytest.mark.parametrize(
    "path",
    [
        f"/v1/alerts?mission_id={MISSION}",
        "/v1/red-flags/catalog",
        "/v1/risk-coverage",
        "/v1/metrics",
        f"/v1/crew/{CREW}/status?mission_id={MISSION}",
    ],
)
def test_flag_on_rejects_requests_without_token(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch, path: str
) -> None:
    client, _ = api_client

    response = client.get(path)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_flag_on_rejects_writes_without_token(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client

    assert client.post("/v1/demo/scenarios/co2-headache/run").status_code == 401


def test_flag_on_accepts_a_valid_token(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    headers = bearer(client, CREW)

    listed = client.get("/v1/alerts", params={"mission_id": MISSION}, headers=headers)
    catalog = client.get("/v1/red-flags/catalog", headers=headers)

    assert listed.status_code == 200
    assert catalog.status_code == 200
    assert open_red_flag(client, headers)


def test_health_and_dashboard_need_no_token(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client

    assert client.get("/health").status_code == 200
    assert client.get("/ui/").status_code == 200
    root = client.get("/", follow_redirects=False)
    assert root.status_code in {302, 307}


def test_tampered_token_is_401(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    token = login(client, CREW).json()["access_token"]
    payload, signature = token.split(".")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    claims["role"] = "CREW_MEDICAL_OFFICER"
    forged = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()

    for bad in [f"{forged}.{signature}", token[:-2] + "xx", "not-a-token", "a.b.c", "é.é"]:
        response = client.get(
            "/v1/red-flags/catalog",
            headers={"Authorization": f"Bearer {bad}".encode("latin-1")},
        )
        assert response.status_code == 401, bad
        assert auth.verify_token(bad) is None


def test_token_signed_with_another_secret_is_401(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    token = login(client, CREW).json()["access_token"]
    required.setenv("SPACEAPP_AUTH_SECRET", "another-test-secret")

    response = client.get(
        "/v1/red-flags/catalog", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 401


def test_expired_token_is_401(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    old = time.time() - auth.TOKEN_TTL_SECONDS - 60
    token, _expires = auth.issue_token(CREW, auth.Role.ASTRONAUT, now=old)

    response = client.get(
        "/v1/red-flags/catalog", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 401


# --- flag off: demo mode -----------------------------------------------------


def test_flag_off_works_without_token(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    client, _ = api_client

    alert_id = open_red_flag(client)
    acknowledged = client.post(
        alerts_url(alert_id, "acknowledge"), json={"crew_member_id": CREW}
    )

    assert client.get("/v1/red-flags/catalog").status_code == 200
    assert acknowledged.status_code == 200
    assert acknowledged.json()["acknowledged_by"] == CREW


def test_flag_off_ignores_an_invalid_token(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    # Flag off must not change behaviour for existing clients: a stale or
    # garbage token falls back to the anonymous demo user (and is logged).
    client, _ = api_client
    alert_id = open_red_flag(client)
    headers = {"Authorization": "Bearer forged.value"}

    catalog = client.get("/v1/red-flags/catalog", headers=headers)
    acknowledged = client.post(
        alerts_url(alert_id, "acknowledge"), json={"crew_member_id": CREW}, headers=headers
    )

    assert catalog.status_code == 200
    assert acknowledged.json()["acknowledged_by"] == CREW


@pytest.mark.parametrize("body", [None, {}])
def test_flag_off_acknowledge_without_crew_member_is_422(
    api_client: tuple[TestClient, Engine],
    auth_env: pytest.MonkeyPatch,
    body: dict | None,
) -> None:
    client, _ = api_client
    alert_id = open_red_flag(client)

    response = client.post(alerts_url(alert_id, "acknowledge"), json=body)

    assert response.status_code == 422


def test_flag_off_anonymous_resolve_stays_open(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    alert_id = open_red_flag(client)

    response = client.post(
        alerts_url(alert_id, "resolve"), json={"crew_member_id": "crew-medic"}
    )

    assert response.status_code == 200
    assert response.json()["resolved_by"] == "crew-medic"


# --- the actor comes from the token ------------------------------------------


def test_acknowledged_by_is_the_token_user(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    headers = bearer(client, CREW)
    alert_id = open_red_flag(client, headers)

    response = client.post(
        alerts_url(alert_id, "acknowledge"),
        json={"crew_member_id": "someone-else"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["acknowledged_by"] == CREW


def test_acknowledge_with_token_needs_no_body(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    headers = bearer(client, CREW)
    alert_id = open_red_flag(client)

    response = client.post(alerts_url(alert_id, "acknowledge"), headers=headers)

    assert response.status_code == 200
    assert response.json()["acknowledged_by"] == CREW


def test_step_crew_member_is_the_token_user(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, engine = api_client
    headers = bearer(client, CREW)
    alert_id = open_red_flag(client, headers)

    response = client.post(
        alerts_url(alert_id, "steps"),
        json={"crew_member_id": "someone-else", "step_key": "call_crew"},
        headers=headers,
    )
    without_id = client.post(
        alerts_url(alert_id, "steps"),
        json={"step_key": "call_crew"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["completed_step_keys"] == ["call_crew"]
    assert without_id.status_code == 200
    with Session(engine) as session:
        [log] = session.scalars(select(ActionStepLog)).all()
    assert log.crew_member_id == CREW


def test_flag_off_step_without_crew_member_is_422(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    alert_id = open_red_flag(client)

    response = client.post(alerts_url(alert_id, "steps"), json={"step_key": "call_crew"})

    assert response.status_code == 422


# --- roles: closing a red flag -----------------------------------------------


@pytest.mark.parametrize("user_id", [CREW, "ground-01"])
def test_non_medical_officer_cannot_resolve_a_red_flag(
    api_client: tuple[TestClient, Engine],
    required: pytest.MonkeyPatch,
    user_id: str,
) -> None:
    client, _ = api_client
    passcode = {"ground-01": "ground-pass"}.get(user_id, PASSCODES.get(user_id))
    token = login(client, user_id, passcode).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    alert_id = open_red_flag(client, headers)

    response = client.post(
        alerts_url(alert_id, "resolve"), json={"crew_member_id": MEDIC}, headers=headers
    )
    still_open = client.get(
        "/v1/alerts", params={"mission_id": MISSION}, headers=headers
    ).json()

    assert response.status_code == 403
    assert [alert["status"] for alert in still_open] == ["OPEN"]


def test_medical_officer_resolves_a_red_flag(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    alert_id = open_red_flag(client, bearer(client, CREW))
    headers = bearer(client, MEDIC)

    response = client.post(
        alerts_url(alert_id, "resolve"),
        json={"crew_member_id": "someone-else"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "RESOLVED"
    assert response.json()["resolved_by"] == MEDIC


def test_token_role_is_enforced_even_when_flag_is_off(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    alert_id = open_red_flag(client)

    response = client.post(
        alerts_url(alert_id, "resolve"), headers=bearer(client, CREW)
    )

    assert response.status_code == 403


def test_config_reports_flag_and_secret(
    api_client: tuple[TestClient, Engine], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    monkeypatch.delenv("SPACEAPP_AUTH_SECRET", raising=False)
    monkeypatch.delenv("SPACEAPP_AUTH_REQUIRED", raising=False)
    assert client.get("/v1/auth/config").json() == {
        "auth_required": False,
        "auth_configured": False,
    }

    monkeypatch.setenv("SPACEAPP_AUTH_SECRET", FAKE_SECRET)
    monkeypatch.setenv("SPACEAPP_AUTH_REQUIRED", "true")
    response = client.get("/v1/auth/config")  # needs no token even when required
    assert response.status_code == 200
    assert response.json() == {"auth_required": True, "auth_configured": True}


def test_me_is_anonymous_when_flag_off(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    client, _ = api_client

    response = client.get("/v1/auth/me")

    assert response.status_code == 200
    assert response.json() == {"user_id": "demo-anonymous", "role": None, "anonymous": True}


def test_me_returns_role_for_valid_token(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client

    response = client.get("/v1/auth/me", headers=bearer(client, MEDIC))

    assert response.status_code == 200
    assert response.json() == {"user_id": MEDIC, "role": "CREW_MEDICAL_OFFICER", "anonymous": False}


def test_me_without_token_is_401_when_flag_on(
    api_client: tuple[TestClient, Engine], required: pytest.MonkeyPatch
) -> None:
    client, _ = api_client

    assert client.get("/v1/auth/me").status_code == 401


def test_me_invalid_token_401_when_on_anonymous_when_off(
    api_client: tuple[TestClient, Engine], auth_env: pytest.MonkeyPatch
) -> None:
    client, _ = api_client
    headers = {"Authorization": "Bearer not-a-real-token"}

    anonymous = client.get("/v1/auth/me", headers=headers)
    assert anonymous.status_code == 200
    assert anonymous.json()["anonymous"] is True

    auth_env.setenv("SPACEAPP_AUTH_REQUIRED", "true")
    assert client.get("/v1/auth/me", headers=headers).status_code == 401
