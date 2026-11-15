"""Versioned, pre-written action cards.

The software never generates advice at run time; it only selects one of these
fixed cards. Version 1 cards stay here so stored evaluations that showed
them can still be resolved; new evaluations select the version 2 cards in
``action_cards_v2``. ``ENV_CO2_WATCH_CARD_V1`` and ``_V2`` were approved by the
project owner. All other cards are DEMO cards (validation_status ``DEMO_PENDING_REVIEW``): they
only contain first-step actions listed as allowed in docs/biyo.md section 10.2
(re-measure, stop activity/rest, record symptoms, open the mission procedure,
notify the crew medical officer). They contain no diagnosis, drug or dose.
"""

from spaceapp_logar.rules.co2 import RULE_ID as CO2_NOMINAL_RULE_ID
from spaceapp_logar.rules.models import (
    DataQuality,
    HealthAttention,
    RuleEvaluation,
)
from spaceapp_logar.rules.red_flags import RED_FLAG_RULE_ID
from spaceapp_logar.rules.vitals import (
    CARDIO_RESP_RULE_ID,
    HR_JUMP_RULE_ID,
    SPO2_RULE_ID,
    TEMP_RULE_ID,
)

from spaceapp_logar.rules.card_model import (
    APPROVED,
    DEMO_PENDING_REVIEW,
    ActionCard,
    ActionCardStep,
    CardReference,
)


DEMO_FOOTER = (
    "DEMO card: content awaits expert validation. Does not diagnose; no "
    "medication or treatment is recommended. Mission-specific procedure and the "
    "crew medical officer take priority."
)

ENV_CO2_WATCH_CARD_V1 = ActionCard(
    card_id="ENV_CO2_WATCH_CARD_V1",
    version=1,
    attention=HealthAttention.WATCH,
    rule_id=CO2_NOMINAL_RULE_ID,
    title_key="co2_watch.title",
    reason_key="co2_watch.reason",
    title_tr="Check the cabin CO₂ value",
    reason_tr=(
        "The one-hour average CO₂ value is above the nominal limit. "
        "Verify the measurement and check the mission procedure."
    ),
    steps=(
        ActionCardStep(
            key="verify_measurement",
            text_tr=(
                "Re-check the measurement. Check the cabin CO₂ display and sensor "
                "status. If a sensor fault appears, record it."
            ),
        ),
        ActionCardStep(
            key="record_check_in",
            text_tr=(
                "Record how you feel. Especially if you have fatigue or "
                "pain/headache, complete the short subjective status check."
            ),
        ),
        ActionCardStep(
            key="open_mission_procedure",
            text_tr=(
                "Open the mission procedure. Open the mission-specific CO₂ "
                "ventilation/removal procedure and notify the responsible team "
                "named in the procedure."
            ),
        ),
    ),
    footer_note_tr=(
        "This is a WATCH notification. The software does not command ventilation "
        "or CO₂ removal equipment by itself. The mission-specific procedure takes "
        "priority."
    ),
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
)

_RECORD_SYMPTOMS = ActionCardStep(
    key="record_check_in",
    text_tr=(
        "Record how you feel: fatigue, dizziness, nausea, pain and mood. "
        "Complete the short subjective status check."
    ),
)
_NOTIFY_MEDICAL_OFFICER = ActionCardStep(
    key="notify_medical_officer",
    text_tr=(
        "Open the mission procedure and notify the crew medical officer/ground "
        "team. They decide the next steps."
    ),
)
_STOP_AND_REST = ActionCardStep(
    key="stop_activity_rest",
    text_tr="Stop the strenuous activity, sit in a safe position and rest.",
)

