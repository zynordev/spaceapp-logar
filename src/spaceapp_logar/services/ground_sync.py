"""Delay-tolerant, integrity-checked sync packets for ground teams.

Design (offline-first): the onboard system never waits for the ground. When a
link exists, a ground team pulls a packet with everything routed to it since
its last acknowledgement and acknowledges it with the packet hash. Routing is
a fixed table (inspired by Brahms-style agent routing), not machine learning:

- FLIGHT_SURGEON: crew rule evaluations and alerts, red flags, check-ins, lab
  results, escalations, hourly trends of crew measurements.
- LIFE_SUPPORT: CO2 and cabin atmosphere (O2, pressure) evaluations + alerts,
  hourly trends of those metrics.
- RADIATION: radiation evaluations + alerts, hourly radiation trend.
- MISSION_CONTROL: every alert and every escalation (summary view).

Reproducibility: a packet is a pure function of (mission, recipient, since,
until) and the stored data. ``packet_id`` is a UUID5 of those, ``generated_at``
equals ``until`` and ``until`` is the newest contributing timestamp, so the
same window always yields the same bytes and hash. ``POST /ack`` therefore
re-computes the packet for the acknowledged window instead of storing issued
packets, and answers 409 if the hash differs.

Items are cut by the time the system *received* them (``created_at`` /
``ingested_at``), so late-arriving data is still delivered. Canonical JSON:
sorted keys, separators ``(',', ':')``, UTF-8, datetimes as UTC ISO-8601 with
``Z``. The optional HMAC-SHA256 signature uses ``SPACEAPP_AUTH_SECRET``.
"""

import hashlib
import hmac
import json
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from spaceapp_logar.auth import _secret
from spaceapp_logar.db.models import (
    AlertEvent,
    GroundEscalation,
    GroundSyncAck,
    LabResult,
    Observation,
    RedFlagReport,
    RuleEvaluationRecord,
    SubjectiveCheckIn,
    utc_now,
)
from spaceapp_logar.rules.expanded import (
    ATMOSPHERE_RULE_ID,
    MOTION_RULE_ID,
    RADIATION_RULE_ID,
    SLEEP_RULE_ID,
    VISION_RULE_ID,
)
from spaceapp_logar.rules.red_flags import RED_FLAG_RULE_ID
from spaceapp_logar.rules.vitals import (
    CARDIO_RESP_RULE_ID,
    HR_JUMP_RULE_ID,
    SPO2_RULE_ID,
    TEMP_RULE_ID,
)

DEFAULT_LIMIT = 500
MAX_TREND_ITEMS = 168
CO2_RULE_ID = "ENV_CO2_NOMINAL_V1"

RECIPIENTS = ("FLIGHT_SURGEON", "LIFE_SUPPORT", "RADIATION", "MISSION_CONTROL")
RECIPIENT_LABELS_TR = {
    "FLIGHT_SURGEON": "Uçuş hekimi",
    "LIFE_SUPPORT": "Yaşam destek",
    "RADIATION": "Radyasyon ekibi",
    "MISSION_CONTROL": "Görev kontrol",
}

LIFE_SUPPORT_RULES = frozenset({CO2_RULE_ID, ATMOSPHERE_RULE_ID})
RADIATION_RULES = frozenset({RADIATION_RULE_ID})
ENVIRONMENT_RULES = LIFE_SUPPORT_RULES | RADIATION_RULES
LIFE_SUPPORT_METRICS = frozenset(
    {"CABIN_CO2_PARTIAL_PRESSURE", "CABIN_O2_FRACTION", "CABIN_PRESSURE"}
)
RADIATION_METRICS = frozenset({"RADIATION_DOSE_RATE"})

RULE_LABELS_TR = {
    CO2_RULE_ID: "kabin CO₂",
    ATMOSPHERE_RULE_ID: "kabin atmosferi",
    RADIATION_RULE_ID: "radyasyon doz hızı",
    RED_FLAG_RULE_ID: "kırmızı bayrak belirtisi bildirimi",
    SPO2_RULE_ID: "SpO₂ ölçümü",
    TEMP_RULE_ID: "vücut sıcaklığı",
    CARDIO_RESP_RULE_ID: "kalp-solunum örüntüsü",
    HR_JUMP_RULE_ID: "kalp atış hızı veri tutarlılığı",
    SLEEP_RULE_ID: "uyku süresi",
    MOTION_RULE_ID: "hareket hastalığı belirtileri",
    VISION_RULE_ID: "görme belirtisi",
}
ATTENTION_LABELS_TR = {
    "WATCH": "İZLEME",
    "ALERT": "UYARI",
    "CRITICAL": "KRİTİK",
    "NORMAL": "NORMAL",
    "UNKNOWN": "BELİRSİZ",
}
ESCALATION_LEVELS = ("ALERT", "CRITICAL")


