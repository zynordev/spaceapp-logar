from pydantic import BaseModel, ConfigDict

from spaceapp_logar.rules import ActionCard, HealthAttention


class ActionCardStepRead(BaseModel):
    key: str
    text_tr: str


class ActionCardRead(BaseModel):
    """Approved action card as returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    card_id: str
    version: int
    attention: HealthAttention
    rule_id: str
    title_key: str
    reason_key: str
    title_tr: str
    reason_tr: str
    step_keys: list[str]
    steps: list[ActionCardStepRead]
    footer_note_tr: str
    requires_mission_procedure: bool
    allows_automatic_vehicle_command: bool
    validation_status: str

    @classmethod
    def from_card(cls, card: ActionCard) -> "ActionCardRead":
        return cls(
            card_id=card.card_id,
            version=card.version,
            attention=card.attention,
            rule_id=card.rule_id,
            title_key=card.title_key,
            reason_key=card.reason_key,
            title_tr=card.title_tr,
            reason_tr=card.reason_tr,
            step_keys=list(card.step_keys),
            steps=[
                ActionCardStepRead(key=step.key, text_tr=step.text_tr)
                for step in card.steps
            ],
            footer_note_tr=card.footer_note_tr,
            requires_mission_procedure=card.requires_mission_procedure,
            allows_automatic_vehicle_command=card.allows_automatic_vehicle_command,
            validation_status=card.validation_status,
        )
