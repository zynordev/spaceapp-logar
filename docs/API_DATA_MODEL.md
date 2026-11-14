# API ve Veri Modeli

Son güncelleme: 14 Kasım 2026

Durum: **Onaylandı (Onay Kapısı D tamamlandı)**

Bu belge sensör, çevre, öznel durum ve laboratuvar verilerinin backend'e nasıl
alınacağını; kural sonuçları ve alarmlarla nasıl ilişkilendirileceğini belirler.
Bu aşama bir uçuş sistemi sertifikasyonu değil, NASA Space Apps prototipinin
açıklanabilir ve test edilebilir veri sözleşmesidir.

## Karşılaştırılan yaklaşımlar

### 1. Her gösterge için ayrı tablo ve endpoint

Örnek: `heart_rate_readings`, `spo2_readings`, `co2_readings` ve her biri için
ayrı API ucu.

- Güçlü doğrulama ve anlaşılır tablo adları sağlar.
- 12 gösterge, laboratuvar alanları ve yeni sensörler eklendikçe çok sayıda aynı
  yapının tekrar edilmesine neden olur.
- Birden fazla gösterge kullanan kuralların sorgularını karmaşıklaştırır.

### 2. Tamamen genel ölçüm nesnesi

Her veri `metric`, `value` ve `unit` alanlarıyla aynı endpoint'e gönderilir.

- Yeni gösterge eklemek kolaydır.
- `SpO2 + mmHg` veya `CO2 + bpm` gibi anlamsız birleşimleri engellemek zorlaşır.
- Öznel kontrol ve laboratuvar referans aralığı gibi farklı veri şekilleri gevşek
  bir JSON yapısına dönüşebilir.

### 3. Ortak zarf + türüne göre doğrulanan modeller (önerilen)

Tüm kayıtlarda kimlik, zaman, görev ve kaynak bilgisi aynı zarfı kullanır. Zarfın
içindeki veri dört açık kategoriye ayrılır:

1. `vital_observation`
2. `environment_observation`
3. `subjective_check_in`
4. `lab_result`

Her kategori kendi izin verilen gösterge ve birimlerini doğrular. Veritabanında
sürekli sayısal sensör verileri ortak zaman-serisi gözlem tablosunda tutulabilir;
öznel kontrol ve laboratuvar sonuçları kendi tablolarında kalır.

Bu yaklaşım tekrar ile aşırı esneklik arasında denge kurduğu için önerilir.

## Önerilen temel kayıtlar

| Kayıt | Amacı | Önemli alanlar |
|---|---|---|
| `mission` | Demo görevini ve bağlamını tanımlar | `id`, `name`, `started_at` |
| `crew_member` | Gerçek PII içermeyen demo astronot profili | `id`, `callsign`, `mission_id` |
| `observation` | Vital veya çevre zaman serisi | `metric`, `value`, `unit`, `observed_at`, hedef, kaynak |
| `subjective_check_in` | Beş adet 0–4 öznel giriş | yorgunluk, baş dönmesi, bulantı, ağrı, ruh hali sıkıntısı |
| `lab_result` | Periyodik CBC/CMP değeri | ölçüm, değer, birim, referans alt/üst, örnek zamanı |
| `rule_evaluation` | Bir kuralın denetlenebilir sonucu | kural/sürüm, veri kalitesi, dikkat durumu, kanıt |
| `alert_event` | Kullanıcıya gösterilen ve yaşam döngüsü izlenen olay | açılma, onaylanma, çözülme, eylem kartı |

## Ortak ölçüm zarfı

Her vital ve çevre gözlemi şu ortak bilgileri taşır:

| Alan | Kural |
|---|---|
| `id` | Backend tarafından üretilen UUID |
| `mission_id` | Hangi görev bağlamına ait olduğu |
| `target_type` | `CREW_MEMBER` veya `ENVIRONMENT` |
| `target_id` | Astronot veya habitat/bölme kimliği |
| `metric` | Sürüm kontrollü gösterge kodu |
| `value` | Sonlu sayısal değer |
| `unit` | Gösterge için izin verilen birim |
| `observed_at` | Zaman dilimi içeren tarih; depolamada UTC |
| `source_type` | `SENSOR`, `MANUAL`, `OSDR` veya `SYNTHETIC` |
| `source_id` | Sensör, OSDR dataset veya manuel giriş kaydı |
| `scenario_id` | Sentetik veride zorunlu demo senaryosu kimliği |
| `reported_quality` | Kaynağın bildirdiği kalite; sistem sonucu değildir |
| `ingested_at` | Backend'in kaydı aldığı UTC zamanı |

Sistem tarafından hesaplanan `DataQuality`, gelen `reported_quality` alanının
üzerine yazılmaz; ayrı `rule_evaluation` kaydında saklanır.

## CO₂ örnek isteği

```json
{
  "mission_id": "demo-iss-01",
  "target_type": "ENVIRONMENT",
  "target_id": "iss-destiny-lab",
  "metric": "CABIN_CO2_PARTIAL_PRESSURE",
  "value": 3.2,
  "unit": "mmHg",
  "observed_at": "2026-11-14T08:00:00Z",
  "source_type": "SYNTHETIC",
  "source_id": "co2-simulator-01",
  "scenario_id": "co2-rise-demo-v1",
  "reported_quality": "VALID"
}
```

Bu kayıt tek başına `WATCH` üretmez. Backend son bir saatin yeterli ve güvenilir
ham gözlemlerini toplar, ortalamayı hesaplar ve `ENV_CO2_NOMINAL_V1` kuralına
gönderir.

