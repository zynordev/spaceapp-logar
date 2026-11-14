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
DEMO_RULES = CardReference("SpaceApp Logar DEMO kuralları", "docs/DEMO_RULES.md")
BIYO_GUIDE = CardReference("Biyoloji karar rehberi, bölüm 10", "docs/biyo.md")

DEMO_FOOTER = (
    "DEMO kartı: içerik uçuş tıbbı uzmanı doğrulaması bekliyor. Teşhis koymaz, "
    "ilaç veya tedavi önermez. Göreve özel prosedür ve ekip sağlık sorumlusu "
    "önceliklidir."
)
RED_FLAG_STEP = (
    "Göğüs ağrısı, ciddi nefes darlığı, bayılma veya yeni bilinç bulanıklığı "
    "olursa hemen 'Acil belirti bildir'i kullan."
)


def _step(key: str, text: str, why: str) -> ActionCardStep:
    return ActionCardStep(key=key, text_tr=text, why_tr=why)


RECORD_SYMPTOMS = _step(
    "record_check_in",
    "Öznel durum kontrolünü doldur: yorgunluk, baş dönmesi, bulantı, ağrı, ruh hali.",
    "Belirtiler ölçümün anlamını değiştirir ve bazı kurallarda seviye kararına girer.",
)

ENV_CO2_WATCH_CARD_V2 = ActionCard(
    card_id="ENV_CO2_WATCH_CARD_V2",
    version=2,
    attention=HealthAttention.WATCH,
    rule_id=CO2_RULE_ID,
    title_key="co2_watch.title",
    reason_key="co2_watch.reason",
    title_tr="Kabin CO₂ yüksek: hava akışını ve bulunduğun modülü kontrol et",
    reason_tr="Son bir saatlik ortalama CO₂ nominal sınırın üzerinde.",
    steps=(
        _step(
            "check_airflow",
            "Bulunduğun yerde hava akışını kontrol et: fan ve menfezlerin önü kapalı "
            "mı, uyku bölmesinin fanı çalışıyor mu?",
            "Mikro yerçekiminde sıcak hava yükselmez ve doğal hava dolaşımı olmaz; "
            "nefesle verilen CO₂ fan olmadan yüz çevresinde birikebilir.",
        ),
        _step(
            "compare_modules",
            "Diğer modüllerin CO₂ değerine bak. Yalnızca burada yüksekse "
            "havalandırması iyi bir modüle geç.",
            "Yerel birikim ile tüm kabinin sorunu farklı müdahale gerektirir.",
        ),
        _step(
            "check_removal_system",
            "CO₂ giderim sisteminin durumunu görev prosedürüne göre kontrol et ve yer "
            "ekibine bildir.",
            "Giderim ekipmanını uçuş kontrol ekibi yönetir; yazılım ekipmana komut "
            "vermez.",
        ),
        _step(
            "record_check_in",
            "Baş ağrısı, yorgunluk veya dikkat dağınıklığı varsa öznel durum "
            "kontrolünü doldur.",
            "NASA, CO₂ ile ilişkili belirtilerin uzayda Dünya'dakinden daha düşük "
            "düzeylerde görülebildiğini bildirir; belirtiler etkinin tek göstergesidir.",
        ),
    ),
    footer_note_tr=(
        "Bu bir WATCH bildirimidir. Yazılım havalandırma veya CO₂ giderim "
        "ekipmanına komut vermez. Göreve özel prosedür önceliklidir."
    ),
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=APPROVED,
    reassess_minutes=30,
    escalate_if_tr=(
        "Baş ağrısı artarsa, yeni bilinç bulanıklığı veya nefes darlığı olursa "
        "'Acil belirti bildir'i kullan.",
        "CO₂ yükselmeye devam ederse ve giderim sistemi arızalıysa yer ekibinin "
        "yönlendirmesini izle.",
    ),
    closes_when_tr="Bir saatlik ortalama CO₂ 3 mmHg veya altına indiğinde kendiliğinden kapanır.",
    considerations_tr=(
        "Yerel birikim: kapalı fan, dar alan veya uyku bölmesi",
        "CO₂ giderim sisteminde verim düşüşü veya arıza",
        "Kabindeki kişi sayısında ya da aktivitede artış",
        "Sensör hatası: diğer modül ve ikinci göstergeyle karşılaştır",
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
    title_tr="SpO₂ düşük görünüyor: önce ölçümü doğrula",
    reason_tr="Son 10 dakikalık dinlenme SpO₂ ortalaması olağan referansın altında.",
    steps=(
        _step(
            "warm_still_remeasure",
            "Elini ısıt, hareketsiz kal; sensörü parmağa veya kulağa iyice yerleştirip "
            "bir dakika ölç.",
            "Pulse oksimetre soğuk parmak, hareket, zayıf temas veya güçlü ışıkta "
            "yanlış düşük değer verebilir.",
        ),
        _step(
            "second_device",
            "Mümkünse ikinci bir cihazla veya diğer elinle karşılaştır.",
            "İki bağımsız ölçüm uyumluysa değer gerçektir; uyumsuzsa sensör sorunu "
            "olasıdır.",
        ),
        _step(
            "check_cabin_atmosphere",
            "Kabin O₂ ve basınç göstergelerine, diğer ekip üyelerinin SpO₂'sine bak.",
            "Düşüş kabin atmosferinden kaynaklanıyorsa tüm ekibi ilgilendirir.",
        ),
        RECORD_SYMPTOMS,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=10,
    escalate_if_tr=(
        "10 dakikalık ortalama %92'nin altına inerse sistem Uyarı seviyesine çıkar.",
        RED_FLAG_STEP,
    ),
    closes_when_tr="10 dakikalık dinlenme ortalaması %95 ve üzerine çıktığında kapanır.",
    considerations_tr=(
        "Ölçüm hatası: soğuk el, hareket, sensör teması",
        "Kabin atmosferinde O₂ veya basınç değişimi",
        "Yoğun aktivite sonrası toparlanma",
        "Solunumu etkileyen bir sağlık sorunu (ekip sağlık sorumlusu değerlendirir)",
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
    title_tr="Düşük SpO₂: dinlen, doğrula ve ekip sağlık sorumlusuna bildir",
    reason_tr=(
        "Son 10 dakikalık dinlenme SpO₂ ortalaması belirgin düşüklük referansının "
        "altında."
    ),
    steps=(
        _step(
            "stop_activity_rest",
            "Yorucu aktiviteyi bırak, güvenli bir yerde oturarak dinlen.",
            "Aktivite oksijen ihtiyacını artırır; dinlenme ölçümü de daha güvenilir "
            "kılar.",
        ),
        _step(
            "confirm_second_sensor",
            "Değeri hemen ikinci bir cihazla doğrula.",
            "Karar öncesinde ölçüm hatası dışlanmalıdır.",
        ),
        _step(
            "check_crew_and_cabin",
            "Kabin O₂/basıncına ve diğer ekip üyelerinin durumuna bak.",
            "Birden fazla kişide düşüş varsa sorun kabin atmosferinde olabilir; bu "
            "ekip çapında bir durumdur.",
        ),
        _step(
            "notify_medical_officer",
            "Ekip sağlık sorumlusuna ve yer ekibine bildir; görev prosedürünü aç.",
            "Oksijen desteği gibi kararları ekip sağlık sorumlusu ve uçuş hekimi verir, "
            "yazılım vermez.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=5,
    escalate_if_tr=(
        RED_FLAG_STEP,
        "Birden fazla ekip üyesinde düşüş varsa 'Acil belirti bildir' > 'Birden fazla "
        "ekip üyesinde aynı anda belirti'.",
    ),
    closes_when_tr=(
        "Ortalama %92–95 aralığına çıkarsa İzle seviyesine iner; %95 ve üzerinde kapanır."
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
    title_tr="Vücut sıcaklığın kişisel başlangıcının üzerinde: eğilimi izle",
    reason_tr=(
        "Son bir saatlik vücut sıcaklığı kişisel başlangıç değerinin belirgin "
        "üzerinde."
    ),
    steps=(
        _step(
            "verify_sensor_contact",
            "Sensörün cilde temasını kontrol et; mümkünse ikinci bir termometreyle ölç.",
            "Cilt sensörleri temas, terleme ve ortam sıcaklığından etkilenebilir.",
        ),
        _step(
            "record_context",
            "Son bir saatte egzersiz, sıcak ortam veya kalın giysi olup olmadığını "
            "kaydet.",
            "Bu durumlar sıcaklığı geçici olarak yükseltir ve yorumu değiştirir.",
        ),
        _step(
            "rest_and_log_fluids",
            "Mümkünse dinlen; son saatlerdeki sıvı alımını kaydet.",
            "Yorgunluk ve sıvı eksikliği sıcaklığı ve nabzı etkiler; kayıt, ekip sağlık "
            "sorumlusunun değerlendirmesini kolaylaştırır.",
        ),
        RECORD_SYMPTOMS,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=60,
    escalate_if_tr=(
        "Bir saatlik ortalama 38,0 °C'ye ulaşırsa sistem Uyarı seviyesine çıkar.",
        RED_FLAG_STEP,
    ),
    closes_when_tr=(
        "Bir saatlik ortalama kişisel başlangıç +1,0 °C'nin altına indiğinde kapanır."
    ),
    considerations_tr=(
        "Egzersiz, sıcak ortam veya giysi",
        "Sensör teması veya yerleşimi",
        "Enfeksiyonla ilişkili ateşlenme eğilimi (teşhis değildir)",
        "Sıvı eksikliği",
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
    title_tr="Yüksek vücut sıcaklığı: doğrula, kaydet ve ekip sağlık sorumlusuna bildir",
    reason_tr="Son bir saatlik vücut sıcaklığı genel ateş referansının üzerinde.",
    steps=(
        _step(
            "confirm_second_thermometer",
            "Sıcaklığı ikinci bir termometre veya sensörle doğrula.",
            "Karar öncesinde ölçüm hatası dışlanmalıdır.",
        ),
        RECORD_SYMPTOMS,
        _step(
            "infection_control",
            "Görev prosedüründeki enfeksiyon kontrol önlemlerini uygula: el hijyeni, "
            "ortak yüzeyler, gerekiyorsa maske.",
            "Kapalı habitatta bulaşma riski tüm ekibi etkiler.",
        ),
        _step(
            "notify_medical_officer",
            "Ekip sağlık sorumlusuna ve yer ekibine bildir; görev prosedürünü aç.",
            "Değerlendirme ve tedavi kararlarını ekip sağlık sorumlusu ve uçuş hekimi "
            "verir.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=30,
    escalate_if_tr=(
        RED_FLAG_STEP,
        "Birden fazla ekip üyesinde benzer belirti varsa 'Acil belirti bildir' > "
        "'Birden fazla ekip üyesinde aynı anda belirti'.",
    ),
    closes_when_tr=(
        "Ortalama 38,0 °C'nin altına inerse İzle seviyesine, kişisel başlangıç "
        "+1,0 °C'nin altına inerse kapanır."
    ),
    considerations_tr=(
        "Enfeksiyonla ilişkili ateş (teşhis değildir; ekip sağlık sorumlusu "
        "değerlendirir)",
        "Isı yükü veya yoğun egzersiz",
        "Sensör hatası",
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
    title_tr="Dinlenmede kalp ve solunum hızı yüksek: bağlamı kontrol et",
    reason_tr=(
        "Dinlenme sırasında kalp hızı kişisel başlangıcın, solunum hızı referansın "
        "üzerinde."
    ),
    steps=(
        _step(
            "rest_and_remeasure",
            "Beş dakika oturarak sakin dinlen, sonra ölçümleri tekrarla.",
            "Yakın zamanda aktivite varsa değerler birkaç dakikada düşer; düşmüyorsa "
            "anlamlıdır.",
        ),
        _step(
            "confirm_activity_context",
            "Son 30 dakikada egzersiz, EVA hazırlığı veya yoğun iş olduysa bunu kaydet.",
            "Sistem seni dinleniyor sanıyorsa yanlış alarm olabilir; bağlam yorumun "
            "temelidir.",
        ),
        _step(
            "check_related_vitals",
            "SpO₂ ve vücut sıcaklığı göstergelerine bak.",
            "Birlikte değişen göstergeler olası nedeni daraltır; örneğin sıcaklıkla "
            "birlikte yükselme.",
        ),
        RECORD_SYMPTOMS,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=15,
    escalate_if_tr=(
        "Yorgunluk, baş dönmesi, bulantı veya ağrı ≥2/4 girilirse sistem Uyarı "
        "seviyesine çıkar.",
        RED_FLAG_STEP,
    ),
    closes_when_tr=(
        "15 dakikalık dinlenme ortalamasında kalp hızı kişisel başlangıç +20 bpm'in, "
        "solunum 20/dk'nın altına indiğinde kapanır."
    ),
    considerations_tr=(
        "Yakın zamanda egzersiz veya yoğun aktivite",
        "Stres veya uyku eksikliği",
        "Sıvı eksikliği",
        "Ateşlenme eğilimi",
        "Sensör hatası",
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
    title_tr="Kalp-solunum yüksekliği ve belirti: dinlen ve ekip sağlık sorumlusuna bildir",
    reason_tr="Dinlenmede yüksek kalp ve solunum hızına öznel belirti eşlik ediyor.",
    steps=(
        _step(
            "stop_activity_rest",
            "Yorucu aktiviteyi bırak, güvenli bir yerde oturarak dinlen.",
            "Dinlenme yükü azaltır ve sonraki ölçümleri yorumlanabilir kılar.",
        ),
        _step(
            "remeasure_all_vitals",
            "Kalp hızı, solunum, SpO₂ ve sıcaklığı yeniden ölç.",
            "Tam bir ölçüm seti, ekip sağlık sorumlusunun değerlendirmesinin temelidir.",
        ),
        _step(
            "avoid_critical_tasks_alone",
            "Kritik görevleri tek başına yapma; bir ekip arkadaşına durumu söyle.",
            "Belirti varken dikkat ve performans düşebilir.",
        ),
        _step(
            "notify_medical_officer",
            "Ekip sağlık sorumlusuna ve yer ekibine bildir; görev prosedürünü aç.",
            "Sonraki adımlara onlar karar verir.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=10,
    escalate_if_tr=(
        RED_FLAG_STEP,
        "Dinlenmeye rağmen değerler yükselmeye devam ederse ekip sağlık sorumlusu yer "
        "ekibine danışır.",
    ),
    closes_when_tr=(
        "Belirti ≥2/4 olmadan yükseklik sürerse İzle seviyesine iner; değerler "
        "normale dönünce kapanır."
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
    title_tr="Kalp hızı sensörünü kontrol et (sağlık alarmı değil)",
    reason_tr="Kalp hızı sinyali şüpheli veya geçersiz; önce verinin doğruluğu sağlanmalı.",
    steps=(
        _step(
            "reseat_sensor",
            "Göğüs bandını veya bileklik sensörünü yeniden yerleştir; temasını kontrol et.",
            "Kayan veya zayıf temaslı sensör ani, sahte sıçramalar üretir.",
        ),
        _step(
            "still_remeasure",
            "Bir dakika hareketsiz kalarak ölçümü tekrarla.",
            "Hareket artefaktı en yaygın hata kaynağıdır.",
        ),
        _step(
            "manual_pulse",
            "Değer gerçekçi görünmüyorsa nabzını elle say: 15 saniye say, 4 ile çarp.",
            "Bağımsız bir sayım gerçek ile sahte değeri ayırır.",
        ),
        _step(
            "log_sensor_issue",
            "Sorun sürerse sensörü değiştir ve arızayı kaydet.",
            "Arıza kaydı veri kalitesi geçmişini ve bakım ihtiyacını gösterir.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=False,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=5,
    escalate_if_tr=(
        "Elle sayılan nabız da çok yüksek veya düşükse ve belirti varsa 'Acil belirti "
        "bildir'i kullan.",
    ),
    closes_when_tr="Sonraki ölçümlerde şüpheli sıçrama olmadığında veri kalitesi Geçerli'ye döner.",
    considerations_tr=(
        "Sensör kayması veya zayıf temas",
        "Hareket artefaktı",
        "Gerçek bir ritim değişikliği (elle sayımla doğrula)",
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
    title_tr="Acil belirti: hemen ekibe ve yer ekibine bildir",
    reason_tr=(
        "Kırmızı bayrak belirtisi bildirildi. Normal sensör değerleri bu durumu "
        "dışlamaz; değerlendirmeyi beklemeden acil prosedüre geç."
    ),
    steps=(
        _step(
            "stop_and_secure",
            "İşi hemen bırak; güvenli bir yere otur veya kendini sabitle.",
            "Bayılma veya ani kötüleşmede yaralanmayı önler; mikro yerçekiminde "
            "sabitlenmek gerekir.",
        ),
        _step(
            "call_crew",
            "Sesli olarak ekibe haber ver; yanında bir ekip arkadaşı kalsın.",
            "Durum hızla değişebilir; yalnız kalmamak en kritik güvenlik adımıdır.",
        ),
        _step(
            "contact_medical_and_ground",
            "Ekip sağlık sorumlusu ve yer ekibindeki uçuş hekimiyle hemen iletişime geç.",
            "Teşhis ve tedavi kararlarını onlar verir; iletişim gecikmesi varsa erken "
            "bildirim zaman kazandırır.",
        ),
        _step(
            "open_emergency_procedure",
            "Göreve özel acil tıbbi prosedürü aç ve vital ölçümleri kayıtta tut.",
            "Prosedür adımları ve kayıtlı veriler uzaktaki hekimin değerlendirmesi için "
            "gereklidir.",
        ),
    ),
    footer_note_tr=(
        "DEMO kartı: kırmızı bayrak listesi uçuş tıbbı doğrulaması bekliyor. Teşhis "
        "koymaz, ilaç veya tedavi önermez. Bu alarm ölçümlerle kendiliğinden "
        "kapanmaz; ekip üyesi değerlendirip kapatır."
    ),
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
    reassess_minutes=5,
    escalate_if_tr=(
        "Bilinç kaybı veya solunum güçlüğü artarsa göreve özel acil prosedürü ekip "
        "uygular.",
    ),
    closes_when_tr="Yalnızca bir ekip üyesi değerlendirip 'Değerlendirildi, kapat' dediğinde.",
    considerations_tr=(
        "Normal sensör değerleri ciddi bir olayı dışlamaz",
        "Değerlendirmeyi ekip sağlık sorumlusu ve uçuş hekimi yapar",
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
