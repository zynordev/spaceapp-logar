from fastapi.testclient import TestClient

from spaceapp_logar.main import app


client = TestClient(app)


def test_health_endpoint_reports_service_is_ready() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "spaceapp-logar-api",
        "api_version": "0.2.0",
    }

