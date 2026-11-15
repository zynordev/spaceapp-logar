"""Demo login (SPACEAPP_DEMO_LOGIN); secrets here are fake per-test values."""


def test_demo_login_disabled_by_default(api_client, monkeypatch) -> None:
    monkeypatch.delenv("SPACEAPP_DEMO_LOGIN", raising=False)
    monkeypatch.setenv("SPACEAPP_AUTH_SECRET", "test-only-secret")
    client, _ = api_client
    assert client.get("/v1/auth/demo-roles").json() == []
    assert client.post("/v1/auth/demo-login", json={"role": "GROUND"}).status_code == 404


def test_demo_login_enabled_issues_role_tokens(api_client, monkeypatch) -> None:
    monkeypatch.setenv("SPACEAPP_DEMO_LOGIN", "true")
    monkeypatch.setenv("SPACEAPP_AUTH_SECRET", "test-only-secret")
    client, _ = api_client
    roles = client.get("/v1/auth/demo-roles").json()
    assert {r["user_id"] for r in roles} == {"demo-astronaut", "demo-medic", "demo-ground"}
    for entry in roles:
        response = client.post("/v1/auth/demo-login", json={"role": entry["role"]})
        assert response.status_code == 200
        body = response.json()
        assert body["user_id"] == entry["user_id"]
        headers = {"Authorization": f"Bearer {body['access_token']}"}
        me = client.get("/v1/auth/me", headers=headers).json()
        assert me["role"] == entry["role"] and not me["anonymous"]


def test_demo_login_needs_secret(api_client, monkeypatch) -> None:
    monkeypatch.setenv("SPACEAPP_DEMO_LOGIN", "true")
    monkeypatch.delenv("SPACEAPP_AUTH_SECRET", raising=False)
    client, _ = api_client
    assert client.post("/v1/auth/demo-login", json={"role": "GROUND"}).status_code == 503
