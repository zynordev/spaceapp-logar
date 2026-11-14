import pytest

from spaceapp_logar.schemas.measurements import MeasurementCreate, Metric
from spaceapp_logar.schemas.observations import SourceType, TargetType
from spaceapp_logar.services.adapters import AdapterError, CsvTelemetryAdapter, parse_csv_text

HEADER = "timestamp,mission_id,target_id,metric,value,unit,quality,activity\n"


def adapter() -> CsvTelemetryAdapter:
    return CsvTelemetryAdapter(SourceType.SENSOR, "wearable-01")


def test_good_rows_become_measurements() -> None:
    text = HEADER + (
        "2026-11-14T08:00:00Z,m1,crew-01,HEART_RATE,70,bpm,VALID,REST\n"
        "2026-11-14T08:00:00+03:00,m1,cabin,CABIN_CO2_PARTIAL_PRESSURE,2.5,mmHg,,\n"
    )

    results = parse_csv_text(adapter(), text)

    assert all(isinstance(r, MeasurementCreate) for r in results)
    hr, co2 = results
    assert hr.target_type is TargetType.CREW_MEMBER
    assert co2.target_type is TargetType.ENVIRONMENT
    assert co2.metric is Metric.CABIN_CO2_PARTIAL_PRESSURE
    assert co2.observed_at.utcoffset().total_seconds() == 0
    assert hr.source_id == "wearable-01" and hr.scenario_id is None


@pytest.mark.parametrize(
    ("row", "reason"),
    [
        ("2026-11-14T08:00:00Z,m1,crew-01,HEART_RATE,70,kPa,VALID,REST", "unit"),
        ("yesterday,m1,crew-01,HEART_RATE,70,bpm,VALID,REST", "timestamp"),
        ("2026-11-14T08:00:00Z,m1,crew-01,MOOD,70,bpm,VALID,REST", "unknown metric"),
        ("2026-11-14T08:00:00,m1,crew-01,HEART_RATE,70,bpm,VALID,REST", "timezone"),
        ("2026-11-14T08:00:00Z,m1,crew-01,HEART_RATE,abc,bpm,VALID,REST", "number"),
    ],
)
def test_bad_rows_become_adapter_errors(row: str, reason: str) -> None:
    (result,) = parse_csv_text(adapter(), HEADER + row + "\n")

    assert isinstance(result, AdapterError)
    assert reason in result.reason
    assert result.record_index == 0


def test_synthetic_source_requires_scenario_id() -> None:
    with pytest.raises(ValueError):
        CsvTelemetryAdapter(SourceType.SYNTHETIC, "sim-01")

    synthetic = CsvTelemetryAdapter(SourceType.SYNTHETIC, "sim-01", scenario_id="s1")
    (result,) = parse_csv_text(
        synthetic, HEADER + "2026-11-14T08:00:00Z,m1,crew-01,HEART_RATE,70,bpm,VALID,REST\n"
    )
    assert isinstance(result, MeasurementCreate)
    assert result.scenario_id == "s1"
