"""Request ids, structured JSON logging and a consistent error body."""

import json
import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
# Fields copied from a log record's ``extra`` into the JSON line.
_LOG_FIELDS = ("request_id", "method", "path", "status", "duration_ms")

logger = logging.getLogger("spaceapp_logar")


class JsonFormatter(logging.Formatter):
    """One JSON object per line; only whitelisted fields are emitted."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in _LOG_FIELDS:
            if hasattr(record, field):
                entry[field] = getattr(record, field)
        if record.exc_info and record.exc_info[0] is not None:
            entry["exc_type"] = record.exc_info[0].__name__
        return json.dumps(entry, ensure_ascii=False)


def configure_logging() -> None:
    """Attach a JSON stream handler to the app logger once."""

    if not any(getattr(h, "_spaceapp_json", False) for h in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        handler._spaceapp_json = True  # type: ignore[attr-defined]
        logger.addHandler(handler)
    if logger.level == logging.NOTSET:
        logger.setLevel(logging.INFO)


def resolve_request_id(incoming: str | None) -> str:
    if incoming and _REQUEST_ID_PATTERN.fullmatch(incoming):
        return incoming
    return uuid.uuid4().hex


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or resolve_request_id(None)


def error_body(code: str, message: str, request_id: str, detail: Any) -> dict[str, Any]:
    # ``detail`` keeps FastAPI's historical shape for existing clients.
    return {
        "detail": detail,
        "error": {"code": code, "message": message, "request_id": request_id},
    }


def _status_code_name(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).name
    except ValueError:
        return f"HTTP_{status_code}"


def _internal_error_response(request_id: str) -> JSONResponse:
    message = "Beklenmeyen bir sunucu hatası oluştu."
    return JSONResponse(
        status_code=500,
        content=error_body("INTERNAL_ERROR", message, request_id, message),
        headers={REQUEST_ID_HEADER: request_id},
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else _status_code_name(exc.status_code)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(
            _status_code_name(exc.status_code), message, _request_id(request), exc.detail
        ),
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=error_body(
            "VALIDATION_ERROR",
            "İstek doğrulanamadı.",
            _request_id(request),
            jsonable_encoder(exc.errors()),
        ),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Fallback only; the middleware normally catches these first.
    request_id = _request_id(request)
    logger.error(
        "unhandled exception",
        exc_info=(type(exc), exc, exc.__traceback__),
        extra={"request_id": request_id},
    )
    return _internal_error_response(request_id)


async def request_context_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = resolve_request_id(request.headers.get(REQUEST_ID_HEADER))
    request.state.request_id = request_id
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error(
            "unhandled exception",
            exc_info=(type(exc), exc, exc.__traceback__),
            extra={"request_id": request_id, "method": request.method, "path": request.url.path},
        )
        response = _internal_error_response(request_id)
    response.headers[REQUEST_ID_HEADER] = request_id
    logger.info(
        "request",
        extra={
            "request_id": request_id,
            "method": request.method,
            # Path only: query strings may carry user-entered values.
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        },
    )
    return response


def install_observability(app: FastAPI) -> None:
    configure_logging()
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
    app.middleware("http")(request_context_middleware)
