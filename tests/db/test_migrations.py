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
    "activity_state",
    "activity_source",
    "ingested_at",
}




def test_first_migration_upgrades_and_downgrades_cleanly(
    database_url: str, make_alembic_config
) -> None:
    config = make_alembic_config(database_url)

    command.upgrade(config, "head")

    engine = create_engine(database_url)
    inspector = inspect(engine)
    assert {
        "observations",
        "rule_evaluations",
        "rule_evaluation_evidence",
        "subjective_check_ins",
        "alert_events",
        "lab_results",
        "red_flag_reports",
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
    } == {"ck_observations_synthetic_scenario", "ck_observations_activity_source"}
    assert {
        "action_card_id",
        "action_card_version",
    }.issubset(
        {column["name"] for column in inspector.get_columns("rule_evaluations")}
    )
    engine.dispose()

    command.check(config)

    command.downgrade(config, "20261114_0003")

    engine = create_engine(database_url)
    remaining_columns = {
        column["name"] for column in inspect(engine).get_columns("rule_evaluations")
    }
    assert "action_card_id" not in remaining_columns
    assert "action_card_version" not in remaining_columns
    engine.dispose()

    command.downgrade(config, "base")

    engine = create_engine(database_url)
    assert "observations" not in inspect(engine).get_table_names()
    engine.dispose()

