from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.db.models import LabResult
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas.lab_results import (
    LabPanelRead,
    LabResultCreate,
    LabResultRead,
)
from spaceapp_logar.services.lab_panel import build_lab_panel

router = APIRouter(tags=["lab-results"])

LIMITATIONS = [
    "Referans aralıkları kaynak veriden alınır; yazılım yeni eşik üretmez.",
    "Laboratuvar sonuçları 7/24 alarm akışına dahil değildir; tek başına "
    "teşhis veya alarm üretmez.",
]


@router.post(
    "/v1/lab-results",
    response_model=LabResultRead,
    status_code=status.HTTP_201_CREATED,
)
def create_lab_result(
    payload: LabResultCreate,
    session: Annotated[Session, Depends(get_session)],
) -> LabResultRead:
    """Append one validated periodic laboratory result."""

    result = LabResult(
        mission_id=payload.mission_id,
        crew_member_id=payload.crew_member_id,
        analyte=payload.analyte.value,
        value=payload.value,
        unit=payload.unit.value,
        reference_low=payload.reference_low,
        reference_high=payload.reference_high,
        phase=payload.phase.value,
        sampled_at=payload.sampled_at,
        source_type=payload.source_type.value,
        source_id=payload.source_id,
        scenario_id=payload.scenario_id,
    )
    session.add(result)
    session.commit()
    return LabResultRead.model_validate(result)


@router.get("/v1/crew/{crew_member_id}/lab-results", response_model=LabPanelRead)
def get_lab_panel(
    crew_member_id: str,
    mission_id: Annotated[str, Query(min_length=1, max_length=100)],
    session: Annotated[Session, Depends(get_session)],
) -> LabPanelRead:
    """Return the latest value per analyte with change context."""

    results = list(
        session.scalars(
            select(LabResult).where(
                LabResult.mission_id == mission_id,
                LabResult.crew_member_id == crew_member_id,
            )
        ).all()
    )
    return LabPanelRead(
        mission_id=mission_id,
        crew_member_id=crew_member_id,
        generated_at=datetime.now(timezone.utc),
        results=build_lab_panel(results),
        limitations=LIMITATIONS,
    )
