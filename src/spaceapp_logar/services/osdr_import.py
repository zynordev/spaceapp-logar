"""Import real Inspiration4 lab values from NASA OSDR (OSD-569 CBC, OSD-575 CMP).

The submitted long-format files carry explicit units, so they are used as the
source of truth (this also confirms that CBC hemoglobin is g/dL, resolving the
"percent" label question in docs/MVP_INDICATORS.md).

OSDR only gives relative day labels (L-92 = 92 days before launch, R+45 = 45
days after return). Calendar dates are reconstructed from the Inspiration4
launch (2021-09-16) and splashdown (2021-09-18) dates at 12:00 UTC; the time
of day is an approximation. Real data is kept in its own mission id and never
mixed with synthetic demo data. Re-running the import adds nothing twice and
never deletes anything.

Usage: ``uv run python -m spaceapp_logar.services.osdr_import``
"""

import csv
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import LabResult
from spaceapp_logar.schemas.lab_results import LabResultCreate

MISSION_ID = "osdr-inspiration4"
LAUNCH = datetime(2021, 9, 16, 12, 0, tzinfo=timezone.utc)
RETURN = datetime(2021, 9, 18, 12, 0, tzinfo=timezone.utc)
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "osdr"

SOURCES = (
    ("OSD-569", "LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv", "TEST_DATE"),
    ("OSD-575", "LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv", "timepoint"),
)

# OSDR analyte name + unit -> (our analyte, our unit)
ANALYTE_MAP: dict[tuple[str, str], tuple[str, str]] = {
    ("WHITE BLOOD CELL COUNT", "Thousand/uL"): ("WBC", "10^3/uL"),
    ("PLATELET COUNT", "Thousand/uL"): ("PLATELETS", "10^3/uL"),
    ("HEMOGLOBIN", "g/dL"): ("HEMOGLOBIN", "g/dL"),
    ("HEMOGLOBIN (FEMALE)", "g/dL"): ("HEMOGLOBIN", "g/dL"),
    ("GLUCOSE", "mg/dL"): ("GLUCOSE", "mg/dL"),
    ("CREATININE", "mg/dL"): ("CREATININE", "mg/dL"),
    ("SODIUM", "mmol/L"): ("SODIUM", "mmol/L"),
    ("POTASSIUM", "mmol/L"): ("POTASSIUM", "mmol/L"),
    ("ALT", "U/L"): ("ALT", "U/L"),
    ("AST", "U/L"): ("AST", "U/L"),
}

TIMEPOINT = re.compile(r"^(?P<kind>[LR])(?P<sign>[+-])(?P<days>\d+)$")


@dataclass(frozen=True, slots=True)
class ImportSummary:
    mission_id: str
    imported: int
    skipped_existing: int
    skipped_unusable: int
    crew_member_ids: tuple[str, ...]


def timepoint_to_datetime(label: str) -> tuple[datetime, str] | None:
    match = TIMEPOINT.match(label.strip())
    if match is None:
        return None
    days = int(match["days"]) * (1 if match["sign"] == "+" else -1)
    if match["kind"] == "L":
        return LAUNCH + timedelta(days=days), "PRE_FLIGHT"
    return RETURN + timedelta(days=days), "POST_FLIGHT"


def _number(text: str) -> float | None:
    try:
        return float(text.strip())
    except (AttributeError, ValueError):
        return None


def read_osdr_rows(data_dir: Path = DEFAULT_DATA_DIR) -> tuple[list[LabResultCreate], int]:
    rows: list[LabResultCreate] = []
    unusable = 0
    for dataset_id, file_name, date_column in SOURCES:
        with (data_dir / file_name).open(newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                key = (row["ANALYTE"].strip(), row["UNITS"].strip())
                if key not in ANALYTE_MAP:
                    continue
                analyte, unit = ANALYTE_MAP[key]
                value = _number(row["VALUE"])
                low = _number(row["RANGE_MIN"])
                high = _number(row["RANGE_MAX"])
                when = timepoint_to_datetime(row[date_column])
                if value is None or low is None or high is None or when is None:
                    unusable += 1
                    continue
                sampled_at, phase = when
                rows.append(
                    LabResultCreate(
                        mission_id=MISSION_ID,
                        crew_member_id=row["SUBJECT_ID"].strip(),
                        analyte=analyte,
                        value=value,
                        unit=unit,
                        reference_low=low,
                        reference_high=high,
                        phase=phase,
                        sampled_at=sampled_at,
                        source_type="OSDR",
                        source_id=dataset_id,
                    )
                )
    return rows, unusable


def import_osdr_labs(session: Session, data_dir: Path = DEFAULT_DATA_DIR) -> ImportSummary:
    rows, unusable = read_osdr_rows(data_dir)
    existing = {
        (r.crew_member_id, r.analyte, r.sampled_at, r.source_id)
        for r in session.scalars(
            select(LabResult).where(LabResult.mission_id == MISSION_ID)
        ).all()
    }
    imported = 0
    skipped = 0
    for lab in rows:
        key = (lab.crew_member_id, lab.analyte.value, lab.sampled_at, lab.source_id)
        if key in existing:
            skipped += 1
            continue
        existing.add(key)
        session.add(
            LabResult(
                mission_id=lab.mission_id,
                crew_member_id=lab.crew_member_id,
                analyte=lab.analyte.value,
                value=lab.value,
                unit=lab.unit.value,
                reference_low=lab.reference_low,
                reference_high=lab.reference_high,
                phase=lab.phase.value,
                sampled_at=lab.sampled_at,
                source_type=lab.source_type.value,
                source_id=lab.source_id,
                scenario_id=None,
            )
        )
        imported += 1
    session.commit()
    return ImportSummary(
        mission_id=MISSION_ID,
        imported=imported,
        skipped_existing=skipped,
        skipped_unusable=unusable,
        crew_member_ids=tuple(sorted({lab.crew_member_id for lab in rows})),
    )


if __name__ == "__main__":
    from spaceapp_logar.db.session import SessionFactory

    with SessionFactory() as db_session:
        summary = import_osdr_labs(db_session)
    print(
        f"{summary.mission_id}: {summary.imported} imported, "
        f"{summary.skipped_existing} already present, "
        f"{summary.skipped_unusable} unusable rows skipped; "
        f"crew {', '.join(summary.crew_member_ids)}"
    )
