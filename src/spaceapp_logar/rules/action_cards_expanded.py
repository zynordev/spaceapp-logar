"""Version 2 cards for the coverage-expansion rules (all DEMO_PENDING_REVIEW).

Same content rules as action_cards_v2: first actions only (verify, check the
environment, rest, record, follow the mission procedure, notify the crew
medical officer / ground). No diagnosis, drug, dose or vehicle command.
"""

from spaceapp_logar.rules.action_cards_v2 import DEMO_FOOTER, DEMO_RULES, RECORD_SYMPTOMS, RED_FLAG_STEP
from spaceapp_logar.rules.card_model import (
    DEMO_PENDING_REVIEW,
    ActionCard,
    ActionCardStep,
    CardReference,
)
from spaceapp_logar.rules.expanded import (
    ATMOSPHERE_RULE_ID,
    MOTION_RULE_ID,
    RADIATION_RULE_ID,
    SLEEP_RULE_ID,
    VISION_RULE_ID,
)
from spaceapp_logar.rules.models import HealthAttention

NASA_HRP_RISKS = CardReference(
    "NASA Human Research Roadmap — Risks",
    "https://humanresearchroadmap.nasa.gov/Risks/default.aspx",
)
NASA_STD_3001_V1 = CardReference(
    "NASA-STD-3001 Volume 1", "https://www.nasa.gov/reference/nasa-std-3001v1/"
)


def _step(key: str, text: str, why: str) -> ActionCardStep:
    return ActionCardStep(key=key, text_tr=text, why_tr=why)


def _demo(**fields) -> ActionCard:
    return ActionCard(
        version=2,
        footer_note_tr=DEMO_FOOTER,
        allows_automatic_vehicle_command=False,
        validation_status=DEMO_PENDING_REVIEW,
        **fields,
    )


ATMOS_COMMON_CONSIDERATIONS = (
    "Cabin pressure drop (possible leak)",
    "Problem in the O₂ production or distribution system",
    "Sensor fault: compare with another module or a second gauge",
)

