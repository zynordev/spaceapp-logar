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

## Saklama ve değişmezlik kuralları

- Ham gözlem alındıktan sonra değeri sessizce güncellenmez veya silinmez.
- Düzeltme gerekirse eski kayda referans veren yeni bir kayıt oluşturulur.
- Bütün zamanlar UTC saklanır; arayüz yerel saate çevirebilir.
- Sentetik kayıtta `source_type=SYNTHETIC` ve `scenario_id` zorunludur.
- OSDR kaydında dataset kimliği `source_id` içinde zorunludur.
- Kural sürümü ve kaynak URL'si değerlendirme anındaki haliyle saklanır.
- SQLite yarışma demosu içindir; uçuşa hazır veya klinik üretim veritabanı olduğu
  iddia edilmez.
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
- [ ] `POST /v1/observations` ile ham kaydı değiştirmeden saklama
- [ ] Son bir saatlik veri yeterliliği ve ortalama hesaplama
- [ ] CO₂ kuralını çalıştırıp denetlenebilir sonucu döndürme

## Onay kaydı

14 Kasım 2026 tarihinde proje sahibi:

- ortak zarf + türüne göre doğrulanan hibrit modeli;
- ham gözlemlerin değişmez, kural sonuçlarının ayrı kayıtlar olmasını;
- ilk veri modeli ve endpoint'in yalnızca çevresel CO₂ gözlemiyle başlamasını
  onayladı.

İlk uygulama parçası yalnızca CO₂ Pydantic istek/cevap modellerini ve doğrulama
testlerini kapsar. Veritabanı ve HTTP endpoint'i sonraki ayrı parçalardır.

