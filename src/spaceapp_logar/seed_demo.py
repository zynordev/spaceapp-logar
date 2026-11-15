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


def _existing_mission(session: Session, scenario_id: str) -> str | None:
    pattern = f"demo-{scenario_id}-%"
    for model in (Observation, SubjectiveCheckIn, LabResult, RedFlagReport):
        found = session.scalar(
            select(model.mission_id).where(model.mission_id.like(pattern)).limit(1)
        )
        if found:
            return found
    return None


def set_mission_profile(mission_id: str, profile: str, session: Session | None = None) -> bool:
    """Store the mission profile directly through the service layer.

    Never raises: the seed must not abort the boot. Uses the database session
    instead of an HTTP test client, because the production image has no dev
    dependencies (httpx).
    """

    try:
        return _set_mission_profile(mission_id, profile, session)
    except Exception as exc:  # noqa: BLE001 - seed must never abort boot
        logger.warning("could not set profile %s on %s: %s", profile, mission_id, exc)
        return False


def _set_mission_profile(mission_id: str, profile: str, session: Session | None) -> bool:
    from spaceapp_logar.services.mission_profiles import set_profile

    if session is None:
        from spaceapp_logar.db.session import SessionFactory

        with SessionFactory() as own_session:
            set_profile(own_session, mission_id, profile, "demo-seed")
            own_session.commit()
        return True
    set_profile(session, mission_id, profile, "demo-seed")
    session.commit()
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
        set_mission_profile(missions[MARS_SCENARIO], "MARS", session)
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
