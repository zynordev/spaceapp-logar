from datetime import datetime
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

from spaceapp_logar.rules.action_cards_v2 import ACTIVE_CARDS

FORBIDDEN_WORDS = ("mg ", "doz", "tablet", "ilaç al", "aspirin", "parasetamol", "teşhis:")


@pytest.mark.parametrize("card", ACTIVE_CARDS, ids=lambda card: card.card_id)
def test_every_v2_card_is_concrete_explained_and_safe(card) -> None:
    assert card.version == 2
    assert len(card.steps) >= 3
    assert all(step.why_tr for step in card.steps), "every step needs a reason"
    assert card.reassess_minutes
    assert card.escalate_if_tr
    assert card.closes_when_tr
    assert card.references
    assert card.allows_automatic_vehicle_command is False
    text = " ".join(
        [card.title_tr, card.reason_tr, card.footer_note_tr]
        + [step.text_tr + " " + step.why_tr for step in card.steps]
    ).lower()
    for word in FORBIDDEN_WORDS:
        assert word not in text, f"{card.card_id} contains '{word}'"


def run_co2(client: TestClient) -> tuple[dict, dict]:
    run = client.post("/v1/demo/scenarios/co2-headache/run").json()
    status = client.get(
        f"/v1/crew/{run['crew_member_id']}/status",
        params={
            "mission_id": run["mission_id"],
            "environment_target_id": run["environment_target_id"],
        },
    ).json()
    co2 = next(rule for rule in status["rules"] if rule["rule_id"] == "ENV_CO2_NOMINAL_V1")
    return run, co2


def test_co2_card_shows_live_situation(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    _, co2 = run_co2(client)
    situation = co2["situation"]
    facts = " | ".join(situation["facts_tr"])

    assert co2["action_card"]["card_id"] == "ENV_CO2_WATCH_CARD_V2"
    assert "Measured:" in facts and "mmHg" in facts
    assert "This condition has lasted" in facts
    # The second module stays nominal, so the rise looks local.
    assert "iss-harmony-node2" in facts
    assert "local accumulation" in facts
    assert "pain 2/4" in facts
    assert "Completed steps: 0/4" in facts
    assert situation["alert_id"] is not None
    assert situation["level_since"] is not None
    level_since = datetime.fromisoformat(situation["level_since"])
    reassess_at = datetime.fromisoformat(situation["reassess_at"])
    assert (reassess_at - level_since).total_seconds() == 30 * 60


def test_marking_steps_is_recorded_idempotent_and_moves_the_timer(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    run, co2 = run_co2(client)
    alert_id = co2["situation"]["alert_id"]

    first = client.post(
        f"/v1/alerts/{alert_id}/steps",
        json={"crew_member_id": "crew-01", "step_key": "check_airflow"},
    )
    again = client.post(
        f"/v1/alerts/{alert_id}/steps",
        json={"crew_member_id": "crew-02", "step_key": "check_airflow"},
    )
    unknown = client.post(
        f"/v1/alerts/{alert_id}/steps",
        json={"crew_member_id": "crew-01", "step_key": "take_medicine"},
    )

    assert first.status_code == 200
    assert first.json()["completed_step_keys"] == ["check_airflow"]
    assert again.json()["completed_step_keys"] == ["check_airflow"]
    assert unknown.status_code == 422

    status = client.get(
        f"/v1/crew/{run['crew_member_id']}/status",
        params={
            "mission_id": run["mission_id"],
            "environment_target_id": run["environment_target_id"],
        },
    ).json()
    situation = next(
        rule for rule in status["rules"] if rule["rule_id"] == "ENV_CO2_NOMINAL_V1"
    )["situation"]
    [done] = situation["completed_steps"]
    assert done["step_key"] == "check_airflow"
    assert done["crew_member_id"] == "crew-01"
    assert any("Completed steps: 1/4" in fact for fact in situation["facts_tr"])
    # The reassessment timer restarts from the last completed step.
    assert situation["reassess_at"] > co2["situation"]["reassess_at"]


def test_steps_cannot_be_marked_on_unknown_or_resolved_alerts(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    missing = client.post(
        f"/v1/alerts/{uuid4()}/steps",
        json={"crew_member_id": "crew-01", "step_key": "check_airflow"},
    )
    flag = client.post(
        "/v1/red-flags",
        json={
            "mission_id": "m-steps",
            "crew_member_id": "crew-01",
            "flags": ["CHEST_PAIN"],
            "observed_at": "2026-11-14T10:00:00Z",
            "source_type": "MANUAL",
            "source_id": "dashboard-user",
        },
    ).json()
    client.post(f"/v1/alerts/{flag['alert_id']}/resolve", json={"crew_member_id": "medic"})
    resolved = client.post(
        f"/v1/alerts/{flag['alert_id']}/steps",
        json={"crew_member_id": "crew-01", "step_key": "call_crew"},
    )

    assert missing.status_code == 404
    assert resolved.status_code == 409


def test_red_flag_situation_has_no_measurement_line(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    response = client.post(
        "/v1/red-flags",
        json={
            "mission_id": "m-red",
            "crew_member_id": "crew-01",
            "flags": ["CHEST_PAIN"],
            "observed_at": "2026-11-14T10:00:00Z",
            "source_type": "MANUAL",
            "source_id": "dashboard-user",
        },
    ).json()
    facts = response["evaluation"]["situation"]["facts_tr"]

    assert not any(fact.startswith("Measured:") for fact in facts)
    assert any("No subjective check-in in the last 4 hours" in fact for fact in facts)
    assert response["evaluation"]["action_card"]["reassess_minutes"] == 5
