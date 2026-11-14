import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from spaceapp_logar.api.alerts import router as alerts_router
from spaceapp_logar.api.check_ins import router as check_ins_router
from spaceapp_logar.api.coverage import router as coverage_router
from spaceapp_logar.api.demo import router as demo_router
from spaceapp_logar.api.lab_results import router as lab_results_router
from spaceapp_logar.api.measurements import router as measurements_router
from spaceapp_logar.api.observations import router as observations_router
from spaceapp_logar.api.red_flags import router as red_flags_router
from spaceapp_logar.api.status import router as status_router

from spaceapp_logar.db.session import engine
from spaceapp_logar.observability import REQUEST_ID_HEADER, install
from spaceapp_logar.services.schema_check import SchemaMonitor

WEB_DIR = Path(__file__).parent / "web"


class ServiceHealth(BaseModel):
    """Operational status of the backend service and its database schema."""

    status: Literal["ok", "degraded"] = "ok"
    service: str = "spaceapp-logar-api"
    api_version: str = "0.2.0"
    database: str = "ok"
    schema_state: str = "current"
    schema_revision: str | None = None
    expected_revision: str | None = None


app = FastAPI(
    title="SpaceApp Logar API",
    version="0.2.0",
    description="Explainable astronaut health decision-support backend.",
)

# Local frontend dev servers (Vite 5173, Next/CRA 3000) may call the API from
# another origin. Override with SPACEAPP_CORS_ORIGINS="http://a,http://b".
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:3000,http://127.0.0.1:3000"
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("SPACEAPP_CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", REQUEST_ID_HEADER],
    expose_headers=[REQUEST_ID_HEADER],
    allow_credentials=False,
)

# Request ids, structured logs, error bodies and the schema guard.
install(app, SchemaMonitor(engine))

app.include_router(alerts_router)
app.include_router(check_ins_router)
app.include_router(coverage_router)
app.include_router(demo_router)
app.include_router(lab_results_router)
app.include_router(measurements_router)
app.include_router(observations_router)
app.include_router(red_flags_router)
app.include_router(status_router)


@app.get("/health", response_model=ServiceHealth, tags=["operations"])
def get_service_health(request: Request) -> ServiceHealth:
    """Process liveness plus database reachability and schema revision.

    Always 200 so a platform health check does not kill the process; a
    `degraded` status explains what to fix (e.g. run migrations).
    """

    state = request.app.state.schema_monitor.state(force=True)
    return ServiceHealth(
        status="ok" if state.usable else "degraded",
        database=state.database,
        schema_state=state.schema,
        schema_revision=state.current_revision,
        expected_revision=state.expected_revision,
    )


@app.get("/", include_in_schema=False)
def open_dashboard() -> RedirectResponse:
    return RedirectResponse(url="/ui/")


# Offline dashboard: plain static files, no CDN or build step.
app.mount(
    "/ui",
    StaticFiles(directory=WEB_DIR, html=True, check_dir=False),
    name="ui",
)
