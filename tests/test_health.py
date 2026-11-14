from fastapi.testclient import TestClient

from spaceapp_logar.main import app


client = TestClient(app)


def test_health_endpoint_reports_service_and_schema() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "spaceapp-logar-api"
    assert body["api_version"] == "0.2.0"
    assert body["schema"] in {"current", "outdated", "unknown"}
    assert body["schema_detail"]["state"] == body["schema"]
