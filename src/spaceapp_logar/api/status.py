from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import RuleEvaluationRecord, SubjectiveCheckIn
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas import (
    CO2StatusRead,
    CrewStatusRead,
    SubjectiveCheckInRead,
)

router = APIRouter(prefix="/v1/crew", tags=["crew-status"])

LIMITATIONS = [
    "Öznel girişler bağlam bilgisidir; tek başına teşhis veya alarm üretmez.",
    "CO₂ WATCH nominal habitat sınırıdır; görev-özel CRITICAL eşiği değildir.",
]


@router.get("/{crew_member_id}/status", response_model=CrewStatusRead)
def get_crew_status(
    crew_member_id: str,
    mission_id: Annotated[str, Query(min_length=1, max_length=100)],
    environment_target_id: Annotated[str, Query(min_length=1, max_length=100)],
    session: Annotated[Session, Depends(get_session)],
) -> CrewStatusRead:
    """Return the latest environment assessment and subjective crew context."""

    co2_record = session.scalar(
        select(RuleEvaluationRecord)
        .where(
            RuleEvaluationRecord.mission_id == mission_id,
            RuleEvaluationRecord.target_id == environment_target_id,
            RuleEvaluationRecord.rule_id == "ENV_CO2_NOMINAL_V1",
        )
        .order_by(
            RuleEvaluationRecord.evaluated_at.desc(),
            RuleEvaluationRecord.created_at.desc(),
        )
        .limit(1)
    )
    check_in = session.scalar(
        select(SubjectiveCheckIn)
        .where(
            SubjectiveCheckIn.mission_id == mission_id,
            SubjectiveCheckIn.crew_member_id == crew_member_id,
        )
        .order_by(
            SubjectiveCheckIn.observed_at.desc(),
            SubjectiveCheckIn.ingested_at.desc(),
        )
        .limit(1)
    )

    return CrewStatusRead(
        mission_id=mission_id,
        crew_member_id=crew_member_id,
        environment_target_id=environment_target_id,
        generated_at=datetime.now(timezone.utc),
        co2=CO2StatusRead.model_validate(co2_record) if co2_record else None,
        latest_check_in=(
            SubjectiveCheckInRead.model_validate(check_in) if check_in else None
        ),
        limitations=LIMITATIONS,
    )