class PacketMismatch(Exception):
    """The acknowledged hash/id does not match the recomputed packet."""


# ---------------------------------------------------------------- canonical


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def sign(value: Any) -> str | None:
    """HMAC-SHA256 (hex) of the canonical JSON; None without a secret."""

    secret = _secret()
    if secret is None:
        return None
    return hmac.new(secret, canonical_json(value).encode("utf-8"), hashlib.sha256).hexdigest()


def link_delay_seconds() -> int | None:
    raw = os.getenv("SPACEAPP_LINK_DELAY_SECONDS", "").strip()
    try:
        return int(raw) if raw else None
    except ValueError:
        return None


def rule_label(rule_id: str) -> str:
    return RULE_LABELS_TR.get(rule_id, rule_id)


# ------------------------------------------------------------- escalations


def _evaluation_data(record: RuleEvaluationRecord) -> dict[str, Any]:
    return {
        "rule_id": record.rule_id,
        "rule_version": record.rule_version,
        "target_id": record.target_id,
        "evaluated_at": iso(record.evaluated_at),
        "health_attention": record.health_attention,
        "data_quality": record.data_quality,
        "observed_value": record.observed_value,
        "unit": record.unit,
        "threshold": record.threshold,
        "comparison": record.comparison,
        "window_minutes": record.window_minutes,
        "explanation": record.explanation,
    }


def create_escalation(
    session: Session,
    alert: AlertEvent,
    record: RuleEvaluationRecord,
) -> GroundEscalation | None:
    """One priority packet per ALERT/CRITICAL alert (idempotent per alert).

    Runs inside the caller's transaction. Contains the alert, the evidence
    evaluation, related observations of the last 60 minutes and the latest
    check-in. Neutral decision support, not a diagnosis.
    """

    if record.health_attention not in ESCALATION_LEVELS:
        return None
    existing = session.scalar(
        select(GroundEscalation).where(GroundEscalation.alert_id == alert.id)
    )
    if existing is not None:
        return existing

    is_crew = alert.rule_id not in ENVIRONMENT_RULES
    window_start = record.evaluated_at - timedelta(minutes=60)
    observations = session.scalars(
        select(Observation)
        .where(
            Observation.mission_id == alert.mission_id,
            Observation.target_id == alert.target_id,
            Observation.observed_at >= window_start,
            Observation.observed_at <= record.evaluated_at,
        )
        .order_by(Observation.observed_at.desc(), Observation.id)
        .limit(200)
    ).all()
    check_in = None
    if is_crew:
        check_in = session.scalar(
            select(SubjectiveCheckIn)
            .where(
                SubjectiveCheckIn.mission_id == alert.mission_id,
                SubjectiveCheckIn.crew_member_id == alert.target_id,
                SubjectiveCheckIn.observed_at <= record.evaluated_at,
            )
            .order_by(SubjectiveCheckIn.observed_at.desc())
            .limit(1)
        )
    label = rule_label(alert.rule_id)
    level = ATTENTION_LABELS_TR.get(record.health_attention, record.health_attention)
    packet = {
        "alert": {
            "id": str(alert.id),
            "rule_id": alert.rule_id,
            "target_id": alert.target_id,
            "health_attention": record.health_attention,
            "opened_at": iso(alert.opened_at),
            "action_card_id": alert.action_card_id,
        },
        "evaluation": _evaluation_data(record),
        "observations": [
            {
                "id": str(row.id),
                "metric": row.metric,
                "value": row.value,
                "unit": row.unit,
                "observed_at": iso(row.observed_at),
            }
            for row in reversed(observations)
        ],
        "latest_check_in": _check_in_data(check_in) if check_in else None,
    }
    summary = (
        f"{alert.target_id}: {label} için {level} düzeyinde bildirim açıldı. "
        "Karar desteği özetidir, tanı değildir; uçuş hekimi değerlendirmesi önerilir."
    )
    escalation = GroundEscalation(
        mission_id=alert.mission_id,
        alert_id=alert.id,
        crew_member_id=alert.target_id if is_crew else None,
        priority=record.health_attention,
        status="PENDING",
        summary_tr=summary[:500],
        packet=packet,
        packet_sha256=sha256_hex(packet),
        created_at=utc_now(),
    )
    session.add(escalation)
    session.flush()
    return escalation


