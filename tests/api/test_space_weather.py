"""Real NASA DONKI event timing and the radiation scenario anchored to it."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import Observation
from spaceapp_logar.services.demo_scenarios import (
    RADIATION_ONSET_MINUTE,
    RADIATION_SOURCE_ID,
    REAL_MINUTES_PER_SCENARIO_MINUTE,
    radiation_anchor_minutes,
)
from spaceapp_logar.services.space_weather import (
    GOES_10_MEV_SEP_ID,
    GOES_100_MEV_SEP_ID,
    PROVENANCE_NOTE_TR,
    load_sep_catalog,
)


def test_loader_parses_committed_file() -> None:
    catalog = load_sep_catalog("2024-05")

    assert len(catalog.events) == 14
    assert catalog.source["licence"] == "NASA DONKI public data"
    assert "api_key" not in catalog.source["url"]
    assert "no flux or dose values" in catalog.source["note"]
    assert catalog.event(GOES_10_MEV_SEP_ID).event_time == datetime(
        2024, 5, 10, 13, 35, tzinfo=timezone.utc
    )
    assert catalog.event(GOES_100_MEV_SEP_ID).event_time == datetime(
        2024, 5, 11, 2, 10, tzinfo=timezone.utc
    )


def test_events_endpoint_returns_events_with_source(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client
    response = client.get("/v1/space-weather/events", params={"month": "2024-05"})

    assert response.status_code == 200
    body = response.json()
    assert len(body["events"]) == 14
    assert body["source"]["licence"] == "NASA DONKI public data"
    assert body["provenance_note"] == PROVENANCE_NOTE_TR
    assert any("GOES-P: SEISS >10 MeV" in e["instruments"] for e in body["events"])


def test_events_endpoint_rejects_unbundled_month(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client

    assert client.get("/v1/space-weather/events", params={"month": "2023-01"}).status_code == 404
    assert client.get("/v1/space-weather/events", params={"month": "bad"}).status_code == 422


def test_anchor_mapping_is_derived_from_real_timing() -> None:
    onset_10, onset_100 = radiation_anchor_minutes()

    assert onset_10 == RADIATION_ONSET_MINUTE == 100
    assert onset_100 == 120
    # 13:35Z -> 02:10Z next day is 755 real minutes.
    assert abs((onset_100 - onset_10) * REAL_MINUTES_PER_SCENARIO_MINUTE - 755) < 1


def test_scenario_listing_and_run_state_provenance(api_client: tuple[TestClient, Engine]) -> None:
    client, _ = api_client
    scenarios = {s["scenario_id"]: s for s in client.get("/v1/demo/scenarios").json()}
    others = [s for sid, s in scenarios.items() if sid != "radiation-spe"]

    assert PROVENANCE_NOTE_TR in scenarios["radiation-spe"]["description"]
    assert PROVENANCE_NOTE_TR in scenarios["radiation-spe"]["expected"]
    assert not any("DONKI" in s["description"] for s in others)

    run = client.post("/v1/demo/scenarios/radiation-spe/run").json()
    assert PROVENANCE_NOTE_TR in run["summary"]


def test_radiation_run_rise_starts_at_real_onset_offset(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, engine = api_client
    run = client.post("/v1/demo/scenarios/radiation-spe/run").json()
    mission_id = run["mission_id"]

    with Session(engine) as session:
        start = session.scalar(
            select(func.min(Observation.observed_at)).where(Observation.mission_id == mission_id)
        )
        radiation = session.scalars(
            select(Observation)
            .where(Observation.mission_id == mission_id)
            .where(Observation.metric == "RADIATION_DOSE_RATE")
            .order_by(Observation.observed_at)
        ).all()
        other_sources = session.scalars(
            select(Observation.source_id)
            .where(Observation.mission_id == mission_id)
            .where(Observation.metric != "RADIATION_DOSE_RATE")
            .distinct()
        ).all()

    assert {o.source_id for o in radiation} == {RADIATION_SOURCE_ID}
    assert RADIATION_SOURCE_ID not in other_sources

    def at(minute: int) -> float:
        return radiation[minute].value

    # Flat baseline until the real >10 MeV onset offset (scenario minute 100),
    # first step at minute 100, second step at the >100 MeV offset (minute 120).
    assert all(at(m) < 30 for m in range(0, 100))
    assert at(105) > 40
    assert at(119) > 80
    assert at(130) > 200
    assert at(160) > 350

    alerts = client.get("/v1/alerts", params={"mission_id": mission_id}).json()
    [alert] = [a for a in alerts if a["rule_id"] == "ENV_RADIATION_V1"]
    opened_offset = datetime.fromisoformat(alert["opened_at"].replace("Z", "+00:00")) - start.replace(
        tzinfo=timezone.utc
    )
    # The WATCH alert opens after the real >10 MeV onset offset and before the
    # >100 MeV offset; it escalates after that second step.
    assert timedelta(minutes=RADIATION_ONSET_MINUTE) < opened_offset
    assert opened_offset <= timedelta(minutes=radiation_anchor_minutes()[1] + 5)
