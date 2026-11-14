from datetime import datetime, timezone
from uuid import UUID

import pytest
from pydantic import ValidationError

from spaceapp_logar.schemas import (
    CO2ObservationCreate,
    CO2ObservationRead,
    EnvironmentMetric,
    MeasurementUnit,
    ReportedQuality,
    SourceType,
    TargetType,
)


def valid_synthetic_payload() -> dict[str, object]:
    return {
        "mission_id": "demo-iss-01",
        "target_type": "ENVIRONMENT",
        "target_id": "iss-destiny-lab",
        "metric": "CABIN_CO2_PARTIAL_PRESSURE",
        "value": 3.2,
        "unit": "mmHg",
        "observed_at": "2026-11-14T11:00:00+03:00",
        "source_type": "SYNTHETIC",
        "source_id": "co2-simulator-01",
        "scenario_id": "co2-rise-demo-v1",
        "reported_quality": "VALID",
    }


def test_valid_synthetic_observation_is_typed_and_normalized_to_utc() -> None:
    observation = CO2ObservationCreate.model_validate(valid_synthetic_payload())

    assert observation.target_type is TargetType.ENVIRONMENT
    assert observation.metric is EnvironmentMetric.CABIN_CO2_PARTIAL_PRESSURE
    assert observation.unit is MeasurementUnit.MMHG
    assert observation.source_type is SourceType.SYNTHETIC
    assert observation.reported_quality is ReportedQuality.VALID
    assert observation.observed_at == datetime(
        2026, 11, 14, 8, 0, tzinfo=timezone.utc
    )


def test_synthetic_observation_requires_scenario_id() -> None:
    payload = valid_synthetic_payload()
    payload["scenario_id"] = None

    with pytest.raises(ValidationError, match="scenario_id is required"):
        CO2ObservationCreate.model_validate(payload)


def test_real_sensor_observation_rejects_synthetic_scenario_id() -> None:
    payload = valid_synthetic_payload()
    payload["source_type"] = "SENSOR"

    with pytest.raises(ValidationError, match="scenario_id is only allowed"):
        CO2ObservationCreate.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("target_type", "CREW_MEMBER"),
        ("metric", "HEART_RATE"),
        ("unit", "percent"),
    ],
)
def test_co2_contract_rejects_wrong_target_metric_or_unit(
    field: str,
    invalid_value: str,
) -> None:
    payload = valid_synthetic_payload()
    payload[field] = invalid_value

    with pytest.raises(ValidationError):
        CO2ObservationCreate.model_validate(payload)


@pytest.mark.parametrize("invalid_value", [-0.01, float("inf"), float("nan")])
def test_co2_contract_rejects_invalid_values(invalid_value: float) -> None:
    payload = valid_synthetic_payload()
    payload["value"] = invalid_value

    with pytest.raises(ValidationError):
        CO2ObservationCreate.model_validate(payload)


def test_observed_at_requires_timezone() -> None:
    payload = valid_synthetic_payload()
    payload["observed_at"] = "2026-11-14T08:00:00"

    with pytest.raises(ValidationError, match="timezone"):
        CO2ObservationCreate.model_validate(payload)


def test_unknown_fields_are_rejected() -> None:
    payload = valid_synthetic_payload()
    payload["diagnosis"] = "not allowed"

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        CO2ObservationCreate.model_validate(payload)


def test_read_model_adds_backend_identity_and_ingestion_time() -> None:
    payload = valid_synthetic_payload()
    payload.update(
        {
            "id": "91bf3bb9-cd37-43ac-aa63-d06c31fefd52",
            "ingested_at": "2026-11-14T08:00:01Z",
        }
    )

    observation = CO2ObservationRead.model_validate(payload)

    assert observation.id == UUID("91bf3bb9-cd37-43ac-aa63-d06c31fefd52")
    assert observation.ingested_at == datetime(
        2026, 11, 14, 8, 0, 1, tzinfo=timezone.utc
    )

