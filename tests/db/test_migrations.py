from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


EXPECTED_COLUMNS = {
    "id",
    "mission_id",
    "target_type",
    "target_id",
    "metric",
    "value",
    "unit",
    "observed_at",
    "source_type",
    "source_id",
    "scenario_id",
    "reported_quality",
    "ingested_at",
}


def alembic_config(database_path: Path) -> Config:
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path}")
    return config


def test_first_migration_upgrades_and_downgrades_cleanly(tmp_path: Path) -> None:
    database_path = tmp_path / "migration-test.db"
    config = alembic_config(database_path)

    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{database_path}")
    inspector = inspect(engine)
    assert {
        "observations",
        "rule_evaluations",
        "rule_evaluation_evidence",
        "subjective_check_ins",
        "alert_events",
        "lab_results",
    }.issubset(inspector.get_table_names())
    assert {
        index["name"] for index in inspector.get_indexes("alert_events")
    } >= {"uq_alert_events_active", "ix_alert_events_lookup"}
    assert {column["name"] for column in inspector.get_columns("observations")} == (
        EXPECTED_COLUMNS
    )
    assert {index["name"] for index in inspector.get_indexes("observations")} == {
        "ix_observations_lookup",
        "ix_observations_observed_at",
    }
    assert {
        constraint["name"]
        for constraint in inspector.get_check_constraints("observations")
    } == {"ck_observations_synthetic_scenario"}
    assert {
        "action_card_id",
        "action_card_version",
    }.issubset(
        {column["name"] for column in inspector.get_columns("rule_evaluations")}
    )
    engine.dispose()

    command.check(config)

    command.downgrade(config, "20261114_0003")

    engine = create_engine(f"sqlite:///{database_path}")
    remaining_columns = {
        column["name"] for column in inspect(engine).get_columns("rule_evaluations")
    }
    assert "action_card_id" not in remaining_columns
    assert "action_card_version" not in remaining_columns
    engine.dispose()

    command.downgrade(config, "base")

    engine = create_engine(f"sqlite:///{database_path}")
    assert "observations" not in inspect(engine).get_table_names()
    engine.dispose()

