"""Version 2 action cards: concrete steps with reasons, timers and conditions.

Content rules (docs/biyo.md sections 9 and 10.2):
- Steps are first actions only: verify the measurement, check the
  environment, rest, record symptoms, follow the mission procedure, notify
  the crew medical officer / ground. No diagnosis, drug, dose or invasive
  intervention. The software never commands vehicle equipment.
- "Considerations" list possible explanations and undismissed alternatives;
  they are explicitly not diagnoses.
- ENV_CO2_WATCH_CARD_V2 was approved by the project owner on 2026-11-14.
  Every other card is DEMO_PENDING_REVIEW.
"""

from spaceapp_logar.rules.card_model import (
    APPROVED,
    DEMO_PENDING_REVIEW,
    ActionCard,
    ActionCardStep,
    CardReference,
)
from spaceapp_logar.rules.co2 import RULE_ID as CO2_RULE_ID
from spaceapp_logar.rules.models import HealthAttention
from spaceapp_logar.rules.red_flags import RED_FLAG_RULE_ID
from spaceapp_logar.rules.vitals import (
    CARDIO_RESP_RULE_ID,
    HR_JUMP_RULE_ID,
    SPO2_RULE_ID,
    TEMP_RULE_ID,
)

NASA_CO2_BRIEF = CardReference(
    "NASA OCHMO Carbon Dioxide Technical Brief",
    "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf",
)
NASA_STD_3001_V2 = CardReference(
    "NASA-STD-3001 Volume 2 Rev F",
    "https://www.nasa.gov/wp-content/uploads/2025/05/nasa-std-3001-vol-2.pdf",
)
DEMO_RULES = CardReference("SpaceApp Logar DEMO rules", "docs/DEMO_RULES.md")
BIYO_GUIDE = CardReference("Biological decision guide, section 10", "docs/biyo.md")

DEMO_FOOTER = (
    "DEMO card: content awaits flight medicine expert validation. Does not "
    "diagnose; no medication or treatment is recommended. Mission-specific "
    "procedure and the crew medical officer take priority."
)
RED_FLAG_STEP = (
    "If chest pain, severe shortness of breath, fainting or new clouding of "
    "consciousness occurs, immediately use 'Report emergency'."
)


def _step(key: str, text: str, why: str) -> ActionCardStep:
    return ActionCardStep(key=key, text_tr=text, why_tr=why)


RECORD_SYMPTOMS = _step(
    "record_check_in",
    "Complete the subjective status check: fatigue, dizziness, nausea, pain, mood.",
    "Symptoms change the meaning of the measurement and feed into the level decision for some rules.",
)

ENV_CO2_WATCH_CARD_V2 = ActionCard(
    card_id="ENV_CO2_WATCH_CARD_V2",
    version=2,
    attention=HealthAttention.WATCH,
    rule_id=CO2_RULE_ID,
    title_key="co2_watch.title",
    reason_key="co2_watch.reason",
    title_tr="Cabin CO₂ high: check airflow and your module",
    reason_tr="The one-hour average CO₂ is above the nominal limit.",
    steps=(
        _step(
            "check_airflow",
            "Check the airflow where you are: are the fan and vent fronts blocked, "
            "is the sleep compartment fan running?",
            "In microgravity warm air does not rise and there is no natural air "
            "circulation; exhaled CO₂ can accumulate around the face without a fan.",
        ),
        _step(
            "compare_modules",
            "Check the CO₂ value of other modules. If it is high only here, move to "
            "a module with better ventilation.",
            "Local buildup and a problem across the whole cabin require different responses.",
        ),
        _step(
            "check_removal_system",
            "Check the status of the CO₂ removal system per the mission procedure "
            "and notify the ground team.",
            "The removal equipment is managed by the flight control team; the "
            "software does not command the equipment.",
        ),
        _step(
            "record_check_in",
            "If you have a headache, fatigue or reduced attention, complete the "
            "subjective status check.",
            "NASA reports that CO₂-related symptoms can appear in space at lower "
            "levels than on Earth; symptoms are the only indicator of effect.",
        ),
    ),
    footer_note_tr=(
        "This is a WATCH notification. The software does not command ventilation "
        "or CO₂ removal equipment. The mission-specific procedure takes priority."
    ),
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=APPROVED,
    reassess_minutes=30,
    escalate_if_tr=(
        "If headache increases, or new confusion or shortness of breath occurs, "
        "use 'Report emergency'.",
        "If CO₂ keeps rising and the removal system has failed, follow the ground "
        "team's guidance.",
    ),
    closes_when_tr="Closes by itself when the one-hour average CO₂ falls to 3 mmHg or below.",
    considerations_tr=(
        "Local buildup: blocked fan, confined area or sleep compartment",
        "Reduced efficiency or failure of the CO₂ removal system",
        "Increase in the number of people or activity in the cabin",
        "Sensor fault: compare with another module and a second gauge",
    ),
    references=(NASA_CO2_BRIEF, NASA_STD_3001_V2),
)

