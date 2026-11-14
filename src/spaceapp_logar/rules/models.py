from dataclasses import dataclass
from enum import StrEnum


class DataQuality(StrEnum):
    """Whether the input data can support a health assessment."""

    VALID = "VALID"
    SUSPECT = "SUSPECT"
    MISSING = "MISSING"
    FAULT = "FAULT"


class HealthAttention(StrEnum):
    """Level of attention required by an explainable rule result."""

    UNKNOWN = "UNKNOWN"
    NORMAL = "NORMAL"
    WATCH = "WATCH"
    ALERT = "ALERT"
    CRITICAL = "CRITICAL"


class AlertStatus(StrEnum):
    """Lifecycle of an alert event shown to the crew."""

    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


@dataclass(frozen=True, slots=True)
class RuleEvaluation:
    """Auditable output produced by one deterministic rule."""

    rule_id: str
    rule_version: int
    data_quality: DataQuality
    health_attention: HealthAttention
    observed_value: float | None
    unit: str
    threshold: float
    comparison: str
    window_minutes: int
    explanation: str
    source: str
    source_uri: str