ENV_CABIN_ATMOSPHERE_WATCH_CARD_V2 = _demo(
    card_id="ENV_CABIN_ATMOSPHERE_WATCH_CARD_V2",
    attention=HealthAttention.WATCH,
    rule_id=ATMOSPHERE_RULE_ID,
    title_key="atmosphere_watch.title",
    reason_key="atmosphere_watch.reason",
    title_tr="Cabin O₂ partial pressure is falling: check gauges and modules",
    reason_tr="The O₂ partial pressure over the last 15 minutes is below the watch threshold.",
    steps=(
        _step(
            "check_gauges",
            "Compare the cabin O₂ and total pressure gauges with a second source.",
            "The measurement must be verified first; a single sensor can mislead.",
        ),
        _step(
            "compare_modules",
            "Check the O₂ and pressure values of the other modules.",
            "Whether the problem is in one module or the whole cabin changes the response.",
        ),
        _step(
            "check_crew_spo2",
            "Check crew members' SpO₂ values and for dizziness/headache symptoms.",
            "An atmosphere problem affects the whole crew at once; symptoms show its impact.",
        ),
        _step(
            "notify_flight_control",
            "Notify the ground team and open the mission-specific atmosphere procedure.",
            "The flight control team manages the O₂ system and leak control; the software issues no commands.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=10,
    escalate_if_tr=(
        "If the O₂ partial pressure falls below 16 kPa, the system rises to Warning level.",
        "If pressure is falling rapidly or several people show symptoms, follow the "
        "mission-specific emergency atmosphere procedure (crew-level).",
        RED_FLAG_STEP,
    ),
    closes_when_tr="Closes when the 15-minute O₂ partial pressure rises to 18 kPa or above.",
    considerations_tr=ATMOS_COMMON_CONSIDERATIONS,
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

ENV_CABIN_ATMOSPHERE_ALERT_CARD_V2 = _demo(
    card_id="ENV_CABIN_ATMOSPHERE_ALERT_CARD_V2",
    attention=HealthAttention.ALERT,
    rule_id=ATMOSPHERE_RULE_ID,
    title_key="atmosphere_alert.title",
    reason_key="atmosphere_alert.reason",
    title_tr="Low O₂ partial pressure: alert the crew and apply the atmosphere procedure",
    reason_tr="O₂ partial pressure is below the level where symptoms begin in general safety references.",
    steps=(
        _step(
            "alert_crew",
            "Alert the whole crew by voice; no one should work alone.",
            "Low O₂ can impair thinking and decision-making without being noticed; "
            "watching each other is the fastest safety measure.",
        ),
        _step(
            "follow_atmosphere_procedure",
            "Open the mission-specific atmosphere/emergency procedure and carry out its steps.",
            "Decisions such as masks, compartment changes or system intervention are "
            "defined in the procedure; the software does not issue them.",
        ),
        _step(
            "notify_ground",
            "Notify the ground team immediately.",
            "Locating the source and system intervention are carried out with the flight control team.",
        ),
        _step(
            "monitor_spo2",
            "Record crew SpO₂ values at short intervals.",
            "Shows the degree of impact on individuals and provides data to the crew medical officer.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=5,
    escalate_if_tr=(
        "If clouded consciousness or severe breathlessness occurs, use 'Report emergency'.",
    ),
    closes_when_tr="If the O₂ partial pressure rises above 16 kPa it drops to WATCH; it closes above 18 kPa.",
    considerations_tr=ATMOS_COMMON_CONSIDERATIONS,
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

ENV_RADIATION_WATCH_CARD_V2 = _demo(
    card_id="ENV_RADIATION_WATCH_CARD_V2",
    attention=HealthAttention.WATCH,
    rule_id=RADIATION_RULE_ID,
    title_key="radiation_watch.title",
    reason_key="radiation_watch.reason",
    title_tr="Radiation dose rate rising: watch ground team alerts and prepare",
    reason_tr="The dose rate over the last 15 minutes is clearly above the module's own baseline.",
    steps=(
        _step(
            "check_dosimeters",
            "Check the values of the other modules and the personal dosimeter.",
            "If the rise is seen everywhere it is external (e.g. a solar event); if on a "
            "single sensor it may be a measurement problem.",
        ),
        _step(
            "follow_ground_radiation_team",
            "Watch the ground team's radiation alerts and guidance.",
            "Solar events are monitored by experts on the ground, who make the protection decision.",
        ),
        _step(
            "prepare_shelter",
            "Prepare the location of the mission-specific shielded area and the transfer procedure.",
            "If needed, transfer must happen within minutes; preparation saves time.",
        ),
        _step(
            "postpone_eva",
            "Re-evaluate planned EVA or less-shielded work with the ground team.",
            "Time spent in the least-shielded places increases exposure.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=15,
    escalate_if_tr=(
        "If the dose rate reaches 10 times the baseline, the system rises to Warning level.",
        "If the ground team calls for shelter, follow the procedure without waiting.",
    ),
    closes_when_tr="Closes when the 15-minute dose rate falls below 3 times the baseline.",
    considerations_tr=(
        "Solar particle event",
        "Passage through a high-radiation region in orbit",
        "Dosimeter fault",
    ),
    references=(DEMO_RULES, NASA_STD_3001_V1, NASA_HRP_RISKS),
)

ENV_RADIATION_ALERT_CARD_V2 = _demo(
    card_id="ENV_RADIATION_ALERT_CARD_V2",
    attention=HealthAttention.ALERT,
    rule_id=RADIATION_RULE_ID,
    title_key="radiation_alert.title",
    reason_key="radiation_alert.reason",
    title_tr="Dose rate very high: apply the move-to-shelter procedure",
    reason_tr="The dose rate is above 10 times the module baseline; a possible solar particle event.",
    steps=(
        _step(
            "alert_crew",
            "Alert the whole crew by voice.",
            "Sheltering requires the whole crew to move at the same time.",
        ),
        _step(
            "move_to_shelter",
            "Move to the shielded area per the mission-specific procedure; take your personal dosimeter with you.",
            "Thick shielding and water/material mass reduce particle radiation.",
        ),
        _step(
            "stop_eva",
            "Stop EVA or work in less-shielded areas; return in coordination with the ground team.",
            "Protection is lowest during a spacewalk.",
        ),
        _step(
            "notify_ground",
            "Report your location and dosimeter values to the ground team.",
            "The ground team decides when the event has ended and when to exit.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=10,
    escalate_if_tr=(
        "If nausea, vomiting or lethargy starts, record the subjective status and "
        "notify the crew medical officer.",
        RED_FLAG_STEP,
    ),
    closes_when_tr=(
        "Drops to WATCH if the dose rate falls below 10 times the baseline; closes when "
        "it falls below 3 times. The ground team decides when to leave shelter."
    ),
    considerations_tr=ENV_RADIATION_WATCH_CARD_V2.considerations_tr,
    references=(DEMO_RULES, NASA_STD_3001_V1, NASA_HRP_RISKS),
)

BEHAV_SLEEP_WATCH_CARD_V2 = _demo(
    card_id="BEHAV_SLEEP_WATCH_CARD_V2",
    attention=HealthAttention.WATCH,
    rule_id=SLEEP_RULE_ID,
    title_key="sleep_watch.title",
    reason_key="sleep_watch.reason",
    title_tr="Sleep debt building up: review sleep routine and workload",
    reason_tr="The average sleep duration over recent nights is below the watch threshold.",
    steps=(
        _step(
            "review_schedule",
            "Review workload and sleep schedule with the crew and ground team.",
            "Sleep loss in space mostly comes from an intense schedule; the fix is in planning.",
        ),
        _step(
            "check_sleep_station",
            "Check light, noise, temperature and fan airflow in the sleep compartment.",
            "Light affects the circadian rhythm and poor airflow increases CO₂ buildup; both disrupt sleep.",
        ),
        _step(
            "log_caffeine_light",
            "Record caffeine intake time and screen/light exposure before sleep.",
            "This information helps distinguish the likely causes of the sleep problem.",
        ),
        RECORD_SYMPTOMS,
    ),
    requires_mission_procedure=False,
    reassess_minutes=24 * 60,
    escalate_if_tr=(
        "If the average falls below 5 hours and fatigue or mood distress is ≥3/4, "
        "the system rises to Warning level.",
    ),
    closes_when_tr="Closes when the average of recent nights rises to 6 hours or more.",
    considerations_tr=(
        "Intense mission schedule or shift change",
        "Sleep environment: light, noise, temperature, airflow",
        "Stress or mood change",
        "Space motion sickness or pain",
    ),
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

BEHAV_SLEEP_ALERT_CARD_V2 = _demo(
    card_id="BEHAV_SLEEP_ALERT_CARD_V2",
    attention=HealthAttention.ALERT,
    rule_id=SLEEP_RULE_ID,
    title_key="sleep_alert.title",
    reason_key="sleep_alert.reason",
    title_tr="Severe sleep debt and fatigue: review critical tasks with the crew medical officer",
    reason_tr="Very short sleep over recent nights, with high fatigue or mood distress reported.",
    steps=(
        _step(
            "notify_medical_officer",
            "Notify the crew medical officer and ground team.",
            "They make the decisions on sleep and mood support.",
        ),
        _step(
            "review_critical_tasks",
            "Review critical tasks such as EVA, robotic arm or vehicle maneuvers with the "
            "crew medical officer before planning them.",
            "Sleep loss impairs attention and reaction time; the risk of error increases.",
        ),
        _step(
            "protect_sleep_window",
            "Arrange the schedule with the ground team to protect the next sleep period.",
            "Sleep debt only closes with real sleep duration.",
        ),
        _step(
            "talk_to_someone",
            "If mood distress is present, reach out to a crew member or the mission-specific "
            "psychological support channel.",
            "Early support in isolation prevents problems from growing.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=12 * 60,
    escalate_if_tr=(
        "If thoughts of self-harm or a sudden change in behavior occur, immediately "
        "notify the crew medical officer and ground team.",
    ),
    closes_when_tr=(
        "If symptoms decrease, it drops to WATCH; it closes when the average sleep rises to 6 hours or more."
    ),
    considerations_tr=BEHAV_SLEEP_WATCH_CARD_V2.considerations_tr,
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

SENS_MOTION_SICKNESS_WATCH_CARD_V2 = _demo(
    card_id="SENS_MOTION_SICKNESS_WATCH_CARD_V2",
    attention=HealthAttention.WATCH,
    rule_id=MOTION_RULE_ID,
    title_key="motion_watch.title",
    reason_key="motion_watch.reason",
    title_tr="Nausea and dizziness: watch the motion sickness pattern",
    reason_tr="Nausea and dizziness were reported together.",
    steps=(
        _step(
            "limit_head_movements",
            "Avoid sudden head movements and rapid turns.",
            "In microgravity, the mismatch between the inner ear and the eyes increases with head movement.",
        ),
        _step(
            "visual_orientation",
            "Fix your visual orientation by treating a surface as 'down'; look at a fixed point if possible.",
            "A consistent visual reference helps the brain recover its sense of direction.",
        ),
        _step(
            "rest_and_log_fluids",
            "Rest; record fluid intake and whether vomiting occurred.",
            "Vomiting causes fluid loss; the record is for the crew medical officer's assessment.",
        ),
        _step(
            "notify_medical_officer",
            "Notify the crew medical officer.",
            "They make the decisions on support and treatment.",
        ),
    ),
    requires_mission_procedure=False,
    reassess_minutes=4 * 60,
    escalate_if_tr=(
        "If symptoms began days after the gravity transition or are accompanied by fever, "
        "severe headache or vision changes, notify the crew medical officer immediately.",
        RED_FLAG_STEP,
    ),
    closes_when_tr="Closes when nausea or dizziness falls below 2/4.",
    considerations_tr=(
        "Space motion sickness (common in the first days after the gravity transition)",
        "Elevated cabin CO₂",
        "Infection",
        "Inner ear or another health problem (assessed by the crew medical officer)",
    ),
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

SANS_VISION_WATCH_CARD_V2 = _demo(
    card_id="SANS_VISION_WATCH_CARD_V2",
    attention=HealthAttention.WATCH,
    rule_id=VISION_RULE_ID,
    title_key="vision_watch.title",
    reason_key="vision_watch.reason",
    title_tr="Vision change reported: record it and notify the crew medical officer",
    reason_tr="A vision change above the watch threshold was reported.",
    steps=(
        _step(
            "describe_change",
            "Record the change: which eye, near or far, when it started, sudden or gradual.",
            "The details determine the significance and urgency of the change.",
        ),
        _step(
            "vision_check",
            "Perform the mission-specific vision test and record the result.",
            "On long missions, vision changes are monitored through regular examination (SANS).",
        ),
        _step(
            "notify_medical_officer",
            "Notify the crew medical officer and ground team.",
            "Eye examination and imaging decisions are theirs.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=24 * 60,
    escalate_if_tr=(
        "If the change is sudden and serious, use 'Report emergency' > 'Sudden and serious vision change'.",
    ),
    closes_when_tr="Closes when the reported vision change falls below 2/4.",
    considerations_tr=(
        "Spaceflight-associated neuro-ocular syndrome (SANS)",
        "Dry eyes or fatigue",
        "CO₂-related headache",
    ),
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

EXPANDED_CARDS: tuple[ActionCard, ...] = (
    ENV_CABIN_ATMOSPHERE_WATCH_CARD_V2,
    ENV_CABIN_ATMOSPHERE_ALERT_CARD_V2,
    ENV_RADIATION_WATCH_CARD_V2,
    ENV_RADIATION_ALERT_CARD_V2,
    BEHAV_SLEEP_WATCH_CARD_V2,
    BEHAV_SLEEP_ALERT_CARD_V2,
    SENS_MOTION_SICKNESS_WATCH_CARD_V2,
    SANS_VISION_WATCH_CARD_V2,
)
