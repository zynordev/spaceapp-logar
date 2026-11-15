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
    BodyRegion("head", "Baş ve uyku", "Uyku süresi, yorgunluk ve baş ağrısı gibi belirtilerle ilgili ölçümler."),
    BodyRegion("eyes", "Gözler", "Görme değişikliği belirtilerinin izlenmesi."),
    BodyRegion("inner_ear", "İç kulak ve denge", "Bulantı ve baş dönmesi gibi denge ile ilgili belirtilerin izlenmesi."),
    BodyRegion("heart", "Kalp-dolaşım", "Kalp hızı ve tansiyon ölçümleri."),
    BodyRegion("lungs", "Solunum", "Oksijen satürasyonu ve solunum hızı ölçümleri."),
    BodyRegion("torso", "Gövde", "Göğüs ve karın bölgesini ilgilendiren genel belirtiler ve kırmızı bayrak bildirimleri."),
    BodyRegion("musculoskeletal", "Kas-iskelet", "Sırt ağrısı ve kas-iskelet belirtilerinin izlenmesi."),
    BodyRegion("skin", "Cilt ve vücut ısısı", "Vücut sıcaklığı ölçümleri ve eğilimi."),
    BodyRegion("cabin", "Kabin ortamı", "Kabin CO₂, O₂, basınç ve radyasyon ölçümleri."),
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
