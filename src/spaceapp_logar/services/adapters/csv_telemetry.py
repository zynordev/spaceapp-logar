import csv
import io
from collections.abc import Mapping
from datetime import datetime

from pydantic import ValidationError

from spaceapp_logar.schemas.measurements import METRIC_SPECS, MeasurementCreate, Metric
from spaceapp_logar.schemas.observations import SourceType
from spaceapp_logar.services.adapters.base import AdapterError, AdapterResult

REQUIRED_COLUMNS = ("timestamp", "mission_id", "target_id", "metric", "value", "unit")


def _clean(row: Mapping[str, str | None], key: str) -> str:
    return (row.get(key) or "").strip()


class CsvTelemetryAdapter:
    """Reads telemetry CSV rows.

    Columns: timestamp,mission_id,target_id,metric,value,unit,quality,activity.
    The target type comes from the metric catalog; source identity is fixed
    per adapter instance.
    """

    def __init__(
        self,
        source_type: SourceType,
        source_id: str,
        scenario_id: str | None = None,
    ) -> None:
        if source_type is SourceType.SYNTHETIC and not scenario_id:
            raise ValueError("scenario_id is required for SYNTHETIC sources")
        self.source_type = source_type
        self.source_id = source_id
        self.scenario_id = scenario_id if source_type is SourceType.SYNTHETIC else None

    def parse(
        self, record: Mapping[str, str | None], index: int | None = None
    ) -> AdapterResult:
        missing = [column for column in REQUIRED_COLUMNS if not _clean(record, column)]
        if missing:
            return AdapterError(f"missing column(s): {', '.join(missing)}", index)
        raw_metric = _clean(record, "metric")
        try:
            metric = Metric(raw_metric)
        except ValueError:
            return AdapterError(f"unknown metric: {raw_metric[:50]}", index)
        try:
            observed_at = datetime.fromisoformat(_clean(record, "timestamp"))
        except ValueError:
            return AdapterError("invalid timestamp (expected ISO 8601)", index)
        try:
            value = float(_clean(record, "value"))
        except ValueError:
            return AdapterError("value is not a number", index)
        try:
            return MeasurementCreate(
                mission_id=_clean(record, "mission_id"),
                target_type=METRIC_SPECS[metric].target_type,
                target_id=_clean(record, "target_id"),
                metric=metric,
                value=value,
                unit=_clean(record, "unit"),
                observed_at=observed_at,
                source_type=self.source_type,
                source_id=self.source_id,
                scenario_id=self.scenario_id,
                reported_quality=_clean(record, "quality") or "VALID",
                activity_state=_clean(record, "activity") or None,
            )
        except ValidationError as exc:
            reasons = "; ".join(err["msg"] for err in exc.errors(include_url=False))
            return AdapterError(reasons, index)


def parse_csv_text(adapter: CsvTelemetryAdapter, text: str) -> list[AdapterResult]:
    """Parse every data row of a CSV document (header row required)."""

    reader = csv.DictReader(io.StringIO(text))
    return [adapter.parse(row, index) for index, row in enumerate(reader)]
