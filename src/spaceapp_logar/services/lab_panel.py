from collections import defaultdict

from spaceapp_logar.db.models import LabResult
from spaceapp_logar.schemas.lab_results import (
    LabAnalyte,
    LabAnalyteSummary,
    LabUnit,
    ReferencePosition,
    SamplePhase,
)
from spaceapp_logar.schemas.observations import SourceType


def reference_position(result: LabResult) -> ReferencePosition:
    if result.value < result.reference_low:
        return ReferencePosition.BELOW
    if result.value > result.reference_high:
        return ReferencePosition.ABOVE
    return ReferencePosition.WITHIN


def build_lab_panel(results: list[LabResult]) -> list[LabAnalyteSummary]:
    """Summarize the latest value per analyte with change context.

    Changes are only computed between results that share the same unit, so a
    unit switch never produces a misleading difference. The baseline is the
    most recent earlier PRE_FLIGHT sample of the same analyte and unit.
    """

    by_analyte: dict[str, list[LabResult]] = defaultdict(list)
    for result in results:
        by_analyte[result.analyte].append(result)

    summaries: list[LabAnalyteSummary] = []
    for analyte in LabAnalyte:
        series = sorted(
            by_analyte.get(analyte.value, []),
            key=lambda item: (item.sampled_at, item.ingested_at),
        )
        if not series:
            continue
        latest = series[-1]
        earlier_same_unit = [
            item
            for item in series[:-1]
            if item.unit == latest.unit and item.sampled_at < latest.sampled_at
        ]
        previous = earlier_same_unit[-1] if earlier_same_unit else None
        baselines = [
            item
            for item in earlier_same_unit
            if item.phase == SamplePhase.PRE_FLIGHT.value
        ]
        baseline = baselines[-1] if baselines else None

        summaries.append(
            LabAnalyteSummary(
                analyte=analyte,
                unit=LabUnit(latest.unit),
                value=latest.value,
                reference_low=latest.reference_low,
                reference_high=latest.reference_high,
                position_vs_reference=reference_position(latest),
                phase=SamplePhase(latest.phase),
                sampled_at=latest.sampled_at,
                source_type=SourceType(latest.source_type),
                source_id=latest.source_id,
                previous_value=previous.value if previous else None,
                previous_sampled_at=previous.sampled_at if previous else None,
                change_from_previous=(
                    latest.value - previous.value if previous else None
                ),
                baseline_value=baseline.value if baseline else None,
                baseline_sampled_at=baseline.sampled_at if baseline else None,
                change_from_baseline=(
                    latest.value - baseline.value if baseline else None
                ),
            )
        )
    return summaries