VITAL_SPO2_WATCH_CARD_V1 = ActionCard(
    card_id="VITAL_SPO2_WATCH_CARD_V1",
    version=1,
    attention=HealthAttention.WATCH,
    rule_id=SPO2_RULE_ID,
    title_key="spo2_watch.title",
    reason_key="spo2_watch.reason",
    title_tr="Verify the SpO₂ measurement",
    reason_tr=(
        "The 10-minute resting SpO₂ average is below the usual reference. "
        "First make sure the measurement is correct."
    ),
    steps=(
        ActionCardStep(
            key="verify_sensor_placement",
            text_tr=(
                "Check the sensor's finger/ear placement and contact, and repeat "
                "the measurement while holding your hand steady."
            ),
        ),
        _RECORD_SYMPTOMS,
        ActionCardStep(
            key="check_cabin_atmosphere",
            text_tr="Check the cabin O₂ and pressure readings.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

VITAL_SPO2_ALERT_CARD_V1 = ActionCard(
    card_id="VITAL_SPO2_ALERT_CARD_V1",
    version=1,
    attention=HealthAttention.ALERT,
    rule_id=SPO2_RULE_ID,
    title_key="spo2_alert.title",
    reason_key="spo2_alert.reason",
    title_tr="Low SpO₂: rest and notify the crew medical officer",
    reason_tr=(
        "The 10-minute resting SpO₂ average is below the clear low-value "
        "reference."
    ),
    steps=(
        _STOP_AND_REST,
        ActionCardStep(
            key="confirm_second_sensor",
            text_tr="Verify the measurement with a second sensor or device.",
        ),
        _NOTIFY_MEDICAL_OFFICER,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

VITAL_TEMP_WATCH_CARD_V1 = ActionCard(
    card_id="VITAL_TEMP_WATCH_CARD_V1",
    version=1,
    attention=HealthAttention.WATCH,
    rule_id=TEMP_RULE_ID,
    title_key="temp_watch.title",
    reason_key="temp_watch.reason",
    title_tr="Monitor the body temperature trend",
    reason_tr=(
        "The one-hour body temperature average is clearly above the personal "
        "baseline."
    ),
    steps=(
        ActionCardStep(
            key="verify_sensor_contact",
            text_tr=(
                "Check the temperature sensor's skin contact and verify with a "
                "second measurement."
            ),
        ),
        _RECORD_SYMPTOMS,
        ActionCardStep(
            key="reassess_one_hour",
            text_tr="Measure again within one hour and record the change.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

VITAL_TEMP_ALERT_CARD_V1 = ActionCard(
    card_id="VITAL_TEMP_ALERT_CARD_V1",
    version=1,
    attention=HealthAttention.ALERT,
    rule_id=TEMP_RULE_ID,
    title_key="temp_alert.title",
    reason_key="temp_alert.reason",
    title_tr="High body temperature: notify the crew medical officer",
    reason_tr="The one-hour body temperature average is above the general fever reference.",
    steps=(
        ActionCardStep(
            key="confirm_second_thermometer",
            text_tr="Verify the temperature with a second thermometer or sensor.",
        ),
        _RECORD_SYMPTOMS,
        _NOTIFY_MEDICAL_OFFICER,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

MULTI_CARDIO_RESP_WATCH_CARD_V1 = ActionCard(
    card_id="MULTI_CARDIO_RESP_WATCH_CARD_V1",
    version=1,
    attention=HealthAttention.WATCH,
    rule_id=CARDIO_RESP_RULE_ID,
    title_key="cardio_resp_watch.title",
    reason_key="cardio_resp_watch.reason",
    title_tr="Verify resting heart rate and breathing rate",
    reason_tr=(
        "During rest, heart rate is above the personal baseline and breathing "
        "rate is above the reference."
    ),
    steps=(
        ActionCardStep(
            key="rest_and_remeasure",
            text_tr="Sit and rest for five minutes, then repeat the measurements.",
        ),
        ActionCardStep(
            key="check_activity_context",
            text_tr=(
                "Record whether there was recent exercise, EVA preparation or "
                "intense mission activity."
            ),
        ),
        _RECORD_SYMPTOMS,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

MULTI_CARDIO_RESP_ALERT_CARD_V1 = ActionCard(
    card_id="MULTI_CARDIO_RESP_ALERT_CARD_V1",
    version=1,
    attention=HealthAttention.ALERT,
    rule_id=CARDIO_RESP_RULE_ID,
    title_key="cardio_resp_alert.title",
    reason_key="cardio_resp_alert.reason",
    title_tr="Heart and breathing findings with symptom: notify the crew medical officer",
    reason_tr=(
        "High resting heart rate and breathing rate are accompanied by a "
        "subjective symptom."
    ),
    steps=(
        _STOP_AND_REST,
        ActionCardStep(
            key="remeasure_vitals",
            text_tr="Re-measure heart rate, breathing, SpO₂ and temperature.",
        ),
        _NOTIFY_MEDICAL_OFFICER,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

DATA_HR_SENSOR_CHECK_CARD_V1 = ActionCard(
    card_id="DATA_HR_SENSOR_CHECK_CARD_V1",
    version=1,
    attention=HealthAttention.UNKNOWN,
    rule_id=HR_JUMP_RULE_ID,
    title_key="hr_sensor_check.title",
    reason_key="hr_sensor_check.reason",
    title_tr="Check the heart rate sensor",
    reason_tr=(
        "The heart rate signal is suspect or invalid. This is not a health alarm; "
        "it is a data quality warning."
    ),
    steps=(
        ActionCardStep(
            key="reseat_sensor",
            text_tr="Reposition the chest strap/wrist sensor.",
        ),
        ActionCardStep(
            key="repeat_measurement",
            text_tr="Stay still for one minute and repeat the measurement.",
        ),
        ActionCardStep(
            key="log_sensor_issue",
            text_tr="If the problem persists, record the sensor fault.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=False,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

RED_FLAG_EMERGENCY_CARD_V1 = ActionCard(
    card_id="RED_FLAG_EMERGENCY_CARD_V1",
    version=1,
    attention=HealthAttention.CRITICAL,
    rule_id=RED_FLAG_RULE_ID,
    title_key="red_flag.title",
    reason_key="red_flag.reason",
    title_tr="Emergency symptom: notify the crew medical officer and ground team immediately",
    reason_tr=(
        "A red-flag symptom was reported. Normal measurements do not rule this out; "
        "proceed to the emergency procedure without waiting for evaluation."
    ),
    steps=(
        ActionCardStep(
            key="stop_and_safe_position",
            text_tr="Stop work immediately and move to a safe position.",
        ),
        ActionCardStep(
            key="alert_crew_now",
            text_tr=(
                "Notify the crew medical officer and ground team immediately; have a "
                "crew member stay with you."
            ),
        ),
        ActionCardStep(
            key="open_emergency_procedure",
            text_tr=(
                "Open the mission-specific emergency medical procedure and follow the "
                "crew medical officer's direction."
            ),
        ),
    ),
    footer_note_tr=(
        "DEMO card: the red-flag list awaits flight medicine validation. Does not "
        "diagnose; no medication or treatment is recommended. This alarm does not "
        "close on its own through measurements; a crew member evaluates and closes it."
    ),
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

_V1_CARDS: tuple[ActionCard, ...] = (
    ENV_CO2_WATCH_CARD_V1,
    VITAL_SPO2_WATCH_CARD_V1,
    VITAL_SPO2_ALERT_CARD_V1,
    VITAL_TEMP_WATCH_CARD_V1,
    VITAL_TEMP_ALERT_CARD_V1,
    MULTI_CARDIO_RESP_WATCH_CARD_V1,
    MULTI_CARDIO_RESP_ALERT_CARD_V1,
    DATA_HR_SENSOR_CHECK_CARD_V1,
    RED_FLAG_EMERGENCY_CARD_V1,
)

# Imported here so the V2 module can reuse shared constants above.
from spaceapp_logar.rules.action_cards_expanded import EXPANDED_CARDS  # noqa: E402
from spaceapp_logar.rules.action_cards_v2 import (  # noqa: E402
    ACTIVE_CARDS as _CORE_V2_CARDS,
    DATA_HR_SENSOR_CHECK_CARD_V2,
)

ACTIVE_CARDS: tuple[ActionCard, ...] = _CORE_V2_CARDS + EXPANDED_CARDS

_ALL_CARDS: tuple[ActionCard, ...] = _V1_CARDS + ACTIVE_CARDS

_CARDS_BY_ID_AND_VERSION: dict[tuple[str, int], ActionCard] = {
    (card.card_id, card.version): card for card in _ALL_CARDS
}

# Which card a rule result shows now (latest versions only). Health cards
# require VALID data; the only card for non-valid data is the sensor check.
_SELECTION: dict[tuple[str, HealthAttention, DataQuality], ActionCard] = {
    (card.rule_id, card.attention, DataQuality.VALID): card
    for card in ACTIVE_CARDS
    if card.attention is not HealthAttention.UNKNOWN
}
for _quality in (DataQuality.SUSPECT, DataQuality.FAULT):
    _SELECTION[(HR_JUMP_RULE_ID, HealthAttention.UNKNOWN, _quality)] = (
        DATA_HR_SENSOR_CHECK_CARD_V2
    )


def select_action_card(evaluation: RuleEvaluation) -> ActionCard | None:
    """Return the pre-written card for a rule result, or None if none applies."""

    return _SELECTION.get(
        (evaluation.rule_id, evaluation.health_attention, evaluation.data_quality)
    )


def get_action_card(card_id: str, version: int) -> ActionCard | None:
    """Look up a stored card reference in the card catalog."""

    return _CARDS_BY_ID_AND_VERSION.get((card_id, version))


def all_action_cards() -> tuple[ActionCard, ...]:
    return _ALL_CARDS


__all__ = [
    "APPROVED",
    "DEMO_PENDING_REVIEW",
    "ActionCard",
    "ActionCardStep",
    "CardReference",
    "ENV_CO2_WATCH_CARD_V1",
    "all_action_cards",
    "get_action_card",
    "select_action_card",
]
