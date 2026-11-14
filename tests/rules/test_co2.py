import pytest

from spaceapp_logar.rules import (
    DataQuality,
    HealthAttention,
    evaluate_co2_nominal,
)


def test_value_equal_to_nominal_limit_is_normal() -> None:
    result = evaluate_co2_nominal(3.0)

    assert result.health_attention is HealthAttention.NORMAL
    assert result.data_quality is DataQuality.VALID
    assert result.threshold == 3.0
    assert result.comparison == ">"
    assert result.window_minutes == 60
    assert result.rule_id == "ENV_CO2_NOMINAL_V1"
    assert result.rule_version == 1
    assert result.source_uri.startswith("https://www.nasa.gov/")


def test_value_above_nominal_limit_is_watch() -> None:
    result = evaluate_co2_nominal(3.01)

    assert result.health_attention is HealthAttention.WATCH
    assert result.data_quality is DataQuality.VALID
    assert "3.01 mmHg" in result.explanation


def test_missing_average_cannot_produce_health_assessment() -> None:
    result = evaluate_co2_nominal(None)

    assert result.health_attention is HealthAttention.UNKNOWN
    assert result.data_quality is DataQuality.MISSING


def test_suspect_data_cannot_produce_health_assessment() -> None:
    result = evaluate_co2_nominal(4.0, DataQuality.SUSPECT)

    assert result.health_attention is HealthAttention.UNKNOWN
    assert result.data_quality is DataQuality.SUSPECT


def test_explicit_fault_is_preserved_when_average_is_missing() -> None:
    result = evaluate_co2_nominal(None, DataQuality.FAULT)

    assert result.health_attention is HealthAttention.UNKNOWN
    assert result.data_quality is DataQuality.FAULT


@pytest.mark.parametrize("invalid_value", [-0.01, float("inf"), float("nan")])
def test_invalid_average_is_a_data_fault(invalid_value: float) -> None:
    result = evaluate_co2_nominal(invalid_value)

    assert result.health_attention is HealthAttention.UNKNOWN
    assert result.data_quality is DataQuality.FAULT

