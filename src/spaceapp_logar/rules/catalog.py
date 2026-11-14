"""Descriptive metadata for every rule, used by status and UI responses."""

from dataclasses import dataclass

from spaceapp_logar.rules.co2 import RULE_ID as CO2_RULE_ID
from spaceapp_logar.rules.red_flags import RED_FLAG_RULE_ID
from spaceapp_logar.rules.vitals import (
    CARDIO_RESP_RULE_ID,
    HR_JUMP_RULE_ID,
    SPO2_RULE_ID,
    TEMP_RULE_ID,
)


@dataclass(frozen=True, slots=True)
class RuleInfo:
    rule_id: str
    title: str
    metric: str
    related_metrics: tuple[str, ...]
    target_type: str
    time_scale: str
    evidence_level: str
    validation_status: str


RULES: dict[str, RuleInfo] = {
    info.rule_id: info
    for info in (
        RuleInfo(
            rule_id=CO2_RULE_ID,
            title="Kabin CO₂ nominal sınırı",
            metric="CABIN_CO2_PARTIAL_PRESSURE",
            related_metrics=(),
            target_type="ENVIRONMENT",
            time_scale="acute",
            evidence_level="E",
            validation_status="APPROVED",
        ),
        RuleInfo(
            rule_id=SPO2_RULE_ID,
            title="Süreli SpO₂ düşüklüğü",
            metric="SPO2",
            related_metrics=(),
            target_type="CREW_MEMBER",
            time_scale="acute",
            evidence_level="F",
            validation_status="DEMO_PENDING_REVIEW",
        ),
        RuleInfo(
            rule_id=TEMP_RULE_ID,
            title="Vücut sıcaklığı eğilimi",
            metric="BODY_TEMPERATURE",
            related_metrics=(),
            target_type="CREW_MEMBER",
            time_scale="subacute",
            evidence_level="F",
            validation_status="DEMO_PENDING_REVIEW",
        ),
        RuleInfo(
            rule_id=CARDIO_RESP_RULE_ID,
            title="Dinlenme kalp + solunum + belirti",
            metric="HEART_RATE",
            related_metrics=("RESPIRATION_RATE",),
            target_type="CREW_MEMBER",
            time_scale="subacute",
            evidence_level="F",
            validation_status="DEMO_PENDING_REVIEW",
        ),
        RuleInfo(
            rule_id=RED_FLAG_RULE_ID,
            title="Kırmızı bayrak belirtisi",
            metric="RED_FLAG",
            related_metrics=(),
            target_type="CREW_MEMBER",
            time_scale="acute",
            evidence_level="F",
            validation_status="DEMO_PENDING_REVIEW",
        ),
        RuleInfo(
            rule_id=HR_JUMP_RULE_ID,
            title="Kalp hızı sensör kalitesi",
            metric="HEART_RATE",
            related_metrics=(),
            target_type="CREW_MEMBER",
            time_scale="acute",
            evidence_level="F",
            validation_status="DEMO_PENDING_REVIEW",
        ),
    )
}
