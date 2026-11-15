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
from spaceapp_logar.services.activities import current_activity
from spaceapp_logar.services.status_view import (
    card_for_record,
    latest_rule_records,
    overall_attention,
    rule_status,
)

router = APIRouter(prefix="/v1/crew", tags=["crew-status"])

LIMITATIONS = [
    "Öznel girişler bağlam bilgisidir; tek başına teşhis veya alarm üretmez.",
    "CO₂ WATCH nominal habitat sınırıdır; görev-özel CRITICAL eşiği değildir.",
    "DEMO etiketli kuralların eşikleri genel klinik referanslardır; uçuş tıbbı "
    "uzmanı doğrulaması bekler.",
]


@router.get("/{crew_member_id}/status", response_model=CrewStatusRead)
def get_crew_status(
    crew_member_id: str,
    mission_id: Annotated[str, Query(min_length=1, max_length=100)],
    session: Annotated[Session, Depends(get_session)],
    environment_target_id: Annotated[
        str | None, Query(min_length=1, max_length=100)
    ] = None,
) -> CrewStatusRead:
    """Return the latest result of every rule and the subjective crew context.

    Without ``environment_target_id`` (e.g. a lab-only mission) environment
    rules are simply not reported.
    """

    co2_record = (
        session.scalar(
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
        if environment_target_id is not None
        else None
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

    co2_status = None
    if co2_record is not None:
        co2_status = CO2StatusRead.model_validate(co2_record)
        co2_status.action_card = card_for_record(co2_record)

    rules = [
        rule_status(record, session)
        for record in latest_rule_records(
            session,
            mission_id=mission_id,
            crew_member_id=crew_member_id,
            environment_target_id=environment_target_id,
        )
    ]

    return CrewStatusRead(
        mission_id=mission_id,
        crew_member_id=crew_member_id,
        environment_target_id=environment_target_id,
        generated_at=datetime.now(timezone.utc),
        overall_attention=overall_attention(rules),
        co2=co2_status,
        rules=rules,
        latest_check_in=(
            SubjectiveCheckInRead.model_validate(check_in) if check_in else None
        ),
        current_activity=current_activity(
            session, mission_id, crew_member_id, datetime.now(timezone.utc)
        ),
        limitations=LIMITATIONS,
    )
