import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from spaceapp_logar.api.alerts import router as alerts_router
from spaceapp_logar.api.check_ins import router as check_ins_router
from spaceapp_logar.api.demo import router as demo_router
from spaceapp_logar.api.lab_results import router as lab_results_router
from spaceapp_logar.api.measurements import router as measurements_router
from spaceapp_logar.api.observations import router as observations_router
from spaceapp_logar.api.red_flags import router as red_flags_router
from spaceapp_logar.api.status import router as status_router

WEB_DIR = Path(__file__).parent / "web"


class ServiceHealth(BaseModel):
    """Operational status of the backend service."""

    status: Literal["ok"] = "ok"
    service: str = "spaceapp-logar-api"
    api_version: str = "0.2.0"


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
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

app.include_router(alerts_router)
app.include_router(check_ins_router)
app.include_router(demo_router)
app.include_router(lab_results_router)
app.include_router(measurements_router)
app.include_router(observations_router)
app.include_router(red_flags_router)
app.include_router(status_router)


@app.get("/health", response_model=ServiceHealth, tags=["operations"])
def get_service_health() -> ServiceHealth:
    """Confirm that the API process is ready to receive requests."""

    return ServiceHealth()


@app.get("/", include_in_schema=False)
def open_dashboard() -> RedirectResponse:
    return RedirectResponse(url="/ui/")


# Offline dashboard: plain static files, no CDN or build step.
app.mount(
    "/ui",
    StaticFiles(directory=WEB_DIR, html=True, check_dir=False),
    name="ui",
)
