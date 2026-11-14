from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from spaceapp_logar.db.session import get_session
from spaceapp_logar.rules.red_flags import RED_FLAG_LABELS, RedFlag
from spaceapp_logar.schemas.red_flags import (
    RedFlagAccepted,
    RedFlagCreate,
    RedFlagOption,
)
from spaceapp_logar.services.red_flags import record_red_flags
from spaceapp_logar.services.status_view import rule_status

router = APIRouter(prefix="/v1/red-flags", tags=["red-flags"])


@router.get("/catalog", response_model=list[RedFlagOption])
def list_red_flags() -> list[RedFlagOption]:
    """Red-flag symptoms a crew member can report (labels in Turkish)."""

    return [RedFlagOption(flag=flag, label=RED_FLAG_LABELS[flag]) for flag in RedFlag]


@router.post("", response_model=RedFlagAccepted, status_code=status.HTTP_201_CREATED)
def report_red_flags(
    payload: RedFlagCreate,
    session: Annotated[Session, Depends(get_session)],
) -> RedFlagAccepted:
    """Report red-flag symptoms; escalates immediately to CRITICAL.

    No window, average or sensor confirmation is awaited: normal sensor values
    do not rule out a serious event. This is not a diagnosis.
    """

    result = record_red_flags(
        session,
        mission_id=payload.mission_id,
        crew_member_id=payload.crew_member_id,
        flags=payload.flags,
        observed_at=payload.observed_at,
        source_type=payload.source_type.value,
        source_id=payload.source_id,
        scenario_id=payload.scenario_id,
    )
    session.commit()
    return RedFlagAccepted(
        report_id=result.report.id,
        mission_id=payload.mission_id,
        crew_member_id=payload.crew_member_id,
        flags=payload.flags,
        observed_at=payload.observed_at,
        evaluation=rule_status(result.record, session),
        alert_id=result.alert.id if result.alert else None,
    )
