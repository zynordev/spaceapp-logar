from alembic import command
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from spaceapp_logar.db.models import LabResult, Observation
from spaceapp_logar.db.session import create_database_engine
from spaceapp_logar.seed_demo import SEED_SCENARIOS, seed_demo


def test_seed_demo_is_idempotent(database_url, make_alembic_config) -> None:
    command.upgrade(make_alembic_config(database_url), "head")
    engine = create_database_engine(database_url)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        first = seed_demo(session, set_profile=False)
        count = session.scalar(select(func.count()).select_from(Observation))
        labs = session.scalar(select(func.count()).select_from(LabResult))
    with factory() as session:
        second = seed_demo(session, set_profile=False)
        assert session.scalar(select(func.count()).select_from(Observation)) == count
        assert session.scalar(select(func.count()).select_from(LabResult)) == labs
    assert set(first) == set(SEED_SCENARIOS) and first == second
    assert count > 0 and labs > 0
    engine.dispose()


def test_set_mission_profile_never_raises(monkeypatch):
    from spaceapp_logar import seed_demo as mod

    def boom(*args, **kwargs):
        raise ImportError("httpx missing")

    monkeypatch.setattr(mod, "_set_mission_profile", boom)
    assert mod.set_mission_profile("demo-x", "MARS") is False


def test_seed_demo_sets_mars_profile_without_http_client(database_url, make_alembic_config) -> None:
    from spaceapp_logar.seed_demo import MARS_SCENARIO
    from spaceapp_logar.services.mission_profiles import get_profile_name

    command.upgrade(make_alembic_config(database_url), "head")
    engine = create_database_engine(database_url)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        missions = seed_demo(session)
        assert get_profile_name(session, missions[MARS_SCENARIO]) == "MARS"
    engine.dispose()
