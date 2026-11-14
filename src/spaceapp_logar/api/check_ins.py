from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import SubjectiveCheckIn
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas import SubjectiveCheckInCreate, SubjectiveCheckInRead
from spaceapp_logar.services.rule_engine import evaluate_check_in

router = APIRouter(prefix="/v1/check-ins", tags=["check-ins"])


@router.post(
    "",
    response_model=SubjectiveCheckInRead,
    status_code=status.HTTP_201_CREATED,
)
def create_check_in(
    payload: SubjectiveCheckInCreate,
    session: Annotated[Session, Depends(get_session)],
) -> SubjectiveCheckInRead:
    """Append one validated five-field subjective check-in."""

    check_in = SubjectiveCheckIn(
        mission_id=payload.mission_id,
        crew_member_id=payload.crew_member_id,
        fatigue=payload.fatigue,
        dizziness=payload.dizziness,
        nausea=payload.nausea,
        pain=payload.pain,
        mood_distress=payload.mood_distress,
        observed_at=payload.observed_at,
        source_type=payload.source_type.value,
        source_id=payload.source_id,
        scenario_id=payload.scenario_id,
    )
    session.add(check_in)
    session.flush()
    # Rules that read subjective context (e.g. MULTI_CARDIO_RESP_V1) are
    # re-evaluated; the check-in alone never raises an alert.
    evaluate_check_in(session, check_in)
    session.commit()
    return SubjectiveCheckInRead.model_validate(check_in)

