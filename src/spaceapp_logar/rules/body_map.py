"""Body-region catalogue and the single rule/metric -> region mapping.

Region keys are fixed: the 3D body model uses the same keys. Descriptions are
neutral and non-diagnostic; a region only groups the rules and measurements
that relate to it.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BodyRegion:
    key: str
    label_tr: str
    description_tr: str


REGIONS: tuple[BodyRegion, ...] = (
    BodyRegion("head", "Head and sleep", "Measurements related to symptoms such as sleep duration, fatigue and headache."),
    BodyRegion("eyes", "Eyes", "Monitoring of vision change symptoms."),
    BodyRegion("inner_ear", "Inner ear and balance", "Monitoring of balance-related symptoms such as nausea and dizziness."),
    BodyRegion("heart", "Heart and circulation", "Heart rate and blood pressure measurements."),
    BodyRegion("lungs", "Breathing", "Oxygen saturation and breathing rate measurements."),
    BodyRegion("torso", "Torso", "General symptoms involving the chest and abdomen, and red-flag reports."),
    BodyRegion("musculoskeletal", "Musculoskeletal", "Monitoring of back pain and musculoskeletal symptoms."),
    BodyRegion("skin", "Skin and body temperature", "Body temperature measurements and trend."),
    BodyRegion("cabin", "Cabin environment", "Cabin CO₂, O₂, pressure and radiation measurements."),
)

REGION_KEYS: tuple[str, ...] = tuple(region.key for region in REGIONS)

# Every rule id in rules.catalog.RULES must appear here (tests enforce it).
RULE_REGIONS: dict[str, tuple[str, ...]] = {
    "ENV_CO2_NOMINAL_V1": ("cabin", "head"),
    "ENV_CABIN_ATMOSPHERE_V1": ("cabin",),
    "ENV_RADIATION_V1": ("cabin",),
    "BEHAV_SLEEP_V1": ("head",),
    "SENS_MOTION_SICKNESS_V1": ("inner_ear",),
    "SANS_VISION_SYMPTOM_V1": ("eyes",),
    "VITAL_SPO2_SUSTAINED_V1": ("lungs",),
    "VITAL_TEMP_TREND_V1": ("skin",),
    "MULTI_CARDIO_RESP_V1": ("heart", "lungs"),
    "RED_FLAG_SYMPTOM_V1": ("torso", "head"),
    "DATA_HR_JUMP_V1": ("heart",),
}

# Keyed by metric string so metrics added later (HRV_RMSSD) are harmless.
METRIC_REGIONS: dict[str, tuple[str, ...]] = {
    "HEART_RATE": ("heart",),
    "SYSTOLIC_BP": ("heart",),
    "DIASTOLIC_BP": ("heart",),
    "HRV_RMSSD": ("heart",),
    "SPO2": ("lungs",),
    "RESPIRATION_RATE": ("lungs",),
    "BODY_TEMPERATURE": ("skin",),
    "SLEEP_DURATION": ("head",),
    "CABIN_CO2_PARTIAL_PRESSURE": ("cabin",),
    "CABIN_O2_FRACTION": ("cabin",),
    "CABIN_PRESSURE": ("cabin",),
    "RADIATION_DOSE_RATE": ("cabin",),
}


def rule_ids_for(region: str) -> list[str]:
    return [r for r, regions in RULE_REGIONS.items() if region in regions]


def metrics_for(region: str) -> list[str]:
    return [m for m, regions in METRIC_REGIONS.items() if region in regions]