## Önerilen MVP API uçları

| Yöntem ve yol | İşlev |
|---|---|
| `GET /health` | Backend sürecinin operasyon durumu; astronot sağlığı değildir |
| `POST /v1/observations` | Vital veya çevre sensör gözlemi alır |
| `POST /v1/check-ins` | Beş alanlı öznel durum kontrolü alır |
| `POST /v1/lab-results` | Periyodik laboratuvar sonucu alır |
| `GET /v1/crew/{crew_id}/status` | Son ölçümler ve etkin dikkat durumunu döndürür |
| `GET /v1/alerts` | Etkin/geçmiş alarm olaylarını listeler |
| `POST /v1/alerts/{alert_id}/acknowledge` | Astronotun alarmı gördüğünü kaydeder |

İlk kod dilimi yalnızca `POST /v1/observations` içindeki CO₂ veri sözleşmesini
uygular. Diğer endpoint'ler aynı anda boş iskelet olarak oluşturulmaz.

Bu tablo ilk öneridir; bugün uygulamada olan uçların tamamı aşağıda
"Güncel uç listesi" bölümündedir.

## Saklama ve değişmezlik kuralları

- Ham gözlem alındıktan sonra değeri sessizce güncellenmez veya silinmez.
- Düzeltme gerekirse eski kayda referans veren yeni bir kayıt oluşturulur.
- Bütün zamanlar UTC saklanır; arayüz yerel saate çevirebilir.
- Sentetik kayıtta `source_type=SYNTHETIC` ve `scenario_id` zorunludur.
- OSDR kaydında dataset kimliği `source_id` içinde zorunludur.
- Kural sürümü ve kaynak URL'si değerlendirme anındaki haliyle saklanır.
- SQLite yarışma demosu içindir; uçuşa hazır veya klinik üretim veritabanı olduğu
  iddia edilmez. PostgreSQL de desteklenir (bkz. "Veritabanı: SQLite ve
  PostgreSQL"); bu da klinik üretim iddiası değildir.
- Demo profillerinde gerçek astronot PII veya tıbbi kayıt kullanılmaz.

## İlk uygulama sırası

Onaydan sonra küçük parçalar halinde:

1. CO₂ gözlemi için Pydantic istek/cevap modelleri ve doğrulama testleri;
2. SQLAlchemy `observation` tablosu ve ilk Alembic migration'ı;
3. `POST /v1/observations` ile ham kaydı değiştirmeden saklama;
4. son bir saatlik veri yeterliliği ve ortalama hesaplama;
5. mevcut CO₂ kuralını çalıştırıp denetlenebilir sonucu döndürme.

Her madde ayrı doğrulanacak; bütün veri modeli tek seferde kodlanmayacaktır.

### Uygulama durumu

- [x] CO₂ gözlemi için Pydantic istek/cevap modelleri ve doğrulama testleri
- [x] SQLAlchemy `observation` tablosu ve ilk Alembic migration'ı
- [x] `POST /v1/observations` ile ham kaydı değiştirmeden saklama
- [x] Son bir saatlik veri yeterliliği ve dakika-bölmeli ortalama hesaplama
- [x] CO₂ kuralını çalıştırıp denetlenebilir sonucu döndürme
- [x] Onaylı CO₂ `WATCH` eylem kartı (`docs/CO2_ACTION_CARD_PROPOSAL.md`)
- [x] `alert_event` yaşam döngüsü, `GET /v1/alerts` ve `POST /v1/alerts/{id}/acknowledge`
- [x] `POST /v1/lab-results` ve `GET /v1/crew/{id}/lab-results` periyodik laboratuvar kartı

- [x] Genel ölçüm ucu `POST /v1/measurements` (11 metrik, birim ve hedef türü
  doğrulaması, isteğe bağlı `activity_state`); zaman serisi, metrik kataloğu ve
  görev listesi uçları
- [x] DEMO vital kuralları, kural başına son durum ve genel dikkat seviyesi
  (`docs/DEMO_RULES.md`)
- [x] Sentetik demo senaryoları ve gerçek OSDR laboratuvar içe aktarımı

- [x] Kırmızı bayrak bildirimi (`POST /v1/red-flags`), anında CRITICAL ve
  yalnızca ekip üyesinin kapatabildiği alarm (`POST /v1/alerts/{id}/resolve`);
  değişmez `red_flag_reports` tablosu ve `alert_events.resolved_by` (migration 0008)

- [x] Eylem kartı V2: adım nedenleri, yeniden değerlendirme süresi, yükselme ve
  kapanma koşulları, olası açıklamalar, kaynaklar. Kural durumunda canlı
  `situation` bölümü. Adım işaretleme `POST /v1/alerts/{id}/steps`
  (`{crew_member_id, step_key}`), değişmez `action_step_logs` tablosu
  (migration 0009). `AlertRead.completed_step_keys`.

- [x] Kapsam genişletmesi: kabin atmosferi, radyasyon, uyku, hareket hastalığı,
  görme kuralları; öznel girişe isteğe bağlı `vision_change`, `back_pain`,
  `congestion` (0–4, migration 0010); `GET /v1/risk-coverage`

- [x] Ortam bağlamı: değişmez `environment_contexts` tablosu (migration 0011),
  `POST/GET /v1/environment-contexts`, `GET /v1/environment-contexts/current`;
  görev günü saklanmaz, türetilir
- [x] Kişisel normal servisi `get_personal_baseline` ve `GET /v1/baselines`
  (`ESTABLISHED` / `ESTIMATED_RESEARCH`)
- [x] Profil sürümleri: `baseline_profiles` + `baseline_profile_activations`
  (migration 0012); anlık görüntü, yeniden etkinleştirme (geri alma), `release`
- [x] Kural kaydında kullanılan kişisel normal alanları (migration 0013) ve
  kural durumunda `baseline` bölümü
- [x] Şema kontrolü: şema kodun gerisindeyse veri uçları `503`, `/health`
  `schema` alanı
- [x] PostgreSQL desteği (SQLite yanında); `rule_evaluations.source` `TEXT`
  (migration 0014); CI'da `test-postgres` işi
- [x] Toplu ölçüm ucu `POST /v1/measurements/batch` ve CSV telemetri adaptörü
- [x] Gözlemlenebilirlik: `X-Request-ID`, JSON istek logları, tutarlı hata gövdesi
- [x] İsteğe bağlı token kimlik doğrulama ve roller (`POST /v1/auth/token`,
  `SPACEAPP_AUTH_REQUIRED` varsayılan kapalı)

### Genel ölçüm sözleşmesi

`POST /v1/measurements` aynı ortak zarfı kullanır. Her metrik tek bir birim ve
hedef türüyle doğrulanır (örneğin `HEART_RATE` yalnız `bpm` ve `CREW_MEMBER`).
`activity_state` (`REST`, `LIGHT`, `EXERCISE`, `SLEEP`) yalnız mürettebat
ölçümlerinde kullanılabilir ve kuralların bağlamıdır: dinlenme kuralları egzersiz
verisini kullanmaz. Metrik kataloğundaki fiziksel olarak mümkün aralık dışındaki
değerler saklanır ama kurallarda kullanılmaz. Cevap, tetiklenen her kuralın
sonucunu (`evaluations`) döndürür.

`GET /v1/crew/{id}/status` cevabına `rules` (her kuralın son sonucu; başlık,
metrik, pencere, eşik, kanıt sınıfı, doğrulama durumu, eylem kartı) ve
`overall_attention` eklendi. Eski `co2` alanı geriye uyumluluk için korunur.
`environment_target_id` isteğe bağlıdır; verilmezse çevre kuralları raporlanmaz.

### Alarm olayı yaşam döngüsü

`OPEN → ACKNOWLEDGED → RESOLVED`. Alarm yaşam döngüsü her kural
değerlendirmesinden sonra aynı transaction içinde güncellenir
(`POST /v1/observations`, `/v1/measurements`, `/v1/measurements/batch`,
`/v1/check-ins`, `/v1/red-flags` ve kırmızı bayrağı kapatan
`POST /v1/alerts/{id}/resolve`):

- Eylem kartı gösteren bir `WATCH`, `ALERT` veya `CRITICAL` değerlendirmesi alarm
  açar. Aynı görev, hedef ve kural için etkin (`OPEN` veya `ACKNOWLEDGED`) alarm
  varsa yenisi açılmaz; mevcut alarmın son değerlendirmesi, seviyesi ve kartı
  güncellenir (aynı kök neden tek olay altında kalır). Bu kural veritabanında
  kısmi benzersiz indeksle de korunur.
- Seviye yükselirse (ör. `WATCH → ALERT`) onaylanmış alarm yeniden `OPEN` olur ve
  onay bilgisi (`acknowledged_at`, `acknowledged_by`) silinir; ekip yeni seviyeyi
  yeniden onaylamalıdır.
- `NORMAL` bir değerlendirme etkin alarmı `RESOLVED` yapar (pencere kullanmayan,
  öznel girişe dayalı kurallar dahil).
- `UNKNOWN` (eksik/bozuk veri) alarmı kapatmaz: kötü veri, durumun bittiğinin
  kanıtı değildir.
- Etkin alarmın son değerlendirmesinden daha eski bir değerlendirme yok sayılır;
  geç gelen veri yaşam döngüsünü geri sarmaz.
- `acknowledge` aynı alarm için tekrarlanırsa ilk onaylayanı korur (idempotent);
  çözülmüş alarm onaylanamaz (`409`). İstisna: yukarıdaki seviye yükselmesi onayı
  siler.
- Çözüldükten sonra CO₂ yeniden yükselirse yeni bir alarm açılır.

`GET /v1/alerts` `mission_id` ister; `status`, `target_id` ve `limit` (1–200)
isteğe bağlıdır. Her alarm, son değerlendirmenin açıklamasını (alarmın güncel
seviyesini açıklayan) ve güncel eylem kartını taşır.

### Periyodik laboratuvar sonuçları

Çekirdek analitler: glukoz, sodyum, potasyum, kreatinin, WBC, hemoglobin, trombosit,
ALT, AST. Sonuçlar ham ve değişmezdir; kaynak referans aralığı (`reference_low`,
`reference_high`) her kayıtla birlikte saklanır, yazılım yeni eşik üretmez.

- Her analit için yalnızca açık birimler kabul edilir. Hemoglobin yalnız `g/dL`
  veya `g/L` kabul eder. OSD-569'daki `percent` etiketinin yanlış olduğu, özgün
  dosyada birimin `g/dL` yazılı olmasıyla doğrulandı (`docs/MVP_INDICATORS.md`).
- `OSDR` kaynağında `source_id` bir dataset kimliği olmalıdır (`OSD-569` gibi);
  `SYNTHETIC` kayıtta `scenario_id` zorunludur.
- `GET /v1/crew/{id}/lab-results` her analit için son değeri; kaynak aralığa göre
  konumu (`BELOW`/`WITHIN`/`ABOVE`); bir önceki değere ve uçuş öncesi (`PRE_FLIGHT`)
  başlangıç değerine göre değişimi döndürür. Değişim yalnızca aynı birimdeki
  ölçümler arasında hesaplanır; birim değişirse `null` döner.
- Laboratuvar sonuçları 7/24 alarm akışına girmez ve alarm üretmez.

CO₂ penceresi 60 adet bir dakikalık bölmeden oluşur. En az 54 geçerli dakika ve
en fazla beş dakikalık kesintisiz veri boşluğu kabul edilir. Aynı dakika içindeki
ölçümler önce kendi aralarında ortalanır; böylece yüksek frekanslı bir veri patlaması
bir saatlik sonucu orantısız biçimde etkilemez. Yetersiz pencerede sağlık dikkati
`UNKNOWN` kalır.

Her `POST /v1/observations` işleminde ham gözlem ve o anda üretilen
`rule_evaluation` aynı veritabanı transaction'ında saklanır. Ayrı bir kanıt tablosu,
değerlendirmede kullanılan ham gözlem kimliklerini değişmez şekilde ilişkilendirir.

`POST /v1/check-ins`, yorgunluk, baş dönmesi, bulantı, ağrı ve ruh hali sıkıntısı
alanlarını ayrı `0–4` tam sayıları olarak saklar. Bu beş zorunlu alana ek olarak
isteğe bağlı `vision_change`, `back_pain`, `congestion` (0–4, boş bırakılabilir)
da saklanır (migration 0010). Backend bu ham girişlerden teşhis
veya doğrulanmamış tek bir sağlık puanı üretmez.

CO₂ `WATCH` değerlendirmesi onaylı `ENV_CO2_WATCH_CARD_V2` kartını (sürüm 2)
gösterir; `ENV_CO2_WATCH_CARD_V1` eski kayıtlar için katalogda kalır. Kartın kimliği ve sürümü `rule_evaluation` kaydında saklanır; kart metni kodda
sürümlü olarak tutulur (ayrıntı: `docs/CO2_ACTION_CARD_PROPOSAL.md`).

`GET /v1/crew/{crew_id}/status`, son CO₂ değerlendirmesi ile son öznel kontrolü
aynı cevapta gösterir.

> Güncelleme (kapsam genişletmesinden sonra): `POST /v1/check-ins` artık
> `evaluate_check_in` ile öznel girişi okuyan kuralları çalıştırır. Belirtiye
> dayalı kurallar (`SENS_MOTION_SICKNESS_V1`, `SANS_VISION_SYMPTOM_V1`) tek
> başına `WATCH` üretebilir ve eylem kartıyla alarm açabilir (en fazla İzle
> seviyesi); `MULTI_CARDIO_RESP_V1` ve uyku kuralı yalnızca ölçümleri varsa
> yeniden çalışır. Öznel giriş teşhis üretmez.
>
> Bilinen tutarsızlık: `GET /v1/crew/{id}/status` cevabındaki `limitations`
> metni ("Öznel girişler ... tek başına teşhis veya alarm üretmez") ve
> `api/check_ins.py` içindeki kod yorumu eskidir; belirtiye dayalı kurallar tek
> başına `WATCH` alarmı açabilir. Kod metninin düzeltilmesi ayrı bir iştir.

### Ortam bağlamı

Görevin nerede ve hangi koşulda yürüdüğü, değişmez (yalnız eklenen)
`environment_contexts` kayıtlarıyla tutulur (migration 0011). Bir kayıt
`effective_at` anından itibaren geçerlidir; ortam değişince yeni kayıt eklenir,
eskisi güncellenmez.

| Alan | Kural |
|---|---|
| `mission_id` | Görev kimliği |
| `location` | `EARTH`, `ISS`, `TRANSIT_VEHICLE`, `LUNAR_HABITAT`, `MARS_HABITAT`, `EVA` |
| `gravity_g` | `0`–`3` |
| `eva_state` | `NONE` (varsayılan), `PREBREATHE`, `ACTIVE`, `POST_EVA`; `location=EVA` ise `NONE` olamaz |
| `communication_delay_seconds` | `0`–`3600` |
| `expected_metrics` | Metrik kataloğundan, tekrarsız liste |
| `sensor_set` | En fazla 50 sensör adı (`^[A-Za-z0-9._:-]+$`) |
| `effective_at` | Zaman dilimi zorunlu; UTC'ye çevrilir |
| `source_type` / `source_id` | Varsayılan `MANUAL` / `mission-config` |

Uçlar:

- `POST /v1/environment-contexts` — yeni ortam kaydı (`201`).
- `GET /v1/environment-contexts?mission_id=...` — görevin bütün ortam kayıtları,
  `effective_at` sırasıyla.
- `GET /v1/environment-contexts/current?mission_id=...&at=...` — `at` anında
  (varsayılan: şimdi) geçerli kayıt, `mission_started_at` ve `mission_day`.

Görev günü saklanmaz, her seferinde türetilir: görev başlangıcı görevin en erken
ortam kaydıdır; ortam kaydı yoksa en erken gözlem zamanıdır.
`mission_day = (at − başlangıç) // 1 gün + 1`; başlangıç yoksa veya `at`
başlangıçtan önceyse `null`.

Şu an kurallar `gravity_g`, `eva_state`, `communication_delay_seconds`,
`expected_metrics` ve `sensor_set` alanlarını okumaz; bunlar saklanır ve
döndürülür. Ortam kaydının kural tarafındaki tek etkisi, kişisel normalin hangi
ortam aralığından hesaplanacağını belirlemesidir (aşağıda). Demo senaryoları her
sentetik görev için `ISS` konumlu bir ortam kaydı oluşturur.

### Kişisel normal servisi

`services/baseline.py` içindeki servis, bir mürettebat üyesinin veya habitat
hedefinin kendi önceki, kararlı verisinden "kişisel normal" hesaplar. Politika
DEMO'dur (`docs/biyo.md` bölüm 5, karar 5.1-C); kanıt sınıfı F kuralların
yerine geçmez.

```python
get_personal_baseline(
    session, *, mission_id, target_id, metric, before,
    activity_state=None, allowed_activities=None,
    environment_location=None, environment_context_id=None,
    min_samples=None, max_samples=None, use_active_snapshot=True,
) -> BaselineProfileResult
```

Dönen alanlar: `median`, `p10`, `p25`, `p75`, `p90`, `sample_count`,
`min_samples_required`, `excluded_count`, `is_sufficient`, `classification`,
`status_label`, `evidence_level`, `environment_location`,
`environment_context_id`, `activity_state`, `profile_id`, `profile_version`,
`limitation_note`. Yüzdelikler doğrusal aradeğerlemeyle hesaplanır.

Sınıflandırma:

- `ESTABLISHED` (`status_label`: `kişisel_kararlı`, `evidence_level`:
  `kişisel veri`) — kullanılabilir örnek sayısı en az `min_samples_required`.
- `ESTIMATED_RESEARCH` (`status_label`: `tahmini/araştırma`,
  `evidence_level`: `F`) — veri yetersiz. Kurallar bunu yerleşik kişisel normal
  olarak kullanmaz: medyanı yalnızca `is_sufficient` doğruysa kullanırlar.

Metrik bazlı varsayılan örnek sınırları (en az / en fazla), örnekler:

| Metrik | En az | En fazla |
|---|---|---|
| `HEART_RATE`, `SPO2`, `RESPIRATION_RATE`, `BODY_TEMPERATURE` | 30 | 60 |
| `SYSTOLIC_BP`, `DIASTOLIC_BP` | 5 | 20 |
| `SLEEP_DURATION` | 3 | 7 |
| `CABIN_CO2_PARTIAL_PRESSURE`, `CABIN_O2_FRACTION`, `CABIN_PRESSURE` | 30 | 60 |
| `RADIATION_DOSE_RATE` | 10 | 60 |

Listede olmayan metrikte `(30, 60)` kullanılır; çağıran `min_samples` /
`max_samples` ile değiştirebilir.

Hesap aralığı: yalnız `before` anından kesinlikle önceki veri kullanılır. `before`
anında geçerli bir ortam kaydı varsa aralık o kaydın `effective_at` anından
başlar ve bir sonraki ortam kaydında biter; böylece ortam değişince yeni bir
profil başlar. Ortam kaydı yoksa görevin bütün önceki verisi kullanılır. Gözlemler
eskiden yeniye okunur ve en fazla `max_samples` kullanılabilir örnek alınır
(sorgu en çok `max_samples × 6` satır okur). `activity_state` verilirse yalnız o
etkinlikteki ölçümler kullanılır.

Öğrenmeden dışlananlar ("hasta veya arızalı dönem normal olmaz"):

- `reported_quality` `VALID` olmayan, sonlu olmayan veya metrik kataloğunun
  fiziksel olarak mümkün aralığı dışındaki değerler;
- aynı hedefte alarmın etkin olduğu aralıklar (kırmızı bayrak alarmları dahil);
  çevre metriklerinde yalnız o metriği kullanan kuralların alarmları sayılır;
- mürettebat metriklerinde, yorgunluk, baş dönmesi, bulantı, ağrı veya ruh hali
  sıkıntısından biri `≥ 2/4` olan öznel kaydın ardından 12 saat. (İsteğe bağlı
  `vision_change`, `back_pain`, `congestion` alanları bu dışlamada kullanılmaz.)

Ay ve Mars için nüfus "normal aralık" tablosu yoktur; `LUNAR_HABITAT` veya
`MARS_HABITAT` ortamında `limitation_note` bunu açıkça yazar ve yalnız kişinin
kendi verisi kullanılır.

Kişisel normal kullanan kurallar ve çağrı biçimi:

| Kural | Metrik | Bağlam |
|---|---|---|
| `VITAL_TEMP_TREND_V1` | `BODY_TEMPERATURE` | etkinlik filtresi yok; `before` = pencere başlangıcı |
| `MULTI_CARDIO_RESP_V1` | `HEART_RATE` | `activity_state=REST`; `before` = kalp hızı penceresi başlangıcı |
| `ENV_RADIATION_V1` | `RADIATION_DOSE_RATE` | `min_samples=10`; `before` = son pencerenin başı |

`GET /v1/baselines?mission_id=&target_id=&metric=&activity_state=&before=`
yürürlükteki kişisel normali döndürür (`before` varsayılan: şimdi). Etkin bir
profil anlık görüntüsü varsa hesaplama yerine o döner.

### Profil sürümleri

`baseline_profiles` tablosu kişisel normalin değişmez anlık görüntülerini,
`baseline_profile_activations` tablosu hangisinin yürürlükte olduğunu tutar
(migration 0012). Profil anahtarı: `mission_id`, `target_id`, `metric`,
`activity_key` (verilen `activity_state` ya da `ANY`) ve `environment_key`
(ortam kaydı kimliği ya da `NONE`). Her anahtar için sürüm numarası
benzersizdir.

- `POST /v1/baseline-profiles` — gövde: `mission_id`, `target_id`, `metric`,
  isteğe bağlı `activity_state` ve `before`, `created_by`, `reason` (3–500
  karakter). O anki veriden taze hesap yapar (etkin anlık görüntüyü değil),
  sürümü `en büyük + 1` olarak kaydeder ve hemen etkinleştirir (`201`).
- `GET /v1/baseline-profiles?mission_id=&target_id=&metric=` — sürümler, sırayla.
- `POST /v1/baseline-profiles/{id}/activate` — gövde: `activated_by`, `reason`.
  Önceki bir sürümü yeniden yürürlüğe koyar. Geri alma budur: hiçbir şey
  silinmez, yeni bir etkinleştirme satırı eklenir. `404`: profil yok.
- `POST /v1/baseline-profiles/{id}/release` — aynı gövde; o profilin anahtarını
  otomatik hesaplamaya döndürür (`profile_id` boş etkinleştirme satırı, `204`).

Bir anahtar için en son etkinleştirme geçerlidir. `created_by` / `activated_by`
gövdeden alınır; token kullanıcısından türetilmez.

### Kural kaydında kişisel normal

`rule_evaluations` tablosuna boş bırakılabilir dört alan eklendi
(migration 0013): `baseline_value` (kullanılan profilin medyanı),
`baseline_classification`, `baseline_sample_count`, `baseline_profile_version`
(`0` = otomatik hesap). Kişisel normal kullanmayan kurallarda ve eski kayıtlarda
bu alanlar boştur. Kural durumu (`rules[]`, `evaluations[]`) bu durumda
`baseline` bölümünü (`value`, `classification`, `status_label`,
`sample_count`, `profile_version`) gösterir; `baseline_classification` boşsa
`baseline` `null` olur. Panel bu bölümü "Kişisel başlangıç" etiketiyle gösterir.

### Şema kontrolü

`git pull` sonrası `uv run alembic upgrade head` unutulursa API eskiden belirsiz
`500` hataları veriyordu. Artık her veri isteği (`get_session` bağımlılığı)
önce veritabanının Alembic sürümünü koddaki son sürümle karşılaştırır. Sonuç
`current` ise önbelleğe alınır; `outdated` / `unknown` ise en çok 5 saniyede bir
yeniden denetlenir.

Şema gerideyse veri uçları `503` döner (sürüm değerleri örnektir):

```json
{
  "detail": {
    "code": "SCHEMA_OUTDATED",
    "message": "Veritabanı şeması kodun gerisinde (veritabanı: ..., kod: ...). Çalıştırın: uv run alembic upgrade head",
    "database_revision": "20261114_0013",
    "code_revision": "20261114_0014"
  },
  "error": {"code": "SERVICE_UNAVAILABLE", "message": "SERVICE_UNAVAILABLE", "request_id": "..."}
}
```

`GET /health` `get_session` bağımlılığını kullanmaz (yalnız aynı şema
denetimini çağırır); bu yüzden şema geride olsa da `200` ve `status: "ok"`
döner, şemayı ayrıca bildirir: `status`, `service`, `api_version`, `schema`
(`current` / `outdated` / `unknown`) ve `schema_detail` (`state`,
`database_revision`, `code_revision`, `message`). Veritabanına ulaşılamazsa
veya `alembic.ini` bulunamazsa `unknown` olur; `unknown` veri isteklerini
engellemez, yalnız `outdated` engeller.

### Veritabanı: SQLite ve PostgreSQL

Veritabanı adresi sırasıyla `SPACEAPP_DATABASE_URL`, `DATABASE_URL`, yoksa
`sqlite:///./spaceapp-logar.db` ile seçilir. `postgres://` ve `postgresql://`
adresleri psycopg 3 sürücüsüne (`postgresql+psycopg://`) çevrilir. SQLite'ta WAL,
`foreign_keys=ON`, `synchronous=NORMAL` ve `busy_timeout=30000` ayarlanır;
PostgreSQL'de `pool_pre_ping` açıktır. Alembic aynı adres kuralını kullanır.

Migration 0014, `rule_evaluations.source` sütununu `VARCHAR(255)`'ten `TEXT`'e
genişletir: bir radyasyon kuralının kaynak metni 266 karakterdir ve PostgreSQL
`VARCHAR(255)` sınırını uyguladığı için demo senaryoları orada başarısız
oluyordu; SQLite bu sınırı uygulamaz.

Testler: `TEST_DATABASE_URL` verilirse bütün test seti o veritabanında koşar
(her test için `public` şeması sıfırlanır). CI'da `test` (SQLite) ve
`test-postgres` (`postgres:16` servis kapsayıcısı) işleri vardır. PostgreSQL veya
Docker kurulu olmayan makinede
`uv run --with pgserver python scripts/test_postgres_local.py` geçici gömülü bir
PostgreSQL başlatır ve test setini onunla koşar (`pgserver` proje bağımlılığı
değildir). Render'da hangi veritabanının kullanılacağı henüz kararlaştırılmadı;
`render.yaml` veritabanı tanımlamaz.

### Toplu ölçüm ucu

`POST /v1/measurements/batch` gövdesi: `mode` (`all_or_nothing` varsayılan,
veya `partial`) ve `measurements` (her biri `POST /v1/measurements` ile aynı
sözleşme). Bir istekte en fazla 1000 ölçüm; fazlası `413`.

Her öğe ayrı ayrı şemaya göre doğrulanır; geçersizler sırasıyla
`rejected: [{index, errors}]` içinde raporlanır.

- `all_or_nothing`: tek bir öğe geçersizse hiçbiri saklanmaz; `422` ve
  `{mode, accepted: 0, rejected, evaluations: 0}` gövdesi döner (bu gövde
  standart hata zarfı değildir).
- `partial`: geçerli öğeler saklanır, geçersizler raporlanır. "Kısmi kabul"
  yalnızca şema doğrulamasını geçemeyen öğelerin atlanması demektir; geçerli
  öğeler tek transaction'da saklanır ve saklama veya kural değerlendirmesi
  sırasında bir hata olursa bütün toplu işlem geri alınır.
- Geçerli öğeler `observed_at` sırasıyla (eskiden yeniye) saklanır ve her biri
  için kurallar çalışır. Başarılı cevap `201` ve
  `{mode, accepted, rejected, evaluations}`; `evaluations` üretilen kural
  değerlendirmesi sayısıdır. Hiç geçerli öğe yoksa (örneğin boş liste) `200`.

### CSV telemetri adaptörü

`services/adapters/` cihaz kayıtlarını `MeasurementCreate` nesnelerine çevirir.
Ortak arayüz `DeviceAdapter` protokolüdür:
`parse(record, index=None) -> MeasurementCreate | AdapterError`
(`AdapterError`: `reason`, `record_index`).

`CsvTelemetryAdapter(source_type, source_id, scenario_id=None)`:

- Sütunlar: `timestamp,mission_id,target_id,metric,value,unit,quality,activity`;
  ilk altısı zorunlu, `quality` boşsa `VALID`, `activity` boşsa yok.
- `timestamp` ISO 8601 olmalıdır; hedef türü metrik kataloğundan gelir; kaynak
  kimliği adaptör örneğine sabittir. `SYNTHETIC` kaynakta `scenario_id` zorunludur.
- Eksik sütun, bilinmeyen metrik, geçersiz zaman veya sayı olmayan değer ve
  şema hataları `AdapterError` olarak döner; satır sessizce düşürülmez.
- `parse_csv_text(adapter, text)` başlık satırlı bir CSV belgesinin her satırını
  çözer.

Adaptör şu an kütüphane arayüzüdür; CSV yükleyen bir HTTP ucu yoktur. Çıktı
`POST /v1/measurements/batch` ile gönderilebilir.

### Gözlemlenebilirlik

- `X-Request-ID`: istekte gelen değer `^[A-Za-z0-9._-]{1,100}$` kalıbına
  uyuyorsa korunur, değilse yeni bir UUID (hex) üretilir. Her cevapta başlık
  olarak döner; CORS bu başlığı kabul eder ve tarayıcıya açar.
- JSON loglar: `spaceapp_logar` log kaydedicisi satır başına bir JSON nesnesi
  yazar. Alanlar `ts`, `level`, `logger`, `message`, varsa `request_id`,
  `method`, `path`, `status`, `duration_ms` ve hata durumunda `exc_type`. Yalnız
  bu alanlar yazılır; sorgu dizesi loglanmaz (yalnız yol).
- Hata gövdesi: bütün HTTP hataları, doğrulama hataları (`422`) ve beklenmeyen
  hatalar (`500`) aynı biçimdedir:

```json
{
  "detail": "<FastAPI'nin önceki detail değeri; mevcut istemciler için korunur>",
  "error": {"code": "NOT_FOUND", "message": "Alert not found", "request_id": "..."}
}
```

`error.code` HTTP durum adıdır (`NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED` gibi);
doğrulama hatalarında `VALIDATION_ERROR`, beklenmeyen hatalarda
`INTERNAL_ERROR`. `detail` bir metin değilse `error.message` durum adı olur.
Toplu ölçümün `all_or_nothing` `422` cevabı bu zarfı kullanmaz (yukarıda).

### Kimlik doğrulama ve roller (isteğe bağlı)

Bu bir demo kimlik bilgisi düzenidir, üretim kimlik sistemi değildir: token
iptali, yenileme ve parola özetleme yoktur.

Ortam değişkenleri (her istekte okunur):

| Değişken | Anlamı |
|---|---|
| `SPACEAPP_AUTH_REQUIRED` | Varsayılan `false`; `1` / `true` / `yes` açar |
| `SPACEAPP_AUTH_SECRET` | Token imzalama anahtarı (HMAC-SHA256); yoksa token verilemez ve doğrulanamaz |
| `SPACEAPP_AUTH_USERS` | `id:ROL:parola` girişleri, virgülle ayrılır; parolalar depoda tutulmaz |

Roller: `ASTRONAUT`, `CREW_MEDICAL_OFFICER`, `GROUND`.

- `POST /v1/auth/token` — gövde `{user_id, passcode}`; cevap `access_token`,
  `token_type: "bearer"`, `expires_at`, `role`, `user_id`. Token 12 saat
  geçerlidir. Anahtar tanımlı değilse `503`, yanlış kimlik/parola `401`. Token
  gerektirmeyen tek `/v1` ucudur; `/health` ve `/ui/` de token istemez.
- Diğer bütün `/v1` uçları `Authorization: Bearer <token>` okur.
  - Bayrak kapalı (varsayılan): tokensız istek anonim demo kullanıcısı
    (`demo-anonymous`) olarak çalışır ve loglanır. Geçersiz/süresi dolmuş token
    yok sayılır, loglanır ve istek anonim çalışır. Geçerli token her iki modda da
    kabul edilir ve rolü uygulanır.
  - Bayrak açık: token yoksa veya geçersizse `401`.
- Aktör: `acknowledge`, `steps` ve `resolve` uçlarında işlemi yapan kişi geçerli
  token varsa token kullanıcısıdır; gövdedeki `crew_member_id` yok sayılır.
  Token yoksa (bayrak kapalı) gövdedeki `crew_member_id` zorunludur, yoksa `422`.
  Bu kişi `acknowledged_by`, `resolved_by` ve adım kaydındaki `crew_member_id`
  olarak saklanır.
- Rol kuralı şu an yalnız `resolve` (kırmızı bayrak kapatma) için vardır: token
  ile çağrılırsa yalnız `CREW_MEDICAL_OFFICER` kapatabilir, diğerleri `403`.
  Anonim demo erişiminde (bayrak kapalı) rol denetlenmez.

Sınırlamalar: çevrimdışı panel `Authorization` başlığı göndermez ve giriş akışı
yoktur; bayrak açılırsa panel çalışmaz. Kırmızı bayrak, ortam ve profil uçları
kişi bilgisini gövdeden alır.

### Migration listesi

| Sürüm | Ne yapar |
|---|---|
| `20261114_0001` | `observations` tablosu (değişmez ham gözlem; `SYNTHETIC` ⇔ `scenario_id` kısıtı) |
| `20261114_0002` | `rule_evaluations` ve `rule_evaluation_evidence` (değerlendirmede kullanılan gözlem kimlikleri) |
| `20261114_0003` | `subjective_check_ins` (beş alan, her biri 0–4; kaynak `MANUAL` veya `SYNTHETIC`) |
| `20261114_0004` | `rule_evaluations.action_card_id` / `action_card_version` |
| `20261114_0005` | `alert_events` (yaşam döngüsü kısıtları; etkin alarm için kısmi benzersiz indeks) |
| `20261114_0006` | `lab_results` (kaynak referans aralığıyla, yalnız eklenen) |
| `20261114_0007` | `observations.activity_state` |
| `20261114_0008` | `red_flag_reports` tablosu ve `alert_events.resolved_by` |
| `20261114_0009` | `action_step_logs` (alarm + kart + sürüm + adım için benzersiz) |
| `20261114_0010` | `subjective_check_ins.vision_change`, `back_pain`, `congestion` (boş bırakılabilir) |
| `20261114_0011` | `environment_contexts` (konum ve yerçekimi kısıtları) |
| `20261114_0012` | `baseline_profiles` ve `baseline_profile_activations` |
| `20261114_0013` | `rule_evaluations.baseline_value`, `baseline_classification`, `baseline_sample_count`, `baseline_profile_version` |
| `20261114_0014` | `rule_evaluations.source` `VARCHAR(255)` → `TEXT` |

### Güncel uç listesi

| Yöntem ve yol | İşlev |
|---|---|
| `GET /health` | Süreç ve şema durumu |
| `POST /v1/auth/token` | Demo kullanıcısına token verir |
| `POST /v1/observations` | CO₂ gözlemi (ilk uç) |
| `POST /v1/measurements` | Tek vital/çevre ölçümü + kurallar |
| `POST /v1/measurements/batch` | Toplu ölçüm |
| `GET /v1/measurements` | Bir metriğin zaman serisi |
| `GET /v1/metrics` | Metrik kataloğu |
| `GET /v1/missions` | Görev listesi |
| `POST /v1/check-ins` | Öznel durum kontrolü |
| `POST /v1/lab-results` | Laboratuvar sonucu |
| `GET /v1/crew/{crew_member_id}/lab-results` | Laboratuvar kartı |
| `GET /v1/crew/{crew_member_id}/status` | Kural durumları ve genel dikkat seviyesi |
| `GET /v1/alerts` | Alarm listesi |
| `POST /v1/alerts/{alert_id}/acknowledge` | Alarmı gördüm |
| `POST /v1/alerts/{alert_id}/steps` | Eylem kartı adımı yapıldı |
| `POST /v1/alerts/{alert_id}/resolve` | Kırmızı bayrak alarmını elle kapatır |
| `GET /v1/red-flags/catalog` | Kırmızı bayrak kataloğu |
| `POST /v1/red-flags` | Kırmızı bayrak bildirimi |
| `GET /v1/risk-coverage` | Risk kapsam haritası |
| `POST`, `GET /v1/environment-contexts` | Ortam kaydı ekler / listeler |
| `GET /v1/environment-contexts/current` | Geçerli ortam ve görev günü |
| `GET /v1/baselines` | Yürürlükteki kişisel normal |
| `POST`, `GET /v1/baseline-profiles` | Anlık görüntü alır / listeler |
| `POST /v1/baseline-profiles/{profile_id}/activate` | Sürümü yeniden etkinleştirir (geri alma) |
| `POST /v1/baseline-profiles/{profile_id}/release` | Otomatik hesaplamaya döner |
| `GET /v1/demo/scenarios` | Demo senaryoları |
| `POST /v1/demo/scenarios/{scenario_id}/run` | Senaryoyu çalıştırır |
| `POST /v1/demo/osdr-labs/import` | OSDR laboratuvar verisini içe aktarır |

## Onay kaydı

14 Kasım 2026 tarihinde proje sahibi:

- ortak zarf + türüne göre doğrulanan hibrit modeli;
- ham gözlemlerin değişmez, kural sonuçlarının ayrı kayıtlar olmasını;
- ilk veri modeli ve endpoint'in yalnızca çevresel CO₂ gözlemiyle başlamasını
  onayladı.

İlk uygulama parçası yalnızca CO₂ Pydantic istek/cevap modellerini ve doğrulama
testlerini kapsar. Veritabanı ve HTTP endpoint'i sonraki ayrı parçalardır.