VITAL_SPO2_WATCH_CARD_V2 = ActionCard(
    card_id="VITAL_SPO2_WATCH_CARD_V2",
    version=2,
    attention=HealthAttention.WATCH,
    rule_id=SPO2_RULE_ID,
    title_key="spo2_watch.title",
    reason_key="spo2_watch.reason",
    title_tr="SpO₂ appears low: verify the measurement first",
    reason_tr="The 10-minute resting SpO₂ average is below the usual reference.",
    steps=(
        _step(
            "warm_still_remeasure",
            "Warm your hand and stay still; place the sensor firmly on the finger or "
            "ear and measure for one minute.",
            "A pulse oximeter can give a falsely low value with a cold finger, "
            "movement, poor contact or strong light.",
        ),
        _step(
            "second_device",
            "If possible, compare with a second device or on your other hand.",
            "If two independent measurements agree the value is real; if they "
            "disagree a sensor problem is likely.",
        ),
        _step(
            "check_cabin_atmosphere",
            "Check the cabin O₂ and pressure gauges and the SpO₂ of other crew members.",
            "If the drop comes from the cabin atmosphere it affects the whole crew.",
        ),
        RECORD_SYMPTOMS,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=10,
    escalate_if_tr=(
        "If the 10-minute average falls below 92%, the system escalates to Warning level.",
        RED_FLAG_STEP,
    ),
    closes_when_tr="Closes when the 10-minute resting average reaches 95% or above.",
    considerations_tr=(
        "Measurement error: cold hand, movement, sensor contact",
        "O₂ or pressure change in the cabin atmosphere",
        "Recovery after intense activity",
        "A health problem affecting breathing (assessed by the crew medical officer)",
    ),
    references=(DEMO_RULES,),
)

VITAL_SPO2_ALERT_CARD_V2 = ActionCard(
    card_id="VITAL_SPO2_ALERT_CARD_V2",
    version=2,
    attention=HealthAttention.ALERT,
    rule_id=SPO2_RULE_ID,
    title_key="spo2_alert.title",
    reason_key="spo2_alert.reason",
    title_tr="Low SpO₂: rest, verify and notify the crew medical officer",
    reason_tr=(
        "The 10-minute resting SpO₂ average is below the clear low-value reference."
    ),
    steps=(
        _step(
            "stop_activity_rest",
            "Stop the strenuous activity and rest, sitting in a safe place.",
            "Activity increases oxygen demand; a rest measurement is also more reliable.",
        ),
        _step(
            "confirm_second_sensor",
            "Verify the value immediately with a second device.",
            "Measurement error must be ruled out before a decision.",
        ),
        _step(
            "check_crew_and_cabin",
            "Check cabin O₂/pressure and the condition of other crew members.",
            "If several people show a drop the problem may be in the cabin "
            "atmosphere; this is a crew-wide situation.",
        ),
        _step(
            "notify_medical_officer",
            "Notify the crew medical officer and ground team; open the mission procedure.",
            "Decisions such as oxygen support are made by the crew medical officer "
            "and flight surgeon, not by the software.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=5,
    escalate_if_tr=(
        RED_FLAG_STEP,
        "If several crew members show a drop, use 'Report emergency' > "
        "'Symptoms in several crew members at the same time'.",
    ),
    closes_when_tr=(
        "If the average rises to the 92–95% range it drops to Watch; it closes at 95% or above."
    ),
    considerations_tr=VITAL_SPO2_WATCH_CARD_V2.considerations_tr,
    references=(DEMO_RULES,),
)

VITAL_TEMP_WATCH_CARD_V2 = ActionCard(
    card_id="VITAL_TEMP_WATCH_CARD_V2",
    version=2,
    attention=HealthAttention.WATCH,
    rule_id=TEMP_RULE_ID,
    title_key="temp_watch.title",
    reason_key="temp_watch.reason",
    title_tr="Body temperature above your personal baseline: monitor the trend",
    reason_tr=(
        "The one-hour body temperature average is clearly above the personal "
        "baseline."
    ),
    steps=(
        _step(
            "verify_sensor_contact",
            "Check the temperature sensor's skin contact; if possible measure with a "
            "second thermometer.",
            "Skin sensors can be affected by contact, sweating and ambient temperature.",
        ),
        _step(
            "record_context",
            "Record whether there was exercise, a hot environment or heavy clothing "
            "in the last hour.",
            "These conditions temporarily raise temperature and change its interpretation.",
        ),
        _step(
            "rest_and_log_fluids",
            "Rest if possible; record fluid intake over the last hours.",
            "Fatigue and fluid deficit affect temperature and pulse; the record helps "
            "the crew medical officer's assessment.",
        ),
        RECORD_SYMPTOMS,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=60,
    escalate_if_tr=(
        "If the one-hour average reaches 38.0 °C, the system escalates to Warning level.",
        RED_FLAG_STEP,
    ),
    closes_when_tr=(
        "Closes when the one-hour average falls below personal baseline +1.0 °C."
    ),
    considerations_tr=(
        "Exercise, hot environment or clothing",
        "Sensor contact or placement",
        "Tendency to fever associated with infection (not a diagnosis)",
        "Fluid deficit",
    ),
    references=(DEMO_RULES,),
)

VITAL_TEMP_ALERT_CARD_V2 = ActionCard(
    card_id="VITAL_TEMP_ALERT_CARD_V2",
    version=2,
    attention=HealthAttention.ALERT,
    rule_id=TEMP_RULE_ID,
    title_key="temp_alert.title",
    reason_key="temp_alert.reason",
    title_tr="High body temperature: verify, record and notify the crew medical officer",
    reason_tr="The one-hour body temperature average is above the general fever reference.",
    steps=(
        _step(
            "confirm_second_thermometer",
            "Verify the temperature with a second thermometer or sensor.",
            "Measurement error must be ruled out before a decision.",
        ),
        RECORD_SYMPTOMS,
        _step(
            "infection_control",
            "Apply the infection control measures in the mission procedure: hand "
            "hygiene, shared surfaces, mask if needed.",
            "In a closed habitat the risk of spread affects the whole crew.",
        ),
        _step(
            "notify_medical_officer",
            "Notify the crew medical officer and ground team; open the mission procedure.",
            "The assessment and treatment decisions are made by the crew medical "
            "officer and flight surgeon.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=30,
    escalate_if_tr=(
        RED_FLAG_STEP,
        "If several crew members show similar symptoms, use 'Report emergency "
        "symptom' > 'Symptoms in several crew members at the same time'.",
    ),
    closes_when_tr=(
        "If the average falls below 38.0 °C it drops to Watch; it closes when it "
        "falls below personal baseline +1.0 °C."
    ),
    considerations_tr=(
        "Fever associated with infection (not a diagnosis; assessed by the crew "
        "medical officer)",
        "Heat load or intense exercise",
        "Sensor fault",
    ),
    references=(DEMO_RULES,),
)

MULTI_CARDIO_RESP_WATCH_CARD_V2 = ActionCard(
    card_id="MULTI_CARDIO_RESP_WATCH_CARD_V2",
    version=2,
    attention=HealthAttention.WATCH,
    rule_id=CARDIO_RESP_RULE_ID,
    title_key="cardio_resp_watch.title",
    reason_key="cardio_resp_watch.reason",
    title_tr="Resting heart and breathing rates high: check the context",
    reason_tr=(
        "During rest, heart rate is above the personal baseline and breathing rate "
        "is above the reference."
    ),
    steps=(
        _step(
            "rest_and_remeasure",
            "Sit calmly for five minutes, then repeat the measurements.",
            "If there was recent activity, values drop within a few minutes; if not, "
            "they are meaningful.",
        ),
        _step(
            "confirm_activity_context",
            "If there was exercise, EVA preparation or intense work in the last 30 "
            "minutes, record it.",
            "If the system assumes you are resting, it may be a false alarm; context "
            "is the basis of the interpretation.",
        ),
        _step(
            "check_related_vitals",
            "Check the SpO₂ and body temperature readings.",
            "Indicators that change together narrow the likely cause; for example, a "
            "rise together with temperature.",
        ),
        RECORD_SYMPTOMS,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=15,
    escalate_if_tr=(
        "If fatigue, dizziness, nausea or pain is entered at ≥2/4, the system "
        "escalates to Warning level.",
        RED_FLAG_STEP,
    ),
    closes_when_tr=(
        "Closes when, over a 15-minute rest average, heart rate falls below personal "
        "baseline +20 bpm and breathing rate falls below 20/min."
    ),
    considerations_tr=(
        "Recent exercise or intense activity",
        "Stress or lack of sleep",
        "Fluid deficit",
        "Tendency to fever",
        "Sensor fault",
    ),
    references=(DEMO_RULES,),
)

MULTI_CARDIO_RESP_ALERT_CARD_V2 = ActionCard(
    card_id="MULTI_CARDIO_RESP_ALERT_CARD_V2",
    version=2,
    attention=HealthAttention.ALERT,
    rule_id=CARDIO_RESP_RULE_ID,
    title_key="cardio_resp_alert.title",
    reason_key="cardio_resp_alert.reason",
    title_tr="High heart and breathing rates with symptom: rest and notify the crew medical officer",
    reason_tr="High resting heart and breathing rates are accompanied by a subjective symptom.",
    steps=(
        _step(
            "stop_activity_rest",
            "Stop the strenuous activity and rest, sitting in a safe place.",
            "Resting reduces load and makes subsequent measurements interpretable.",
        ),
        _step(
            "remeasure_all_vitals",
            "Re-measure heart rate, breathing, SpO₂ and temperature.",
            "A complete set of measurements is the basis for the crew medical officer's assessment.",
        ),
        _step(
            "avoid_critical_tasks_alone",
            "Do not perform critical tasks alone; tell a crewmate your condition.",
            "Attention and performance may drop while symptoms are present.",
        ),
        _step(
            "notify_medical_officer",
            "Notify the crew medical officer and ground team; open the mission procedure.",
            "They decide the next steps.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=10,
    escalate_if_tr=(
        RED_FLAG_STEP,
        "If values keep rising despite rest, the crew medical officer consults the "
        "ground team.",
    ),
    closes_when_tr=(
        "If the elevation persists without a symptom at ≥2/4, it drops to Watch; "
        "it closes when values return to normal."
    ),
    considerations_tr=MULTI_CARDIO_RESP_WATCH_CARD_V2.considerations_tr,
    references=(DEMO_RULES,),
)

DATA_HR_SENSOR_CHECK_CARD_V2 = ActionCard(
    card_id="DATA_HR_SENSOR_CHECK_CARD_V2",
    version=2,
    attention=HealthAttention.UNKNOWN,
    rule_id=HR_JUMP_RULE_ID,
    title_key="hr_sensor_check.title",
    reason_key="hr_sensor_check.reason",
    title_tr="Check the heart rate sensor (not a health alarm)",
    reason_tr="The heart rate signal is suspect or invalid; data accuracy must be ensured first.",
    steps=(
        _step(
            "reseat_sensor",
            "Reposition the chest strap or wrist sensor and check its contact.",
            "A slipping or poorly contacting sensor produces sudden, false spikes.",
        ),
        _step(
            "still_remeasure",
            "Repeat the measurement while staying still for one minute.",
            "Movement artifact is the most common source of error.",
        ),
        _step(
            "manual_pulse",
            "If the value does not look realistic, count your pulse by hand: count for "
            "15 seconds and multiply by 4.",
            "An independent count separates the real from the false value.",
        ),
        _step(
            "log_sensor_issue",
            "If the problem persists, replace the sensor and record the fault.",
            "The fault record shows the data quality history and maintenance need.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=False,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=5,
    escalate_if_tr=(
        "If the manually counted pulse is also very high or low and symptoms are "
        "present, use 'Report emergency'.",
    ),
    closes_when_tr=(
        "Closes when no suspect spikes occur in subsequent measurements and data "
        "quality returns to Valid."
    ),
    considerations_tr=(
        "Sensor drift or weak contact",
        "Movement artifact",
        "A real rhythm change (verify by manual count)",
    ),
    references=(DEMO_RULES,),
)

RED_FLAG_EMERGENCY_CARD_V2 = ActionCard(
    card_id="RED_FLAG_EMERGENCY_CARD_V2",
    version=2,
    attention=HealthAttention.CRITICAL,
    rule_id=RED_FLAG_RULE_ID,
    title_key="red_flag.title",
    reason_key="red_flag.reason",
    title_tr="Emergency symptom: notify the crew and ground team immediately",
    reason_tr=(
        "A red-flag symptom was reported. Normal sensor values do not rule this out; "
        "proceed to the emergency procedure without waiting for evaluation."
    ),
    steps=(
        _step(
            "stop_and_secure",
            "Stop work immediately; sit in a safe place or secure yourself.",
            "Prevents injury in fainting or sudden deterioration; in microgravity "
            "securing oneself is necessary.",
        ),
        _step(
            "call_crew",
            "Alert the crew verbally; have a crew member stay with you.",
            "The situation can change quickly; not being alone is the most critical "
            "safety step.",
        ),
        _step(
            "contact_medical_and_ground",
            "Contact the crew medical officer and the flight surgeon on the ground "
            "team immediately.",
            "They make the assessment and treatment decisions; early notification "
            "saves time if there is a communication delay.",
        ),
        _step(
            "open_emergency_procedure",
            "Open the mission-specific emergency medical procedure and keep vital "
            "measurements on record.",
            "Procedure steps and recorded data are needed for the remote physician's "
            "assessment.",
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
    reassess_minutes=5,
    escalate_if_tr=(
        "If loss of consciousness or breathing difficulty increases, the crew applies "
        "the mission-specific emergency procedure.",
    ),
    closes_when_tr="Only when a crew member evaluates it and selects 'Reviewed, close'.",
    considerations_tr=(
        "Normal sensor values do not rule out a serious event",
        "The assessment is made by the crew medical officer and flight surgeon",
    ),
    references=(BIYO_GUIDE, DEMO_RULES),
)

ACTIVE_CARDS: tuple[ActionCard, ...] = (
    ENV_CO2_WATCH_CARD_V2,
    VITAL_SPO2_WATCH_CARD_V2,
    VITAL_SPO2_ALERT_CARD_V2,
    VITAL_TEMP_WATCH_CARD_V2,
    VITAL_TEMP_ALERT_CARD_V2,
    MULTI_CARDIO_RESP_WATCH_CARD_V2,
    MULTI_CARDIO_RESP_ALERT_CARD_V2,
    DATA_HR_SENSOR_CHECK_CARD_V2,
    RED_FLAG_EMERGENCY_CARD_V2,
)
