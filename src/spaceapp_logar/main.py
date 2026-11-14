from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from spaceapp_logar.api.check_ins import router as check_ins_router
from spaceapp_logar.api.observations import router as observations_router
from spaceapp_logar.api.status import router as status_router


class ServiceHealth(BaseModel):
    """Operational status of the backend service."""

    status: Literal["ok"] = "ok"
    service: str = "spaceapp-logar-api"
    api_version: str = "0.1.0"


app = FastAPI(
    title="SpaceApp Logar API",
    version="0.1.0",
    description="Explainable astronaut health decision-support backend.",
)
app.include_router(check_ins_router)
app.include_router(observations_router)
app.include_router(status_router)


@app.get("/health", response_model=ServiceHealth, tags=["operations"])
def get_service_health() -> ServiceHealth:
    """Confirm that the API process is ready to receive requests."""

    return ServiceHealth()

