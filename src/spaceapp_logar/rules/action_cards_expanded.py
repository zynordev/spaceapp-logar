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
    "NASA Human Research Roadmap — Riskler",
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
    "Kabin basıncında düşüş (olası kaçak)",
    "O₂ üretim veya dağıtım sisteminde sorun",
    "Sensör hatası: başka bir modül veya ikinci göstergeyle karşılaştır",
)

ENV_CABIN_ATMOSPHERE_WATCH_CARD_V2 = _demo(
    card_id="ENV_CABIN_ATMOSPHERE_WATCH_CARD_V2",
    attention=HealthAttention.WATCH,
    rule_id=ATMOSPHERE_RULE_ID,
    title_key="atmosphere_watch.title",
    reason_key="atmosphere_watch.reason",
    title_tr="Kabin O₂ kısmi basıncı düşüyor: göstergeleri ve modülleri kontrol et",
    reason_tr="Son 15 dakikadaki O₂ kısmi basıncı izleme sınırının altında.",
    steps=(
        _step(
            "check_gauges",
            "Kabin O₂ ve toplam basınç göstergelerini ikinci bir kaynakla karşılaştır.",
            "Önce ölçüm doğrulanmalı; tek sensör yanıltabilir.",
        ),
        _step(
            "compare_modules",
            "Diğer modüllerin O₂ ve basınç değerlerine bak.",
            "Sorun tek modülde mi, tüm kabinde mi; müdahale buna göre değişir.",
        ),
        _step(
            "check_crew_spo2",
            "Ekip üyelerinin SpO₂ değerlerine ve baş dönmesi/baş ağrısı belirtilerine bak.",
            "Atmosfer sorunu tüm ekibi aynı anda etkiler; belirtiler etkinin göstergesidir.",
        ),
        _step(
            "notify_flight_control",
            "Yer ekibine bildir ve göreve özel atmosfer prosedürünü aç.",
            "O₂ sistemi ve kaçak kontrolünü uçuş kontrol ekibi yönetir; yazılım komut vermez.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=10,
    escalate_if_tr=(
        "O₂ kısmi basıncı 16 kPa'nın altına inerse sistem Uyarı seviyesine çıkar.",
        "Basınç hızla düşüyorsa veya birden fazla kişide belirti varsa göreve özel "
        "acil atmosfer prosedürü (ekip).",
        RED_FLAG_STEP,
    ),
    closes_when_tr="15 dakikalık O₂ kısmi basıncı 18 kPa ve üzerine çıktığında kapanır.",
    considerations_tr=ATMOS_COMMON_CONSIDERATIONS,
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

ENV_CABIN_ATMOSPHERE_ALERT_CARD_V2 = _demo(
    card_id="ENV_CABIN_ATMOSPHERE_ALERT_CARD_V2",
    attention=HealthAttention.ALERT,
    rule_id=ATMOSPHERE_RULE_ID,
    title_key="atmosphere_alert.title",
    reason_key="atmosphere_alert.reason",
    title_tr="Düşük O₂ kısmi basıncı: ekibi uyar ve atmosfer prosedürünü uygula",
    reason_tr="O₂ kısmi basıncı, genel güvenlik referanslarında belirtilerin başladığı düzeyin altında.",
    steps=(
        _step(
            "alert_crew",
            "Tüm ekibe sesli haber ver; kimse yalnız çalışmasın.",
            "Düşük O₂ düşünme ve karar vermeyi fark edilmeden bozabilir; birbirinizi "
            "izlemek en hızlı güvenlik önlemidir.",
        ),
        _step(
            "follow_atmosphere_procedure",
            "Göreve özel atmosfer/acil durum prosedürünü aç ve adımlarını uygula.",
            "Maske, bölme değişimi veya sistem müdahalesi gibi kararlar prosedürde "
            "tanımlıdır; yazılım bunları vermez.",
        ),
        _step(
            "notify_ground",
            "Yer ekibine hemen bildir.",
            "Kaynağın bulunması ve sistem müdahalesi uçuş kontrol ekibiyle yapılır.",
        ),
        _step(
            "monitor_spo2",
            "Ekip SpO₂ değerlerini sık aralıklarla kaydet.",
            "Kişilerin etkilenme düzeyini gösterir ve ekip sağlık sorumlusuna veri sağlar.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=5,
    escalate_if_tr=(
        "Bilinç bulanıklığı veya ciddi nefes darlığı olursa 'Acil belirti bildir'.",
    ),
    closes_when_tr="O₂ kısmi basıncı 16 kPa üzerine çıkarsa İzle'ye iner; 18 kPa üzerinde kapanır.",
    considerations_tr=ATMOS_COMMON_CONSIDERATIONS,
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

ENV_RADIATION_WATCH_CARD_V2 = _demo(
    card_id="ENV_RADIATION_WATCH_CARD_V2",
    attention=HealthAttention.WATCH,
    rule_id=RADIATION_RULE_ID,
    title_key="radiation_watch.title",
    reason_key="radiation_watch.reason",
    title_tr="Radyasyon doz hızı artıyor: yer ekibinin uyarılarını izle ve hazırlan",
    reason_tr="Son 15 dakikadaki doz hızı, modülün kendi başlangıç değerinin belirgin üzerinde.",
    steps=(
        _step(
            "check_dosimeters",
            "Diğer modüllerin ve kişisel dozimetrenin değerine bak.",
            "Artış her yerde görülüyorsa dış kaynaklıdır (ör. güneş olayı); tek "
            "sensördeyse ölçüm sorunu olabilir.",
        ),
        _step(
            "follow_ground_radiation_team",
            "Yer ekibinin radyasyon uyarılarını ve yönlendirmesini izle.",
            "Güneş olaylarını yerdeki uzmanlar izler ve korunma kararını onlar verir.",
        ),
        _step(
            "prepare_shelter",
            "Göreve özel korunaklı bölümün yerini ve geçiş prosedürünü hazırla.",
            "Gerekirse geçiş dakikalar içinde yapılmalıdır; hazırlık zaman kazandırır.",
        ),
        _step(
            "postpone_eva",
            "Planlanan EVA veya az korunaklı bölümlerdeki işleri yer ekibiyle yeniden değerlendir.",
            "Koruma en az olan yerlerde geçirilen süre maruziyeti artırır.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=15,
    escalate_if_tr=(
        "Doz hızı başlangıcın 10 katına ulaşırsa sistem Uyarı seviyesine çıkar.",
        "Yer ekibi korunma çağrısı yaparsa beklemeden prosedürü uygula.",
    ),
    closes_when_tr="15 dakikalık doz hızı başlangıcın 3 katının altına indiğinde kapanır.",
    considerations_tr=(
        "Güneş parçacık olayı",
        "Yörüngede yüksek radyasyon bölgesinden geçiş",
        "Dozimetre hatası",
    ),
    references=(DEMO_RULES, NASA_STD_3001_V1, NASA_HRP_RISKS),
)

ENV_RADIATION_ALERT_CARD_V2 = _demo(
    card_id="ENV_RADIATION_ALERT_CARD_V2",
    attention=HealthAttention.ALERT,
    rule_id=RADIATION_RULE_ID,
    title_key="radiation_alert.title",
    reason_key="radiation_alert.reason",
    title_tr="Doz hızı çok yüksek: korunaklı bölüme geçiş prosedürünü uygula",
    reason_tr="Doz hızı, modül başlangıcının 10 katının üzerinde; olası güneş parçacık olayı.",
    steps=(
        _step(
            "alert_crew",
            "Tüm ekibe sesli haber ver.",
            "Korunma, tüm ekibin aynı anda hareket etmesini gerektirir.",
        ),
        _step(
            "move_to_shelter",
            "Göreve özel prosedüre göre korunaklı bölüme geç; kişisel dozimetreni yanına al.",
            "Kalın koruma ve su/malzeme kütlesi parçacık radyasyonunu azaltır.",
        ),
        _step(
            "stop_eva",
            "EVA veya az korunaklı bölümdeki işleri durdur; yer ekibiyle koordineli dön.",
            "Uzay yürüyüşünde koruma en düşüktür.",
        ),
        _step(
            "notify_ground",
            "Yer ekibine konumunu ve dozimetre değerlerini bildir.",
            "Olayın ne zaman bittiğine ve çıkış zamanına yer ekibi karar verir.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=10,
    escalate_if_tr=(
        "Bulantı, kusma veya halsizlik başlarsa öznel durumu kaydet ve ekip sağlık "
        "sorumlusuna bildir.",
        RED_FLAG_STEP,
    ),
    closes_when_tr=(
        "Doz hızı başlangıcın 10 katının altına inerse İzle'ye, 3 katının altına inerse "
        "kapanır. Korunaktan çıkış kararını yer ekibi verir."
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
    title_tr="Uyku borcu birikiyor: uyku düzenini ve iş yükünü gözden geçir",
    reason_tr="Son gecelerin ortalama uyku süresi izleme sınırının altında.",
    steps=(
        _step(
            "review_schedule",
            "İş yükünü ve uyku saatlerini ekip ve yer ekibiyle gözden geçir.",
            "Uzayda uyku kaybı çoğunlukla yoğun programdan kaynaklanır; çözüm planlamadadır.",
        ),
        _step(
            "check_sleep_station",
            "Uyku bölmesinde ışık, gürültü, sıcaklık ve fan akışını kontrol et.",
            "Işık sirkadiyen ritmi, kötü hava akışı CO₂ birikimini etkiler; ikisi de uykuyu bozar.",
        ),
        _step(
            "log_caffeine_light",
            "Kafein alım saatini ve uyku öncesi ekran/ışık maruziyetini kaydet.",
            "Bu bilgiler uyku sorununun olası nedenlerini ayırt etmeye yardım eder.",
        ),
        RECORD_SYMPTOMS,
    ),
    requires_mission_procedure=False,
    reassess_minutes=24 * 60,
    escalate_if_tr=(
        "Ortalama 5 saatin altına iner ve yorgunluk veya ruh hali sıkıntısı ≥3/4 olursa "
        "sistem Uyarı seviyesine çıkar.",
    ),
    closes_when_tr="Son gecelerin ortalaması 6 saat ve üzerine çıktığında kapanır.",
    considerations_tr=(
        "Yoğun görev programı veya vardiya değişikliği",
        "Uyku ortamı: ışık, gürültü, sıcaklık, hava akışı",
        "Stres veya ruh hali değişikliği",
        "Uzay hareket hastalığı veya ağrı",
    ),
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

BEHAV_SLEEP_ALERT_CARD_V2 = _demo(
    card_id="BEHAV_SLEEP_ALERT_CARD_V2",
    attention=HealthAttention.ALERT,
    rule_id=SLEEP_RULE_ID,
    title_key="sleep_alert.title",
    reason_key="sleep_alert.reason",
    title_tr="Ciddi uyku borcu ve yorgunluk: kritik görevleri ekip sağlık sorumlusuyla değerlendir",
    reason_tr="Son geceler çok kısa uyunmuş ve yüksek yorgunluk veya ruh hali sıkıntısı bildirilmiş.",
    steps=(
        _step(
            "notify_medical_officer",
            "Ekip sağlık sorumlusuna ve yer ekibine bildir.",
            "Uyku ve ruh hali desteğine ilişkin kararları onlar verir.",
        ),
        _step(
            "review_critical_tasks",
            "EVA, robot kolu veya araç manevrası gibi kritik görevleri planlamadan önce "
            "ekip sağlık sorumlusuyla değerlendir.",
            "Uyku kaybı dikkat ve tepki süresini bozar; hata riski artar.",
        ),
        _step(
            "protect_sleep_window",
            "Bir sonraki uyku dönemini korumak için programı yer ekibiyle düzenle.",
            "Uyku borcu ancak gerçek uyku süresiyle kapanır.",
        ),
        _step(
            "talk_to_someone",
            "Ruh hali sıkıntısı varsa ekip arkadaşına veya göreve özel psikolojik destek kanalına ulaş.",
            "İzolasyonda erken destek, sorunların büyümesini önler.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=12 * 60,
    escalate_if_tr=(
        "Kendine zarar verme düşüncesi veya ani davranış değişikliği olursa hemen ekip "
        "sağlık sorumlusu ve yer ekibine bildir.",
    ),
    closes_when_tr=(
        "Belirtiler azalırsa İzle'ye iner; ortalama uyku 6 saat ve üzerine çıktığında kapanır."
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
    title_tr="Bulantı ve baş dönmesi: hareket hastalığı örüntüsünü izle",
    reason_tr="Bulantı ve baş dönmesi birlikte bildirildi.",
    steps=(
        _step(
            "limit_head_movements",
            "Ani baş hareketlerinden ve hızlı dönüşlerden kaçın.",
            "Mikro yerçekiminde iç kulak ile göz arasındaki uyumsuzluk baş hareketleriyle artar.",
        ),
        _step(
            "visual_orientation",
            "Bir yüzeyi 'yer' kabul ederek görsel yönünü sabitle; mümkünse sabit bir noktaya bak.",
            "Tutarlı bir görsel referans beynin yön algısını toparlamasına yardım eder.",
        ),
        _step(
            "rest_and_log_fluids",
            "Dinlen; sıvı alımını ve kusma olup olmadığını kaydet.",
            "Kusma sıvı kaybına yol açar; kayıt, ekip sağlık sorumlusunun değerlendirmesi içindir.",
        ),
        _step(
            "notify_medical_officer",
            "Ekip sağlık sorumlusuna bildir.",
            "Destek ve tedavi kararlarını o verir.",
        ),
    ),
    requires_mission_procedure=False,
    reassess_minutes=4 * 60,
    escalate_if_tr=(
        "Belirtiler yerçekimi geçişinden günler sonra başladıysa veya ateş, şiddetli baş "
        "ağrısı, görme değişikliği eşlik ediyorsa ekip sağlık sorumlusuna hemen bildir.",
        RED_FLAG_STEP,
    ),
    closes_when_tr="Bulantı veya baş dönmesi 2/4'ün altına indiğinde kapanır.",
    considerations_tr=(
        "Uzay hareket hastalığı (yerçekimi geçişinden sonraki ilk günlerde sık)",
        "Kabin CO₂ yüksekliği",
        "Enfeksiyon",
        "İç kulak veya başka bir sağlık sorunu (ekip sağlık sorumlusu değerlendirir)",
    ),
    references=(DEMO_RULES, NASA_HRP_RISKS),
)

SANS_VISION_WATCH_CARD_V2 = _demo(
    card_id="SANS_VISION_WATCH_CARD_V2",
    attention=HealthAttention.WATCH,
    rule_id=VISION_RULE_ID,
    title_key="vision_watch.title",
    reason_key="vision_watch.reason",
    title_tr="Görme değişikliği bildirildi: kaydet ve ekip sağlık sorumlusuna bildir",
    reason_tr="Görme değişikliği izleme sınırının üzerinde bildirildi.",
    steps=(
        _step(
            "describe_change",
            "Değişikliği kaydet: hangi göz, yakın mı uzak mı, ne zaman başladı, ani mi yavaş mı.",
            "Ayrıntı, değişikliğin önemini ve aciliyetini belirler.",
        ),
        _step(
            "vision_check",
            "Göreve özel görme testini yap ve sonucu kaydet.",
            "Uzun görevlerde görme değişiklikleri (SANS) düzenli muayeneyle izlenir.",
        ),
        _step(
            "notify_medical_officer",
            "Ekip sağlık sorumlusuna ve yer ekibine bildir.",
            "Göz muayenesi ve görüntüleme kararını onlar verir.",
        ),
    ),
    requires_mission_procedure=True,
    reassess_minutes=24 * 60,
    escalate_if_tr=(
        "Değişiklik ani ve ciddiyse 'Acil belirti bildir' > 'Ani ve ciddi görme değişikliği'.",
    ),
    closes_when_tr="Bildirilen görme değişikliği 2/4'ün altına indiğinde kapanır.",
    considerations_tr=(
        "Uzay uçuşuyla ilişkili nöro-oküler sendrom (SANS)",
        "Göz kuruluğu veya yorgunluk",
        "CO₂ ile ilişkili baş ağrısı",
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
