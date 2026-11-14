"""Data model for versioned, pre-written action cards."""

from dataclasses import dataclass

from spaceapp_logar.rules.models import HealthAttention

APPROVED = "APPROVED"
DEMO_PENDING_REVIEW = "DEMO_PENDING_REVIEW"


@dataclass(frozen=True, slots=True)
class ActionCardStep:
    """One concrete step, with a one-line reason the astronaut can understand."""

    key: str
    text_tr: str
    why_tr: str = ""


@dataclass(frozen=True, slots=True)
class CardReference:
    label: str
    uri: str


@dataclass(frozen=True, slots=True)
class ActionCard:
    """A pre-written action card and the safety limits that apply to it.

    Version 2 cards add: a reason per step, a reassessment interval, explicit
    escalation and closing conditions, possible explanations (never a
    diagnosis) and references.
    """

    card_id: str
    version: int
    attention: HealthAttention
    rule_id: str
    title_key: str
    reason_key: str
    title_tr: str
    reason_tr: str
    steps: tuple[ActionCardStep, ...]
    footer_note_tr: str
    requires_mission_procedure: bool
    allows_automatic_vehicle_command: bool
    validation_status: str = APPROVED
    reassess_minutes: int | None = None
    escalate_if_tr: tuple[str, ...] = ()
    closes_when_tr: str = ""
    considerations_tr: tuple[str, ...] = ()
    references: tuple[CardReference, ...] = ()

    @property
    def step_keys(self) -> tuple[str, ...]:
        return tuple(step.key for step in self.steps)
