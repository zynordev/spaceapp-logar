from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

MISSION = "mission-r"
CREW = "crew-r"
ANCHOR = datetime(2026, 11, 10, 0, 0, tzinfo=timezone.utc)
FORBIDDEN_WORDS = ("ilaç", "ilac", "medic", "drug", "tablet", "doz", "paracetamol")


def iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


def make_schedule(client: TestClient, kind: str = "HYDRATION", interval: int = 60) -> dict:
    response = client.post(
        "/v1/routines",
        json={
            "mission_id": MISSION,
            "crew_member_id": CREW,
            "kind": kind,
            "interval_minutes": interval,
            "anchor_at": iso(ANCHOR),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def due(client: TestClient, at: datetime) -> list[dict]:
    response = client.get(
        "/v1/routines/due",
        params={"mission_id": MISSION, "crew_member_id": CREW, "at": iso(at)},
    )
    assert response.status_code == 200, response.text
    return response.json()


def complete(client: TestClient, schedule_id: str, at: datetime):
    return client.post(
        f"/v1/routines/{schedule_id}/complete",
        json={"crew_member_id": CREW, "completed_at": iso(at)},
    )


def test_catalog_is_fixed_and_has_no_medication(api_client) -> None:
    client, _ = api_client
    items = client.get("/v1/routines/catalog").json()

    assert {item["kind"] for item in items} == {
        "HYDRATION",
        "EXERCISE",
        "SLEEP_WINDOW",
        "CHECK_IN",
        "BODY_MASS_WEEKLY",
        "GRIP_STRENGTH_WEEKLY",
        "MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY",
    }
    for item in items:
        assert item["evidence"] == "DEMO"
        assert "görev planı yerine geçmez" in item["description_tr"]
        assert 30 <= item["default_interval_minutes"] <= 20160
        text = (item["kind"] + item["title_tr"] + item["description_tr"]).lower()
        assert not any(word in text for word in FORBIDDEN_WORDS)
    categories = {item["kind"]: item["category"] for item in items}
    assert categories["HYDRATION"] == "DAILY"
    assert categories["BODY_MASS_WEEKLY"] == "PERIODIC_TEST"


def test_defaults_are_idempotent(api_client) -> None:
    client, _ = api_client
    body = {"mission_id": MISSION, "crew_member_id": CREW}
    first = client.post("/v1/routines/defaults", json=body)
    second = client.post("/v1/routines/defaults", json=body)

    assert first.status_code == second.status_code == 201
    assert len(first.json()) == 7
    assert {s["id"] for s in first.json()} == {s["id"] for s in second.json()}
    listed = client.get(
        "/v1/routines/due", params={"mission_id": MISSION, "crew_member_id": CREW}
    ).json()
    assert len(listed) == 7


def test_due_states_with_fixed_time(api_client) -> None:
    client, _ = api_client
    make_schedule(client)  # interval 60 -> DUE window is 15 minutes

    assert due(client, ANCHOR - timedelta(hours=1))[0]["state"] == "UPCOMING"
    assert due(client, ANCHOR)[0]["state"] == "DUE"
    assert due(client, ANCHOR + timedelta(minutes=14))[0]["state"] == "DUE"
    overdue = due(client, ANCHOR + timedelta(minutes=15))[0]
    assert overdue["state"] == "OVERDUE"
    assert overdue["next_due_at"] == iso(ANCHOR)
    assert overdue["last_completed_at"] is None


def test_due_sorted_overdue_due_upcoming(api_client) -> None:
    client, _ = api_client
    make_schedule(client, "HYDRATION", 60)  # overdue at the probe time
    late = client.post(
        "/v1/routines",
        json={
            "mission_id": MISSION,
            "crew_member_id": CREW,
            "kind": "EXERCISE",
            "interval_minutes": 60,
            "anchor_at": iso(ANCHOR + timedelta(hours=2)),
        },
    ).json()
    soon = client.post(
        "/v1/routines",
        json={
            "mission_id": MISSION,
            "crew_member_id": CREW,
            "kind": "SLEEP_WINDOW",
            "interval_minutes": 60,
            "anchor_at": iso(ANCHOR + timedelta(minutes=70)),
        },
    ).json()

    items = due(client, ANCHOR + timedelta(minutes=75))
    assert [i["state"] for i in items] == ["OVERDUE", "DUE", "UPCOMING"]
    assert items[1]["schedule"]["id"] == soon["id"]
    assert items[2]["schedule"]["id"] == late["id"]


def test_completion_moves_next_due(api_client) -> None:
    client, _ = api_client
    schedule = make_schedule(client)
    completed_at = ANCHOR + timedelta(minutes=10)

    response = complete(client, schedule["id"], completed_at)

    assert response.status_code == 201
    body = response.json()
    assert body["state"] == "UPCOMING"
    assert body["next_due_at"] == iso(ANCHOR + timedelta(hours=1))
    assert body["last_completed_at"] == iso(completed_at)
    assert body["current_streak"] == 1


def test_early_completion_counts_for_upcoming_slot(api_client) -> None:
    client, _ = api_client
    schedule = make_schedule(client)

    body = complete(client, schedule["id"], ANCHOR - timedelta(minutes=20)).json()

    assert body["next_due_at"] == iso(ANCHOR + timedelta(hours=1))
    assert body["current_streak"] == 1


def test_streak_counts_and_missed_slot_resets_current(api_client) -> None:
    client, _ = api_client
    schedule = make_schedule(client)
    sid = schedule["id"]

    complete(client, sid, ANCHOR + timedelta(minutes=5))  # slot 0
    body = complete(client, sid, ANCHOR + timedelta(minutes=65)).json()  # slot 1
    assert (body["current_streak"], body["best_streak"]) == (2, 2)

    # Slot 2 (02:00-03:00) is never completed; slot 3 is open at 03:20.
    item = due(client, ANCHOR + timedelta(minutes=200))[0]
    assert item["current_streak"] == 0
    assert item["best_streak"] == 2
    assert item["state"] == "OVERDUE"

    body = complete(client, sid, ANCHOR + timedelta(minutes=190)).json()  # slot 3
    assert (body["current_streak"], body["best_streak"]) == (1, 2)
    body = complete(client, sid, ANCHOR + timedelta(minutes=250)).json()  # slot 4
    assert (body["current_streak"], body["best_streak"]) == (2, 2)
    body = complete(client, sid, ANCHOR + timedelta(minutes=310)).json()  # slot 5
    assert (body["current_streak"], body["best_streak"]) == (3, 3)


def test_not_found_and_validation_errors(api_client) -> None:
    client, _ = api_client

    missing = client.post(
        f"/v1/routines/{uuid4()}/complete", json={"crew_member_id": CREW}
    )
    assert missing.status_code == 404

    schedule = make_schedule(client)
    assert (
        client.post(f"/v1/routines/{schedule['id']}/complete", json={}).status_code
        == 422
    )
    assert (
        client.post(
            f"/v1/routines/{schedule['id']}/complete", json={"crew_member_id": "other"}
        ).status_code
        == 403
    )

    base = {"mission_id": MISSION, "crew_member_id": CREW}
    for bad in (
        {**base, "kind": "PARACETAMOL"},
        {**base, "kind": "HYDRATION", "interval_minutes": 10},
        {**base, "kind": "HYDRATION", "interval_minutes": 20161},
        {**base, "kind": "HYDRATION", "note": "free text"},
        {**base, "kind": "HYDRATION", "anchor_at": "2026-11-10T00:00:00"},
    ):
        assert client.post("/v1/routines", json=bad).status_code == 422
    assert client.get("/v1/routines/due", params={"mission_id": MISSION}).status_code == 422


def test_second_completion_in_same_window_fills_nothing(api_client) -> None:
    client, _ = api_client
    schedule = make_schedule(client)
    first = complete(client, schedule["id"], ANCHOR + timedelta(minutes=10)).json()
    second = complete(client, schedule["id"], ANCHOR + timedelta(minutes=20)).json()

    assert second["current_streak"] == 1
    assert second["best_streak"] == 1
    assert second["next_due_at"] == first["next_due_at"]


def test_future_completed_at_is_rejected(api_client) -> None:
    client, _ = api_client
    schedule = make_schedule(client)
    future = datetime.now(timezone.utc) + timedelta(hours=1)

    assert complete(client, schedule["id"], future).status_code == 422