# ------------------------------------------------------------------ items


@dataclass(frozen=True, slots=True)
class _Item:
    at: datetime
    kind: str
    id: str
    summary_tr: str
    data: dict[str, Any]

    def sort_key(self) -> tuple[datetime, str, str]:
        return (self.at, self.kind, self.id)

    def as_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "id": self.id,
            "occurred_at": iso(self.at),
            "summary_tr": self.summary_tr,
            "data": self.data,
        }


def _check_in_data(row: SubjectiveCheckIn) -> dict[str, Any]:
    return {
        "crew_member_id": row.crew_member_id,
        "observed_at": iso(row.observed_at),
        "fatigue": row.fatigue,
        "dizziness": row.dizziness,
        "nausea": row.nausea,
        "pain": row.pain,
        "mood_distress": row.mood_distress,
        "vision_change": row.vision_change,
        "back_pain": row.back_pain,
        "congestion": row.congestion,
    }


def _rule_filter(column, recipient: str):
    if recipient == "LIFE_SUPPORT":
        return column.in_(LIFE_SUPPORT_RULES)
    if recipient == "RADIATION":
        return column.in_(RADIATION_RULES)
    if recipient == "FLIGHT_SURGEON":
        return column.not_in(ENVIRONMENT_RULES)
    return None  # MISSION_CONTROL: all alerts


def _bounded(query, column, since: datetime | None, upper: datetime | None, limit: int):
    if since is not None:
        query = query.where(column > since)
    if upper is not None:
        query = query.where(column <= upper)
    return query.order_by(column).limit(limit + 1)


def _collect_items(
    session: Session,
    mission_id: str,
    recipient: str,
    since: datetime | None,
    upper: datetime | None,
    limit: int,
) -> list[_Item]:
    items: list[_Item] = []

    # Alerts: the opened-time facts only, so a packet never changes later.
    alert_query = select(AlertEvent).where(AlertEvent.mission_id == mission_id)
    rule_clause = _rule_filter(AlertEvent.rule_id, recipient)
    if rule_clause is not None:
        alert_query = alert_query.where(rule_clause)
    alerts = session.scalars(
        _bounded(alert_query, AlertEvent.created_at, since, upper, limit)
    ).all()
    opened_levels = {}
    if alerts:
        opened_levels = dict(
            session.execute(
                select(RuleEvaluationRecord.id, RuleEvaluationRecord.health_attention).where(
                    RuleEvaluationRecord.id.in_([a.opened_evaluation_id for a in alerts])
                )
            ).all()
        )
    for alert in alerts:
        level = opened_levels.get(alert.opened_evaluation_id, "")
        items.append(
            _Item(
                alert.created_at,
                "ALERT",
                str(alert.id),
                f"{alert.target_id}: {rule_label(alert.rule_id)} için "
                f"{ATTENTION_LABELS_TR.get(level, level)} düzeyinde bildirim açıldı.",
                {
                    "rule_id": alert.rule_id,
                    "target_id": alert.target_id,
                    "opened_at": iso(alert.opened_at),
                    "opened_health_attention": level,
                    "opened_evaluation_id": str(alert.opened_evaluation_id),
                },
            )
        )

    if recipient != "MISSION_CONTROL":
        evaluation_query = select(RuleEvaluationRecord).where(
            RuleEvaluationRecord.mission_id == mission_id,
            RuleEvaluationRecord.health_attention != "NORMAL",
            _rule_filter(RuleEvaluationRecord.rule_id, recipient),
        )
        for record in session.scalars(
            _bounded(evaluation_query, RuleEvaluationRecord.created_at, since, upper, limit)
        ).all():
            items.append(
                _Item(
                    record.created_at,
                    "RULE_EVALUATION",
                    str(record.id),
                    f"{record.target_id}: {rule_label(record.rule_id)} değerlendirmesi "
                    f"{ATTENTION_LABELS_TR.get(record.health_attention, record.health_attention)}.",
                    _evaluation_data(record),
                )
            )

    if recipient == "FLIGHT_SURGEON":
        check_ins = session.scalars(
            _bounded(
                select(SubjectiveCheckIn).where(SubjectiveCheckIn.mission_id == mission_id),
                SubjectiveCheckIn.ingested_at, since, upper, limit,
            )
        ).all()
        for row in check_ins:
            items.append(
                _Item(
                    row.ingested_at, "CHECK_IN", str(row.id),
                    f"{row.crew_member_id}: öznel durum bildirimi alındı.",
                    _check_in_data(row),
                )
            )
        labs = session.scalars(
            _bounded(
                select(LabResult).where(LabResult.mission_id == mission_id),
                LabResult.ingested_at, since, upper, limit,
            )
        ).all()
        for lab in labs:
            items.append(
                _Item(
                    lab.ingested_at, "LAB_RESULT", str(lab.id),
                    f"{lab.crew_member_id}: {lab.analyte} laboratuvar sonucu kaydedildi.",
                    {
                        "crew_member_id": lab.crew_member_id,
                        "analyte": lab.analyte,
                        "value": lab.value,
                        "unit": lab.unit,
                        "reference_low": lab.reference_low,
                        "reference_high": lab.reference_high,
                        "phase": lab.phase,
                        "sampled_at": iso(lab.sampled_at),
                    },
                )
            )
        flags = session.scalars(
            _bounded(
                select(RedFlagReport).where(RedFlagReport.mission_id == mission_id),
                RedFlagReport.ingested_at, since, upper, limit,
            )
        ).all()
        for flag in flags:
            items.append(
                _Item(
                    flag.ingested_at, "RED_FLAG", str(flag.id),
                    f"{flag.crew_member_id}: kırmızı bayrak belirtisi bildirildi. "
                    "Tanı değildir; uçuş hekimi değerlendirmesi önerilir.",
                    {
                        "crew_member_id": flag.crew_member_id,
                        "flags": flag.flags.split(",") if flag.flags else [],
                        "observed_at": iso(flag.observed_at),
                    },
                )
            )

    if recipient in ("FLIGHT_SURGEON", "MISSION_CONTROL"):
        escalations = session.scalars(
            _bounded(
                select(GroundEscalation).where(GroundEscalation.mission_id == mission_id),
                GroundEscalation.created_at, since, upper, limit,
            )
        ).all()
        for esc in escalations:
            items.append(
                _Item(
                    esc.created_at, "ESCALATION", str(esc.id), esc.summary_tr,
                    {
                        "alert_id": str(esc.alert_id),
                        "crew_member_id": esc.crew_member_id,
                        "priority": esc.priority,
                        "packet_sha256": esc.packet_sha256,
                        "packet": esc.packet,
                    },
                )
            )
    return items


