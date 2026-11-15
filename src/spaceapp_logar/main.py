import os
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from spaceapp_logar.api.activities import router as activities_router
from spaceapp_logar.api.alerts import router as alerts_router
from spaceapp_logar.api.auth import router as auth_router
from spaceapp_logar.api.body_map import router as body_map_router
from spaceapp_logar.api.check_ins import router as check_ins_router
from spaceapp_logar.api.coverage import router as coverage_router
from spaceapp_logar.api.demo import router as demo_router
from spaceapp_logar.api.environment import router as environment_router
from spaceapp_logar.api.lab_results import router as lab_results_router
from spaceapp_logar.api.measurements import router as measurements_router
from spaceapp_logar.api.observations import router as observations_router
from spaceapp_logar.api.red_flags import router as red_flags_router
from spaceapp_logar.api.status import router as status_router
from spaceapp_logar.auth import current_user
from spaceapp_logar.db import session as db_session
from spaceapp_logar.observability import REQUEST_ID_HEADER, install_observability

WEB_DIR = Path(__file__).parent / "web"


class SchemaHealth(BaseModel):
    state: str
    database_revision: str | None
    code_revision: str | None
    message: str


class ServiceHealth(BaseModel):
    """Operational status of the backend service."""

    status: Literal["ok"] = "ok"
    service: str = "spaceapp-logar-api"
    api_version: str = "0.2.0"
    schema_state: str = Field(alias="schema", serialization_alias="schema")
    schema_detail: SchemaHealth

    model_config = ConfigDict(populate_by_name=True)


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
# Request id + JSON logs + error body; installed before CORS so CORS stays
# the outermost middleware and also decorates error responses.
install_observability(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        REQUEST_ID_HEADER,
    ],
    expose_headers=[REQUEST_ID_HEADER],
    allow_credentials=False,
)

# Token issuing is the only /v1 endpoint that never needs a token.
app.include_router(auth_router)

# Every other /v1 router resolves the caller. With SPACEAPP_AUTH_REQUIRED off
# (default) a request without a token runs as an anonymous demo user, so the
# offline dashboard and demo scenarios keep working; see spaceapp_logar.auth.
AUTHENTICATED = [Depends(current_user)]
app.include_router(activities_router, dependencies=AUTHENTICATED)
app.include_router(alerts_router, dependencies=AUTHENTICATED)
app.include_router(body_map_router, dependencies=AUTHENTICATED)
app.include_router(check_ins_router, dependencies=AUTHENTICATED)
app.include_router(coverage_router, dependencies=AUTHENTICATED)
app.include_router(demo_router, dependencies=AUTHENTICATED)
app.include_router(environment_router, dependencies=AUTHENTICATED)
app.include_router(lab_results_router, dependencies=AUTHENTICATED)
app.include_router(measurements_router, dependencies=AUTHENTICATED)
app.include_router(observations_router, dependencies=AUTHENTICATED)
app.include_router(red_flags_router, dependencies=AUTHENTICATED)
app.include_router(status_router, dependencies=AUTHENTICATED)


@app.get("/health", response_model=ServiceHealth, tags=["operations"])
def get_service_health() -> ServiceHealth:
    """Confirm that the API process is ready to receive requests."""

    status = db_session.schema_guard.status()
    return ServiceHealth(
        schema_state=status.state,
        schema_detail=SchemaHealth(
            state=status.state,
            database_revision=status.database_revision,
            code_revision=status.code_revision,
            message=status.message,
        ),
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
