from pydantic import BaseModel
from fastapi import APIRouter

from spaceapp_logar.rules.catalog import RULES
from spaceapp_logar.rules.risk_coverage import HAZARDS, coverage_of

router = APIRouter(prefix="/v1/risk-coverage", tags=["coverage"])


class CoveredRule(BaseModel):
    rule_id: str
    title: str
    validation_status: str


class RiskRead(BaseModel):
    key: str
    title_tr: str
    coverage: str
    indicators_tr: list[str]
    rules: list[CoveredRule]
    note_tr: str


class HazardRead(BaseModel):
    key: str
    title_tr: str
    risks: list[RiskRead]


class CoverageRead(BaseModel):
    hazards: list[HazardRead]
    summary: dict[str, int]
    note_tr: str


@router.get("", response_model=CoverageRead)
def get_risk_coverage() -> CoverageRead:
    """Which spaceflight health risks the system covers, and how."""

    summary = {"RULE": 0, "DATA_ONLY": 0, "GAP": 0}
    hazards: list[HazardRead] = []
    for hazard in HAZARDS:
        risks: list[RiskRead] = []
        for risk in hazard.risks:
            coverage = coverage_of(risk)
            summary[coverage] += 1
            risks.append(
                RiskRead(
                    key=risk.key,
                    title_tr=risk.title_tr,
                    coverage=coverage,
                    indicators_tr=list(risk.indicators_tr),
                    rules=[
                        CoveredRule(
                            rule_id=rule_id,
                            title=RULES[rule_id].title,
                            validation_status=RULES[rule_id].validation_status,
                        )
                        for rule_id in risk.rule_ids
                        if rule_id in RULES
                    ],
                    note_tr=risk.note_tr,
                )
            )
        hazards.append(HazardRead(key=hazard.key, title_tr=hazard.title_tr, risks=risks))
    return CoverageRead(
        hazards=hazards,
        summary=summary,
        note_tr=(
            "Tehlike başlıkları NASA İnsan Araştırma Programı'nın beş uzay uçuşu "
            "tehlikesine göre düzenlenmiştir; risk adları kısa Türkçe açıklamadır. "
            "'Kural' karar desteği olduğunu, teşhis olduğunu göstermez. DEMO "
            "kuralları uzman doğrulaması bekler."
        ),
    )