def _observation_conditions(mission_id: str, recipient: str, since, upper) -> list | None:
    """Filters for the observations behind a recipient's trends (None: no trends)."""

    conditions = [Observation.mission_id == mission_id]
    if recipient == "LIFE_SUPPORT":
        conditions.append(Observation.metric.in_(LIFE_SUPPORT_METRICS))
    elif recipient == "RADIATION":
        conditions.append(Observation.metric.in_(RADIATION_METRICS))
    elif recipient == "FLIGHT_SURGEON":
        conditions.append(Observation.target_type != "ENVIRONMENT")
    else:
        return None
    if since is not None:
        conditions.append(Observation.ingested_at > since)
    if upper is not None:
        conditions.append(Observation.ingested_at <= upper)
    return conditions


def _trend_items(
    session: Session,
    mission_id: str,
    recipient: str,
    since: datetime | None,
    until: datetime,
) -> list[_Item]:
    conditions = _observation_conditions(mission_id, recipient, since, until)
    if conditions is None:
        return []
    groups: dict[tuple[str, str, datetime], list[float]] = defaultdict(list)
    units: dict[str, str] = {}
    for row in session.scalars(select(Observation).where(*conditions)).all():
        hour = row.observed_at.replace(minute=0, second=0, microsecond=0)
        groups[(row.metric, row.target_id, hour)].append(row.value)
        units[row.metric] = row.unit
    keys = sorted(groups, key=lambda key: (key[2], key[0], key[1]))[-MAX_TREND_ITEMS:]
    items = []
    for metric, target_id, hour in keys:
        values = groups[(metric, target_id, hour)]
        mean = round(sum(values) / len(values), 6)
        items.append(
            _Item(
                hour, "TREND", f"{metric}|{target_id}|{iso(hour)}",
                f"{target_id}: {metric} saatlik özet (ort. {mean}, {len(values)} ölçüm).",
                {
                    "metric": metric,
                    "target_id": target_id,
                    "unit": units[metric],
                    "hour_start": iso(hour),
                    "count": len(values),
                    "mean": mean,
                    "min": min(values),
                    "max": max(values),
                },
            )
        )
    return items


# ------------------------------------------------------------------ packet


