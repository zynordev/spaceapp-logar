from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from spaceapp_logar.schemas import SubjectiveCheckInCreate


def valid_manual_payload() -> dict[str, object]:
    return {
        "mission_id": "demo-iss-01",
        "crew_member_id": "crew-01",
        "fatigue": 1,
        "dizziness": 0,
        "nausea": 0,
        "pain": 2,
        "mood_distress": 1,
        "observed_at": "2026-11-14T11:05:00+03:00",
        "source_type": "MANUAL",
        "source_id": "crew-tablet-01",
        "scenario_id": None,
    }


def test_manual_check_in_preserves_all_fields_and_normalizes_time() -> None:
    check_in = SubjectiveCheckInCreate.model_validate(valid_manual_payload())

    assert check_in.fatigue == 1
    assert check_in.pain == 2
    assert check_in.observed_at == datetime(
        2026, 11, 14, 8, 5, tzinfo=timezone.utc
    )


@pytest.mark.parametrize("field", [
    "fatigue",
    "dizziness",
    "nausea",
    "pain",
    "mood_distress",
])
@pytest.mark.parametrize("invalid_value", [-1, 5, 1.5, True])
def test_each_subjective_score_requires_integer_zero_to_four(
    field: str,
    invalid_value: object,
) -> None:
    payload = valid_manual_payload()
    payload[field] = invalid_value

    with pytest.raises(ValidationError):
        SubjectiveCheckInCreate.model_validate(payload)


def test_synthetic_check_in_requires_scenario_id() -> None:
    payload = valid_manual_payload()
    payload["source_type"] = "SYNTHETIC"

    with pytest.raises(ValidationError, match="scenario_id is required"):
        SubjectiveCheckInCreate.model_validate(payload)


def test_manual_check_in_rejects_scenario_id() -> None:
    payload = valid_manual_payload()
    payload["scenario_id"] = "co2-rise-demo-v1"

    with pytest.raises(ValidationError, match="scenario_id is only allowed"):
        SubjectiveCheckInCreate.model_validate(payload)


def test_check_in_rejects_naive_time_and_unknown_fields() -> None:
    payload = valid_manual_payload()
    payload["observed_at"] = "2026-11-14T08:05:00"
    payload["diagnosis"] = "not allowed"

    with pytest.raises(ValidationError):
        SubjectiveCheckInCreate.model_validate(payload)

