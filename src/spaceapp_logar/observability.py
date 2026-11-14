"""Structured logging, request ids, error bodies and the schema guard.

Logs never include request or response bodies: they can carry crew health
data. Only method, path, status, duration and the request id are recorded.
"""

import json
import logging
import os
import sys
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

from spaceapp_logar.services.schema_check import UPGRADE_HINT, SchemaMonitor

LOGGER_NAME = "spaceapp_logar"
REQUEST_ID_HEADER = "X-Request-ID"
_MAX_REQUEST_ID_LENGTH = 100

logger = logging.getLogger(LOGGER_NAME)


class JsonFormatter(logging.Formatter):
    """One JSON object per line; extra fields come from `record.fields`."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        payload.update(getattr(record, "fields", {}))
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    """Set up the app logger once. SPACEAPP_LOG_FORMAT=text for plain lines."""

    if logger.handlers:
        return
    handler = logging.StreamHandler(sys.stderr)
    if os.getenv("SPACEAPP_LOG_FORMAT", "json").lower() == "text":
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
    else:
        handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(os.getenv("SPACEAPP_LOG_LEVEL", "INFO").upper())
    logger.propagate = False


def _request_id(request: Request) -> str:
    incoming = request.headers.get(REQUEST_ID_HEADER, "").strip()
    if incoming and len(incoming) <= _MAX_REQUEST_ID_LENGTH and incoming.isprintable():
        return incoming
    return uuid.uuid4().hex


def schema_guard_enabled() -> bool:
    return os.getenv("SPACEAPP_SCHEMA_GUARD", "on").lower() not in {"off", "0", "false"}


def install(app: FastAPI, monitor: SchemaMonitor) -> None:
    """Attach request logging, the schema guard and the error handler."""

    configure_logging()
    app.state.schema_monitor = monitor

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = _request_id(request)
        request.state.request_id = request_id
        started = time.perf_counter()

        if request.url.path.startswith("/v1/") and schema_guard_enabled():
            state = request.app.state.schema_monitor.state()
            if not state.usable:
                response: Response = JSONResponse(
                    status_code=503,
                    content={
                        "detail": (
                            "Database is unreachable."
                            if state.database != "ok"
                            else f"Database schema is {state.schema}. {UPGRADE_HINT}"
                        ),
                        "database": state.database,
                        "schema": state.schema,
                        "schema_revision": state.current_revision,
                        "expected_revision": state.expected_revision,
                        "request_id": request_id,
                    },
                )
                response.headers[REQUEST_ID_HEADER] = request_id
                _log_request(request, response.status_code, started, request_id)
                return response

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "unhandled error",
                extra={"fields": {"request_id": request_id, "path": request.url.path}},
            )
            response = JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error. Quote the request_id when reporting.",
                    "request_id": request_id,
                },
            )
        response.headers[REQUEST_ID_HEADER] = request_id
        _log_request(request, response.status_code, started, request_id)
        return response


def _log_request(request: Request, status: int, started: float, request_id: str) -> None:
    duration_ms = round((time.perf_counter() - started) * 1000, 1)
    level = logging.WARNING if status >= 500 else logging.INFO
    logger.log(
        level,
        "request",
        extra={
            "fields": {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": status,
                "duration_ms": duration_ms,
            }
        },
    )