def last_ack(session: Session, mission_id: str, recipient: str) -> GroundSyncAck | None:
    return session.scalar(
        select(GroundSyncAck)
        .where(GroundSyncAck.mission_id == mission_id, GroundSyncAck.recipient == recipient)
        .order_by(GroundSyncAck.until.desc(), GroundSyncAck.acked_at.desc())
        .limit(1)
    )


@dataclass(frozen=True, slots=True)
class BuiltPacket:
    body: dict[str, Any]
    sha256: str
    signature: str | None
    escalation_ids: list[UUID]


def build_packet(
    session: Session,
    mission_id: str,
    recipient: str,
    *,
    limit: int = DEFAULT_LIMIT,
    upper: datetime | None = None,
) -> BuiltPacket:
    """Packet of everything since the recipient's cursor (oldest first).

    ``upper`` fixes the end of the window (used to re-create an issued packet
    when verifying an acknowledgement).
    """

    ack = last_ack(session, mission_id, recipient)
    since = ack.until if ack else None
    items = sorted(
        _collect_items(
            session, mission_id, recipient, since, upper, 100_000 if upper else limit
        ),
        key=_Item.sort_key,
    )
    if upper is not None:
        until = upper
    elif len(items) > limit:
        items = items[:limit]
        last_at = items[-1].at
        if items[0].at != last_at:
            # Never split items sharing one timestamp across two packets.
            items = [item for item in items if item.at < last_at]
        until = items[-1].at
    else:
        stamps = [item.at for item in items]
        conditions = _observation_conditions(mission_id, recipient, since, None)
        if conditions is not None:
            newest = session.scalar(select(func.max(Observation.ingested_at)).where(*conditions))
            if newest is not None:
                stamps.append(newest.replace(tzinfo=timezone.utc) if newest.tzinfo is None else newest)
        until = max(stamps) if stamps else (since or utc_now())
    all_items = sorted(
        items + _trend_items(session, mission_id, recipient, since, until),
        key=_Item.sort_key,
    )
    packet_id = uuid5(
        NAMESPACE_URL,
        f"spaceapp-logar:sync:{mission_id}:{recipient}:{iso(since) if since else ''}:{iso(until)}",
    )
    body = {
        "packet_id": str(packet_id),
        "mission_id": mission_id,
        "recipient": recipient,
        "generated_at": iso(until),
        "since": iso(since) if since else None,
        "until": iso(until),
        "item_count": len(all_items),
        "items": [item.as_dict() for item in all_items],
    }
    return BuiltPacket(
        body=body,
        sha256=sha256_hex(body),
        signature=sign(body),
        escalation_ids=[UUID(item.id) for item in all_items if item.kind == "ESCALATION"],
    )


def pending_item_count(session: Session, mission_id: str, recipient: str) -> int:
    ack = last_ack(session, mission_id, recipient)
    since = ack.until if ack else None
    return len(_collect_items(session, mission_id, recipient, since, None, 5000))


def acknowledge(
    session: Session,
    *,
    mission_id: str,
    recipient: str,
    packet_id: UUID,
    sha256: str,
    until: datetime,
    acked_by: str,
) -> GroundSyncAck:
    """Verify the hash against a re-computed packet, then move the cursor.

    Acknowledging the same packet twice returns the first acknowledgement.
    A FLIGHT_SURGEON ack marks the escalations in that packet as ACKED.
    """

    previous = session.scalar(
        select(GroundSyncAck).where(
            GroundSyncAck.mission_id == mission_id,
            GroundSyncAck.recipient == recipient,
            GroundSyncAck.packet_id == packet_id,
        )
    )
    if previous is not None:
        if previous.sha256 != sha256:
            raise PacketMismatch("sha256 does not match the acknowledged packet")
        return previous

    built = build_packet(session, mission_id, recipient, upper=until)
    if built.sha256 != sha256 or built.body["packet_id"] != str(packet_id):
        raise PacketMismatch("sha256 or packet_id does not match the packet for this window")
    now = utc_now()
    ack = GroundSyncAck(
        mission_id=mission_id,
        recipient=recipient,
        packet_id=packet_id,
        sha256=sha256,
        until=until,
        acked_at=now,
        acked_by=acked_by,
    )
    session.add(ack)
    if recipient == "FLIGHT_SURGEON" and built.escalation_ids:
        for esc in session.scalars(
            select(GroundEscalation).where(
                GroundEscalation.id.in_(built.escalation_ids),
                GroundEscalation.status == "PENDING",
            )
        ).all():
            esc.status = "ACKED"
            esc.acked_at = now
    session.flush()
    return ack
