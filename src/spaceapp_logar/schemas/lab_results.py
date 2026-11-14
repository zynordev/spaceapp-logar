import re
from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from spaceapp_logar.schemas.observations import Identifier, SourceType


class LabAnalyte(StrEnum):
    """Core periodic laboratory measurements of the MVP lab card."""

    GLUCOSE = "GLUCOSE"
    SODIUM = "SODIUM"
    POTASSIUM = "POTASSIUM"
    CREATININE = "CREATININE"
    WBC = "WBC"
    HEMOGLOBIN = "HEMOGLOBIN"
    PLATELETS = "PLATELETS"
    ALT = "ALT"
    AST = "AST"


class LabUnit(StrEnum):
    MG_PER_DL = "mg/dL"
    MMOL_PER_L = "mmol/L"
    MEQ_PER_L = "mEq/L"
    UMOL_PER_L = "umol/L"
    THOUSAND_PER_UL = "10^3/uL"
    E9_PER_L = "10^9/L"
    G_PER_DL = "g/dL"
    G_PER_L = "g/L"
    U_PER_L = "U/L"


# Units that are unambiguous for each analyte. Hemoglobin deliberately has no
# percent unit: docs/MVP_INDICATORS.md says the OSD-569 percent label must be
# verified against the original dataset before it is used.
ALLOWED_UNITS: dict[LabAnalyte, frozenset[LabUnit]] = {
    LabAnalyte.GLUCOSE: frozenset({LabUnit.MG_PER_DL, LabUnit.MMOL_PER_L}),
    LabAnalyte.SODIUM: frozenset({LabUnit.MMOL_PER_L, LabUnit.MEQ_PER_L}),
    LabAnalyte.POTASSIUM: frozenset({LabUnit.MMOL_PER_L, LabUnit.MEQ_PER_L}),
    LabAnalyte.CREATININE: frozenset({LabUnit.MG_PER_DL, LabUnit.UMOL_PER_L}),
    LabAnalyte.WBC: frozenset({LabUnit.THOUSAND_PER_UL, LabUnit.E9_PER_L}),
    LabAnalyte.HEMOGLOBIN: frozenset({LabUnit.G_PER_DL, LabUnit.G_PER_L}),
    LabAnalyte.PLATELETS: frozenset({LabUnit.THOUSAND_PER_UL, LabUnit.E9_PER_L}),
    LabAnalyte.ALT: frozenset({LabUnit.U_PER_L}),
    LabAnalyte.AST: frozenset({LabUnit.U_PER_L}),
}

OSDR_DATASET_PATTERN = re.compile(r"^OSD-\d+$")

NonNegativeFinite = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class SamplePhase(StrEnum):
    PRE_FLIGHT = "PRE_FLIGHT"
    IN_FLIGHT = "IN_FLIGHT"
    POST_FLIGHT = "POST_FLIGHT"


class LabResultCreate(BaseModel):
    """One periodic laboratory value with the reference range from its source."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        from_attributes=True,
    )

    mission_id: Identifier
    crew_member_id: Identifier
    analyte: LabAnalyte
    value: NonNegativeFinite
    unit: LabUnit
    reference_low: NonNegativeFinite
    reference_high: NonNegativeFinite
    phase: SamplePhase
    sampled_at: datetime
    source_type: Literal[SourceType.MANUAL, SourceType.OSDR, SourceType.SYNTHETIC]
    source_id: Identifier
    scenario_id: Identifier | None = None

    @field_validator("sampled_at")
    @classmethod
    def normalize_sampled_at_to_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("sampled_at must include a timezone")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_unit_range_and_provenance(self) -> Self:
        if self.unit not in ALLOWED_UNITS[self.analyte]:
            allowed = ", ".join(sorted(unit.value for unit in ALLOWED_UNITS[self.analyte]))
            raise ValueError(
                f"unit {self.unit.value} is not allowed for {self.analyte.value}; "
                f"allowed: {allowed}"
            )
        if self.reference_low > self.reference_high:
            raise ValueError("reference_low must not exceed reference_high")
        if self.source_type is SourceType.SYNTHETIC and self.scenario_id is None:
            raise ValueError("scenario_id is required for synthetic lab results")
        if self.source_type is not SourceType.SYNTHETIC and self.scenario_id is not None:
            raise ValueError("scenario_id is only allowed for synthetic lab results")
        if self.source_type is SourceType.OSDR and not OSDR_DATASET_PATTERN.match(
            self.source_id
        ):
            raise ValueError("OSDR source_id must be a dataset id such as OSD-569")
        return self


class LabResultRead(LabResultCreate):
    id: UUID
    ingested_at: datetime

    @field_validator("ingested_at")
    @classmethod
    def normalize_ingested_at_to_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("ingested_at must include a timezone")
        return value.astimezone(timezone.utc)


class ReferencePosition(StrEnum):
    """Where a value sits relative to the source-provided reference range."""

    BELOW = "BELOW"
    WITHIN = "WITHIN"
    ABOVE = "ABOVE"


class LabAnalyteSummary(BaseModel):
    analyte: LabAnalyte
    unit: LabUnit
    value: float
    reference_low: float
    reference_high: float
    position_vs_reference: ReferencePosition
    phase: SamplePhase
    sampled_at: datetime
    source_type: SourceType
    source_id: str
    previous_value: float | None
    previous_sampled_at: datetime | None
    change_from_previous: float | None
    baseline_value: float | None
    baseline_sampled_at: datetime | None
    change_from_baseline: float | None


class LabPanelRead(BaseModel):
    mission_id: str
    crew_member_id: str
    generated_at: datetime
    results: list[LabAnalyteSummary]
    limitations: list[str]
