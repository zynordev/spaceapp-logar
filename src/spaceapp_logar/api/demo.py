"""Demo-only endpoints that generate clearly labelled synthetic data."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from spaceapp_logar.db.session import get_session
from spaceapp_logar.services.demo_scenarios import SCENARIOS, run_scenario
from spaceapp_logar.services.osdr_import import import_osdr_labs

router = APIRouter(prefix="/v1/demo", tags=["demo"])


class DemoScenarioRead(BaseModel):
    scenario_id: str
    title: str
    time_scale: str
    description: str
    duration_minutes: int
    expected: list[str]


class DemoRunRead(BaseModel):
    mission_id: str
    crew_member_id: str
    environment_target_id: str
    scenario_id: str
    observations_posted: int
    check_ins_posted: int
    lab_results_posted: int
    summary: list[str]


class OsdrImportRead(BaseModel):
    mission_id: str
    imported: int
    skipped_existing: int
    skipped_unusable: int
    crew_member_ids: list[str]


@router.post("/osdr-labs/import", response_model=OsdrImportRead)
def import_real_osdr_labs(
    session: Annotated[Session, Depends(get_session)],
) -> OsdrImportRead:
    """Load the bundled real Inspiration4 CBC/CMP values (idempotent)."""

    summary = import_osdr_labs(session)
    return OsdrImportRead(
        mission_id=summary.mission_id,
        imported=summary.imported,
        skipped_existing=summary.skipped_existing,
        skipped_unusable=summary.skipped_unusable,
        crew_member_ids=list(summary.crew_member_ids),
    )


@router.get("/scenarios", response_model=list[DemoScenarioRead])
def list_scenarios() -> list[DemoScenarioRead]:
    return [
        DemoScenarioRead(
            scenario_id=scenario.scenario_id,
            title=scenario.title,
            time_scale=scenario.time_scale,
            description=scenario.description,
            duration_minutes=scenario.duration_minutes,
            expected=list(scenario.expected),
        )
        for scenario in SCENARIOS.values()
    ]


@router.post(
    "/scenarios/{scenario_id}/run",
    response_model=DemoRunRead,
    status_code=status.HTTP_201_CREATED,
)
def run_demo_scenario(
    scenario_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> DemoRunRead:
    """Generate one synthetic scenario into a brand-new mission id."""

    if scenario_id not in SCENARIOS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown demo scenario")
    result = run_scenario(session, scenario_id)
    return DemoRunRead(
        mission_id=result.mission_id,
        crew_member_id=result.crew_member_id,
        environment_target_id=result.environment_target_id,
        scenario_id=result.scenario_id,
        observations_posted=result.observations_posted,
        check_ins_posted=result.check_ins_posted,
        lab_results_posted=result.lab_results_posted,
        summary=list(SCENARIOS[scenario_id].expected),
    )
