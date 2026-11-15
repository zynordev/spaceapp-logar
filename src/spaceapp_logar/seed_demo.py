"""Seed a fresh demo database (used on Render free plan, ephemeral disk).

Run after ``alembic upgrade head``::

    uv run python -m spaceapp_logar.seed_demo

Imports the real OSDR labs, generates the co2-headache, chest-pain-red-flag
and radiation-spe synthetic scenarios (labelled synthetic) and, if the mission
profile API exists, sets the radiation mission to MARS. Idempotent: anything
already present is left alone.
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import LabResult, Observation, RedFlagReport, SubjectiveCheckIn
from spaceapp_logar.services.demo_scenarios import run_scenario
from spaceapp_logar.services.osdr_import import import_osdr_labs

logger = logging.getLogger("spaceapp_logar.seed_demo")

SEED_SCENARIOS = ("co2-headache", "chest-pain-red-flag", "radiation-spe")
MARS_SCENARIO = "radiation-spe"
PROFILE_ROUTE = "/v1/missions/{mission_id}/profile"


def _existing_mission(session: Session, scenario_id: str) -> str | None:
    pattern = f"demo-{scenario_id}-%"
    for model in (Observation, SubjectiveCheckIn, LabResult, RedFlagReport):
        found = session.scalar(
            select(model.mission_id).where(model.mission_id.like(pattern)).limit(1)
        )
        if found:
            return found
    return None


def set_mission_profile(mission_id: str, profile: str) -> bool:
    """Set the mission profile through the API if that route exists."""

    from fastapi.testclient import TestClient

    from spaceapp_logar.auth import Role, auth_configured, issue_token
    from spaceapp_logar.main import app

    if not any(getattr(route, "path", "") == PROFILE_ROUTE for route in app.routes):
        logger.info("mission profile API not available; skipping profile for %s", mission_id)
        return False
    headers = {}
    if auth_configured():
        token, _ = issue_token("demo-seed", Role.CREW_MEDICAL_OFFICER)
        headers["Authorization"] = f"Bearer {token}"
    with TestClient(app) as client:
        response = client.post(
            f"/v1/missions/{mission_id}/profile", json={"profile": profile}, headers=headers
        )
    if response.status_code >= 400:
        logger.warning("could not set profile %s on %s: %s", profile, mission_id, response.status_code)
        return False
    return True


def seed_demo(session: Session, set_profile: bool = True) -> dict[str, str]:
    """Seed the database; returns scenario_id -> mission_id."""

    summary = import_osdr_labs(session)
    logger.info("OSDR labs: %s imported, %s existing", summary.imported, summary.skipped_existing)
    missions: dict[str, str] = {}
    for scenario_id in SEED_SCENARIOS:
        mission_id = _existing_mission(session, scenario_id)
        if mission_id is None:
            mission_id = run_scenario(session, scenario_id).mission_id
            logger.info("scenario %s seeded as %s", scenario_id, mission_id)
        missions[scenario_id] = mission_id
    if set_profile:
        set_mission_profile(missions[MARS_SCENARIO], "MARS")
    return missions


def main() -> None:
    from spaceapp_logar.db.session import SessionFactory

    logging.basicConfig(level=logging.INFO)
    with SessionFactory() as session:
        missions = seed_demo(session)
    for scenario_id, mission_id in missions.items():
        print(f"{scenario_id}: {mission_id}")


if __name__ == "__main__":
    main()
