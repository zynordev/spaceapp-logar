from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Engine

from spaceapp_logar.services.osdr_import import read_osdr_rows, timepoint_to_datetime


@pytest.mark.parametrize(
    ("label", "expected", "phase"),
    [
        ("L-92", datetime(2021, 6, 16, 12, tzinfo=timezone.utc), "PRE_FLIGHT"),
        ("L-3", datetime(2021, 9, 13, 12, tzinfo=timezone.utc), "PRE_FLIGHT"),
        ("R+1", datetime(2021, 9, 19, 12, tzinfo=timezone.utc), "POST_FLIGHT"),
        ("R+194", datetime(2022, 3, 31, 12, tzinfo=timezone.utc), "POST_FLIGHT"),
    ],
)
def test_timepoint_labels(label: str, expected: datetime, phase: str) -> None:
    assert timepoint_to_datetime(label) == (expected, phase)


def test_unknown_timepoint_is_rejected() -> None:
    assert timepoint_to_datetime("FD2") is None


def test_bundled_files_parse_with_real_units() -> None:
    rows, _ = read_osdr_rows()

    analytes = {row.analyte.value for row in rows}
    assert analytes == {
        "WBC",
        "PLATELETS",
        "HEMOGLOBIN",
        "GLUCOSE",
        "CREATININE",
        "SODIUM",
        "POTASSIUM",
        "ALT",
        "AST",
    }
    assert {row.crew_member_id for row in rows} == {"C001", "C002", "C003", "C004"}
    assert all(row.source_type.value == "OSDR" for row in rows)
    hemoglobin = [row for row in rows if row.analyte.value == "HEMOGLOBIN"]
    assert {row.unit.value for row in hemoglobin} == {"g/dL"}
    assert all(row.source_id in {"OSD-569", "OSD-575"} for row in rows)


def test_import_is_idempotent_and_feeds_the_lab_panel(
    api_client: tuple[TestClient, Engine],
) -> None:
    client, _ = api_client

    first = client.post("/v1/demo/osdr-labs/import").json()
    second = client.post("/v1/demo/osdr-labs/import").json()
    panel = client.get(
        "/v1/crew/C001/lab-results", params={"mission_id": "osdr-inspiration4"}
    ).json()
    missions = {m["mission_id"]: m for m in client.get("/v1/missions").json()}

    assert first["imported"] > 200
    assert second["imported"] == 0
    assert second["skipped_existing"] == first["imported"]
    assert missions["osdr-inspiration4"]["crew_member_ids"] == [
        "C001",
        "C002",
        "C003",
        "C004",
    ]
    glucose = next(item for item in panel["results"] if item["analyte"] == "GLUCOSE")
    assert glucose["source_type"] == "OSDR"
    assert glucose["source_id"] == "OSD-575"
    assert glucose["phase"] == "POST_FLIGHT"
    assert glucose["baseline_value"] is not None

    # A lab-only mission has no environment target; status must still work.
    status = client.get(
        "/v1/crew/C001/status", params={"mission_id": "osdr-inspiration4"}
    )
    assert status.status_code == 200
    assert status.json()["rules"] == []
    assert status.json()["overall_attention"] == "UNKNOWN"
