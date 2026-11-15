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
        "Uzay radyasyonu",
        (
            Risk(
                "acute_radiation",
                "Ani yüksek maruziyet (güneş parçacık olayı)",
                ("Radyasyon doz hızı",),
                ("ENV_RADIATION_V1",),
                "Modülün kendi başlangıcına göre ani artış; korunaklı bölüm prosedürü kartı.",
            ),
            Risk(
                "cumulative_radiation",
                "Kümülatif doz (uzun dönem kanser, kalp-damar, sinir sistemi)",
                ("Radyasyon doz hızı (zamana göre toplam)",),
                ("ENV_RADIATION_V1",),
                "Görev boyunca kümülatif doz kaydedilir; uzun dönem risk tahmini yapılmaz.",
            ),
        ),
    ),
    Hazard(
        "ISOLATION",
        "İzolasyon ve kapalı kalma",
        (
            Risk(
                "sleep_circadian",
                "Uyku kaybı ve sirkadiyen bozulma",
                ("Uyku süresi", "Yorgunluk (öznel)"),
                ("BEHAV_SLEEP_V1",),
                "Gecelik uyku süresi ve yorgunluk; uyku kalitesi ve ışık maruziyeti ölçülmüyor.",
            ),
            Risk(
                "behavioral_health",
                "Davranışsal sağlık ve ruh hali",
                ("Ruh hali sıkıntısı (öznel)",),
                ("BEHAV_SLEEP_V1",),
                "Ruh hali yalnızca uyku kuralında seviyeyi yükseltir; ayrı bir ruh hali kuralı yok.",
            ),
            Risk(
                "team_performance",
                "Ekip uyumu ve performans",
                (),
                (),
                "Ölçülmüyor; bilişsel testler ve ekip değerlendirmesi gerekir.",
            ),
        ),
    ),
    Hazard(
        "DISTANCE",
        "Dünya'dan uzaklık",
        (
            Risk(
                "in_mission_emergency",
                "Görev sırasında ortaya çıkan acil tıbbi durumlar",
                ("Kırmızı bayrak belirtileri",),
                ("RED_FLAG_SYMPTOM_V1",),
                "Göğüs ağrısı, ciddi nefes darlığı, bayılma vb. anında Kritik; teşhis yok.",
            ),
            Risk(
                "infection_immune",
                "Bağışıklık değişimi ve enfeksiyon",
                ("Vücut sıcaklığı", "Dinlenme kalp/solunum", "WBC (laboratuvar)"),
                ("VITAL_TEMP_TREND_V1", "MULTI_CARDIO_RESP_V1"),
                "Sıcaklık eğilimi ve kalp-solunum; laboratuvar yalnızca bilgi olarak gösterilir.",
            ),
            Risk(
                "limited_medical_care",
                "Sınırlı tıbbi imkân ve iletişim gecikmesi",
                (),
                (),
                "Ortam bağlamı (iletişim gecikmesi, konum) Kuzey'in ortam profili işinde.",
            ),
        ),
    ),
    Hazard(
        "GRAVITY",
        "Değişen yerçekimi alanları",
        (
            Risk(
                "space_motion_sickness",
                "Uzay hareket hastalığı (sensorimotor uyum)",
                ("Bulantı", "Baş dönmesi"),
                ("SENS_MOTION_SICKNESS_V1",),
                "Belirti örüntüsü; yerçekimi geçiş günü bağlamı henüz yok.",
            ),
            Risk(
                "sans",
                "Uzay uçuşuyla ilişkili nöro-oküler sendrom (SANS)",
                ("Görme değişikliği (öznel)",),
                ("SANS_VISION_SYMPTOM_V1",),
                "Yalnızca bildirilen belirti; göz muayenesi ve görüntüleme verisi yok.",
            ),
            Risk(
                "cardiovascular_orthostatic",
                "Kalp-damar uyumu ve ayağa kalkınca tansiyon düşmesi",
                ("Kalp hızı", "Kalp hızı değişkenliği (RMSSD)", "Sistolik/diyastolik tansiyon"),
                (),
                "Veriler (HRV dahil) toplanıyor ve grafikte; HRV için kural/eşik yok, doğrulanmış eşik gerekiyor.",
                data_only=True,
            ),
            Risk(
                "fluid_shift",
                "Sıvı kayması (yüzde şişkinlik, burun tıkanıklığı)",
                ("Burun tıkanıklığı / yüz şişkinliği (öznel)",),
                (),
                "Belirti kaydediliyor; kural yok.",
                data_only=True,
            ),
            Risk(
                "spine_back_pain",
                "Omurga uzaması ve sırt ağrısı",
                ("Sırt ağrısı (öznel)",),
                (),
                "Belirti kaydediliyor; kural yok.",
                data_only=True,
            ),
            Risk(
                "muscle_aerobic",
                "Kas kaybı ve aerobik kapasite düşüşü",
                (),
                (),
                "Egzersiz kaydı ve güç testleri gerekir; ölçülmüyor.",
            ),
            Risk(
                "bone_kidney",
                "Kemik kaybı ve böbrek taşı",
                (),
                (),
                "Kemik yoğunluğu, idrar ve kalsiyum takibi gerekir; ölçülmüyor.",
            ),
        ),
    ),
    Hazard(
        "HOSTILE_ENVIRONMENT",
        "Kapalı ve düşmanca ortam",
        (
            Risk(
                "cabin_co2",
                "Kabin CO₂ birikimi",
                ("Kabin CO₂ (modül bazında)",),
                ("ENV_CO2_NOMINAL_V1",),
                "NASA-STD-3001 nominal sınırı; onaylı kural ve kart.",
            ),
            Risk(
                "hypoxia",
                "Düşük oksijen (hipoksi)",
                ("Kabin O₂ ve basınç", "SpO₂"),
                ("ENV_CABIN_ATMOSPHERE_V1", "VITAL_SPO2_SUSTAINED_V1"),
                "Kabin O₂ kısmi basıncı ve kişinin SpO₂'si birlikte izlenir.",
            ),
            Risk(
                "decompression",
                "Dekompresyon hastalığı (EVA, basınç değişimi)",
                ("Kabin basıncı",),
                (),
                "Basınç kaydediliyor; EVA ve ön-nefes bağlamı yok.",
                data_only=True,
            ),
            Risk(
                "celestial_dust",
                "Ay/Mars tozu maruziyeti",
                (),
                (),
                "Toz sensörü ve maruziyet verisi yok.",
            ),
            Risk(
                "noise_hearing",
                "Gürültü ve işitme kaybı",
                (),
                (),
                "Gürültü ölçümü yok.",
            ),
        ),
    ),
    Hazard(
        "DATA",
        "Kesitler arası: veri güvenilirliği",
        (
            Risk(
                "sensor_reliability",
                "Sensör hatası ile sağlık sorununu ayırmak",
                ("Kaynak kalite bayrağı", "Fiziksel olarak mümkün aralık", "Kalp hızı sıçraması"),
                ("DATA_HR_JUMP_V1",),
                "Kötü veri sağlık alarmı üretmez ve genel durumu 'Bilinmiyor' yapar.",
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
