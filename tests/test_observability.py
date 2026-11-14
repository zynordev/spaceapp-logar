import json
import logging

from fastapi import APIRouter
from fastapi.testclient import TestClient
import pytest

from spaceapp_logar.main import app
from spaceapp_logar.observability import JsonFormatter

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _enable_app_logger() -> None:
    # Alembic's fileConfig (run in-process by other tests) disables existing loggers.
    logging.getLogger("spaceapp_logar").disabled = False

_boom = APIRouter()


@_boom.get("/__test__/boom", include_in_schema=False)
def _explode() -> None:
    raise RuntimeError("secret internal detail")


app.include_router(_boom)


def test_incoming_request_id_is_echoed() -> None:
    response = client.get("/health", headers={"X-Request-ID": "abc.DEF-123_x"})

    assert response.headers["X-Request-ID"] == "abc.DEF-123_x"


def test_request_id_is_generated_when_missing() -> None:
    response = client.get("/health")

    assert len(response.headers["X-Request-ID"]) == 32


@pytest.mark.parametrize("bad", ["has space", "x" * 101, "semi;colon", "slash/x"])
def test_invalid_request_id_is_replaced(bad: str) -> None:
    response = client.get("/health", headers={"X-Request-ID": bad})

    assert response.headers["X-Request-ID"] != bad
    assert len(response.headers["X-Request-ID"]) == 32


def test_404_error_body_shape() -> None:
    response = client.get("/no-such-route", headers={"X-Request-ID": "r404"})

    assert response.status_code == 404
    body = response.json()
    assert body["detail"] == "Not Found"
    assert body["error"] == {"code": "NOT_FOUND", "message": "Not Found", "request_id": "r404"}


def test_422_error_body_keeps_detail_list() -> None:
    response = client.post("/v1/measurements", json={}, headers={"X-Request-ID": "r422"})

    assert response.status_code == 422
    body = response.json()
    assert isinstance(body["detail"], list) and body["detail"]
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["request_id"] == "r422"


def test_unhandled_exception_returns_generic_500(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="spaceapp_logar"):
        response = client.get("/__test__/boom", headers={"X-Request-ID": "r500"})

    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == "r500"
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["request_id"] == "r500"
    assert "secret" not in response.text and "Traceback" not in response.text
    assert any(
        r.levelno == logging.ERROR and getattr(r, "request_id", None) == "r500"
        for r in caplog.records
    )


def test_request_log_line_has_request_id_and_no_query(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO, logger="spaceapp_logar"):
        client.get(
            "/v1/metrics?token=hunter2",
            headers={"X-Request-ID": "rlog", "Authorization": "Bearer s3cret"},
        )

    record = next(r for r in caplog.records if getattr(r, "request_id", None) == "rlog")
    line = json.loads(JsonFormatter().format(record))
    assert line["request_id"] == "rlog"
    assert line["path"] == "/v1/metrics"
    assert line["method"] == "GET" and line["status"] == 200
    assert "duration_ms" in line
    rendered = json.dumps(line)
    assert "hunter2" not in rendered and "s3cret" not in rendered and "token" not in rendered


def test_cors_exposes_request_id_header() -> None:
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert "x-request-id" in response.headers["access-control-expose-headers"].lower()

    preflight = client.options(
        "/v1/measurements",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-request-id",
        },
    )
    assert preflight.status_code == 200


def test_dashboard_still_loads() -> None:
    assert client.get("/ui/").status_code == 200
