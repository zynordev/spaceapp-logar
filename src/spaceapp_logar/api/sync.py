from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaceapp_logar.auth import Role, User, current_user, require_role
from spaceapp_logar.db.models import GroundEscalation
from spaceapp_logar.db.session import get_session
from spaceapp_logar.schemas.observations import Identifier
from spaceapp_logar.schemas.sync import (
    EscalationRead,
    Recipient,
    RecipientStatus,
    SyncAckCreate,
    SyncAckRead,
    SyncPacketRead,
    SyncStatusRead,
)
from spaceapp_logar.services import ground_sync

router = APIRouter(prefix="/v1/sync", tags=["ground-sync"])


@router.get("/status", response_model=SyncStatusRead)
def get_sync_status(
    mission_id: Annotated[Identifier, Query()],
    session: Annotated[Session, Depends(get_session)],
) -> SyncStatusRead:
    """What each ground team still has to receive (pending since last ack)."""

    recipients = []
    for name in ground_sync.RECIPIENTS:
        ack = ground_sync.last_ack(session, mission_id, name)
        recipients.append(
            RecipientStatus(
                recipient=Recipient(name),
                label_tr=ground_sync.RECIPIENT_LABELS_TR[name],
                pending_items=ground_sync.pending_item_count(session, mission_id, name),
                last_ack_at=ack.acked_at if ack else None,
                last_packet_id=ack.packet_id if ack else None,
            )
        )
    pending = session.scalars(
        select(GroundEscalation.id).where(
            GroundEscalation.mission_id == mission_id,
            GroundEscalation.status == "PENDING",
        )
    ).all()
    return SyncStatusRead(
        mission_id=mission_id,
        generated_at=datetime.now(timezone.utc),
        link_delay_seconds=ground_sync.link_delay_seconds(),
        recipients=recipients,
        pending_escalations=len(pending),
    )


@router.get("/packet", response_model=SyncPacketRead)
def get_sync_packet(
    mission_id: Annotated[Identifier, Query()],
    recipient: Annotated[Recipient, Query()],
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=5000)] = ground_sync.DEFAULT_LIMIT,
) -> SyncPacketRead:
    """Integrity-checked packet since the recipient's last acknowledgement.

    Oldest items first, at most ``limit``; call again after acknowledging to
    continue. The same window always yields the same ``sha256``.
    """

    built = ground_sync.build_packet(session, mission_id, recipient.value, limit=limit)
    return SyncPacketRead(
        **built.body,
        sha256=built.sha256,
        signature=built.signature,
        signature_alg="HMAC-SHA256" if built.signature else None,
    )


@router.post("/ack", response_model=SyncAckRead)
def acknowledge_packet(
    payload: SyncAckCreate,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_user)],
) -> SyncAckRead:
    """Ground confirms receipt; 409 if the hash does not match the packet."""

    require_role(user, Role.GROUND)
    try:
        ack = ground_sync.acknowledge(
            session,
            mission_id=payload.mission_id,
            recipient=payload.recipient.value,
            packet_id=payload.packet_id,
            sha256=payload.sha256.lower(),
            until=payload.until,
            acked_by=user.user_id,
        )
    except ground_sync.PacketMismatch as error:
        session.rollback()
        raise HTTPException(409, str(error)) from error
    session.commit()
    return SyncAckRead.model_validate(ack)


@router.get("/escalations", response_model=list[EscalationRead])
def list_escalations(
    mission_id: Annotated[Identifier, Query()],
    session: Annotated[Session, Depends(get_session)],
    status: Annotated[Literal["PENDING", "ACKED"] | None, Query()] = None,
) -> list[GroundEscalation]:
    """Automatic flight-surgeon escalations, newest first."""

    query = select(GroundEscalation).where(GroundEscalation.mission_id == mission_id)
    if status is not None:
        query = query.where(GroundEscalation.status == status)
    return list(
        session.scalars(query.order_by(GroundEscalation.created_at.desc(), GroundEscalation.id))
    )
