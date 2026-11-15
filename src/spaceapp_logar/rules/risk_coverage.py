"""Honest coverage map: NASA's five spaceflight hazards -> health risks -> us.

Hazards follow NASA's Human Research Program; risk titles are short Turkish
descriptions (not official NASA titles). For every risk the map says what we
collect, which rule (if any) acts on it, and what is still missing. Coverage
is derived from the rule catalog, so the map cannot claim a rule that does
not exist.
"""

from dataclasses import dataclass

from spaceapp_logar.rules.catalog import RULES

RULE = "RULE"
DATA_ONLY = "DATA_ONLY"
GAP = "GAP"


@dataclass(frozen=True, slots=True)
class Risk:
    key: str
    title_tr: str
    indicators_tr: tuple[str, ...]
    rule_ids: tuple[str, ...]
    note_tr: str
    data_only: bool = False


@dataclass(frozen=True, slots=True)
class Hazard:
    key: str
    title_tr: str
    risks: tuple[Risk, ...]


HAZARDS: tuple[Hazard, ...] = (
    Hazard(
        "RADIATION",
        "Space radiation",
        (
            Risk(
                "acute_radiation",
                "Acute high exposure (solar particle event)",
                ("Radiation dose rate",),
                ("ENV_RADIATION_V1",),
                "Sudden rise relative to the module's own baseline; shelter-area procedure card.",
            ),
            Risk(
                "cumulative_radiation",
                "Cumulative dose (long-term cancer, cardiovascular, nervous system)",
                ("Radiation dose rate (total over time)",),
                ("ENV_RADIATION_V1",),
                "Cumulative dose is recorded over the mission; no long-term risk estimate is made.",
            ),
        ),
    ),
    Hazard(
        "ISOLATION",
        "Isolation and confinement",
        (
            Risk(
                "sleep_circadian",
                "Sleep loss and circadian disruption",
                ("Sleep duration", "Fatigue (subjective)"),
                ("BEHAV_SLEEP_V1",),
                "Nightly sleep duration and fatigue; sleep quality and light exposure are not measured.",
            ),
            Risk(
                "behavioral_health",
                "Behavioral health and mood",
                ("Mood distress (subjective)",),
                ("BEHAV_SLEEP_V1",),
                "Mood only raises the level within the sleep rule; there is no separate mood rule.",
            ),
            Risk(
                "team_performance",
                "Crew cohesion and performance",
                (),
                (),
                "Not measured; cognitive tests and crew assessment are needed.",
            ),
        ),
    ),
    Hazard(
        "DISTANCE",
        "Distance from Earth",
        (
            Risk(
                "in_mission_emergency",
                "Medical emergencies arising during the mission",
                ("Red flag symptoms",),
                ("RED_FLAG_SYMPTOM_V1",),
                "Chest pain, severe breathlessness, fainting, etc. are Critical immediately; no diagnosis is made.",
            ),
            Risk(
                "infection_immune",
                "Immune change and infection",
                ("Body temperature", "Resting heart/breathing rate", "WBC (laboratory)"),
                ("VITAL_TEMP_TREND_V1", "MULTI_CARDIO_RESP_V1"),
                "Temperature trend and heart-breathing pattern; lab results are shown for information only.",
            ),
            Risk(
                "limited_medical_care",
                "Limited medical capability and communication delay",
                (),
                (),
                "Environmental context (communication delay, location) belongs to Kuzey's environment-profile work.",
            ),
        ),
    ),
    Hazard(
        "GRAVITY",
        "Changing gravity fields",
        (
            Risk(
                "space_motion_sickness",
                "Space motion sickness (sensorimotor adaptation)",
                ("Nausea", "Dizziness"),
                ("SENS_MOTION_SICKNESS_V1",),
                "Symptom pattern; gravity-transition day context is not available yet.",
            ),
            Risk(
                "sans",
                "Spaceflight-associated neuro-ocular syndrome (SANS)",
                ("Vision change (subjective)",),
                ("SANS_VISION_SYMPTOM_V1",),
                "Reported symptom only; no eye examination or imaging data.",
            ),
            Risk(
                "cardiovascular_orthostatic",
                "Cardiovascular adaptation and orthostatic blood pressure drop",
                ("Heart rate", "Heart rate variability (RMSSD)", "Systolic/diastolic blood pressure"),
                (),
                "Data (including HRV) are collected and charted; there is no HRV rule or threshold, and a validated threshold is needed.",
                data_only=True,
            ),
            Risk(
                "fluid_shift",
                "Fluid shift (facial puffiness, nasal congestion)",
                ("Nasal congestion / facial puffiness (subjective)",),
                (),
                "Symptom is recorded; no rule.",
                data_only=True,
            ),
            Risk(
                "spine_back_pain",
                "Spinal lengthening and back pain",
                ("Back pain (subjective)",),
                (),
                "Symptom is recorded; no rule.",
                data_only=True,
            ),
            Risk(
                "muscle_aerobic",
                "Muscle loss and aerobic capacity decline",
                (),
                (),
                "Exercise logs and strength tests are needed; not measured.",
            ),
            Risk(
                "bone_kidney",
                "Bone loss and kidney stones",
                (),
                (),
                "Bone density, urine and calcium monitoring are needed; not measured.",
            ),
        ),
    ),
    Hazard(
        "HOSTILE_ENVIRONMENT",
        "Confined and hostile environment",
        (
            Risk(
                "cabin_co2",
                "Cabin CO₂ buildup",
                ("Cabin CO₂ (per module)",),
                ("ENV_CO2_NOMINAL_V1",),
                "NASA-STD-3001 nominal limit; approved rule and card.",
            ),
            Risk(
                "hypoxia",
                "Low oxygen (hypoxia)",
                ("Cabin O₂ and pressure", "SpO₂"),
                ("ENV_CABIN_ATMOSPHERE_V1", "VITAL_SPO2_SUSTAINED_V1"),
                "Cabin O₂ partial pressure and the crew member's SpO₂ are watched together.",
            ),
            Risk(
                "decompression",
                "Decompression sickness (EVA, pressure change)",
                ("Cabin pressure",),
                (),
                "Pressure is recorded; EVA and pre-breathing context is not available.",
                data_only=True,
            ),
            Risk(
                "celestial_dust",
                "Lunar/Martian dust exposure",
                (),
                (),
                "No dust sensor or exposure data.",
            ),
            Risk(
                "noise_hearing",
                "Noise and hearing loss",
                (),
                (),
                "No noise measurements.",
            ),
        ),
    ),
    Hazard(
        "DATA",
        "Cross-cutting: data reliability",
        (
            Risk(
                "sensor_reliability",
                "Telling sensor error apart from a health problem",
                ("Source quality flag", "Physically plausible range", "Heart rate jump"),
                ("DATA_HR_JUMP_V1",),
                "Bad data does not raise a health alarm and sets the overall status to 'Unknown'.",
            ),
        ),
    ),
)


def coverage_of(risk: Risk) -> str:
    if risk.rule_ids and all(rule_id in RULES for rule_id in risk.rule_ids):
        return RULE
    if risk.data_only or risk.indicators_tr:
        return DATA_ONLY
    return GAP
