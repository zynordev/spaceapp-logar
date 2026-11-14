# SpaceApp Logar

NASA Space Apps Challenge 2026 için geliştirilen açıklanabilir astronot sağlık
karar-destek aracı (prototip).

Sistem astronotun sağlık ve kabin çevresi ölçümlerini birlikte izler, ölçümün
kişisel ve görev bağlamına göre dikkat gerektirip gerektirmediğini açıklanabilir
kurallarla belirler ve önceden yazılmış eylem kartları sunar. **Tıbbi teşhis
koymaz, ilaç veya doz önermez, serbest metin tedavi üretmez.** Yalnızca kabin CO₂
kuralı NASA-STD-3001'e dayanır; diğer eşikler **DEMO** etiketlidir (kanıt sınıfı
F) ve uçuş tıbbı uzmanı doğrulaması bekler. Canlı ölçümler sentetiktir; gerçek
veri yalnızca NASA OSDR laboratuvar değerleridir.

## Çalıştırma

Gereksinimler: Python 3.12 ve [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn spaceapp_logar.main:app --reload
```

> **Her `git pull` sonrası mutlaka `uv run alembic upgrade head` çalıştırın.**
> Veritabanı şeması kodun gerisinde kalırsa veri kullanan tüm `/v1` uçları
> `503` ve `SCHEMA_OUTDATED` koduyla yanıt verir, `GET /health` ise
> `"schema": "outdated"` gösterir (veritabanı ve kod revizyonlarıyla birlikte).
> Migration uygulandıktan birkaç saniye içinde API kendiliğinden düzelir.

- **Panel:** `http://127.0.0.1:8000/` (yönlendirir: `/ui/`). Çevrimdışı çalışır;
  CDN, harici font veya build adımı yoktur.
- **Etkileşimli API dokümantasyonu:** `http://127.0.0.1:8000/docs`
- **Sağlık kontrolü:** `curl http://127.0.0.1:8000/health`

Varsayılan veritabanı, komutun çalıştırıldığı klasörde (normalde proje kökü)
`spaceapp-logar.db` dosyasıdır (SQLite, WAL kipi; git'e girmez). PostgreSQL için aşağıdaki bölüme bakın.

Testler:

```bash
uv run pytest
```

SQLite'ta 317 test geçer, 2 test atlanır (yalnız PostgreSQL'de koşan testler).

## Panel ve demo akışı

Panelin üst şeridinden:

1. **Demo senaryosu çalıştır.** Dokuz sentetik senaryodan birini, şu an biten bir
   zaman çizelgesiyle yeni bir görev olarak üretir. Hiçbir mevcut veri silinmez.
   - `co2-headache` (akut): kabin CO₂ yükselir, baş ağrısı bildirilir, CO₂ WATCH
     kartı açılır. Arada yapılan egzersiz bağlam sayesinde alarm üretmez.
   - `fever-trend` (alt akut): sıcaklık eğilimi önce İzle sonra Uyarı olur;
     dinlenme kalp ve solunum hızı birlikte yükselir (İzle), öznel belirti (ör.
     yorgunluk ≥2/4) girildiğinde bu kural da Uyarı olur.
   - `spo2-drop` (akut): dinlenmede SpO₂ önce WATCH, sonra ALERT.
   - `sensor-fault`: arızalı SpO₂ ve şüpheli kalp hızı sıçraması. Sağlık alarmı
     yoktur, genel durum "Bilinmiyor" görünür (kötü veri ≠ normal sağlık).
   - `chest-pain-red-flag`: ölçümler normalken göğüs ağrısı bildirilir; sistem
     beklemeden Kritik seviyeye çıkar ve acil kartı açar. Teşhis konmaz.
   - `cabin-o2-drop`: kabin O₂ ve basınç düşer; O₂ kısmi basıncı Uyarı, ekibin
     SpO₂'si İzle.
   - `radiation-spe`: güneş parçacık olayı; doz hızı İzle → Uyarı, korunaklı
     bölüm kartı ve kümülatif doz.
   - `sleep-debt`: üç gece kısa uyku ve yüksek yorgunluk; Uyarı.
   - `gravity-adaptation`: yerçekimi geçişi sonrası bulantı, baş dönmesi ve görme
     değişikliği; hareket hastalığı ve SANS izlemi İzle.
2. **Gerçek OSDR lab verisi.** NASA OSDR OSD-569 (CBC) ve OSD-575 (CMP)
   dosyalarından Inspiration4 mürettebatının gerçek laboratuvar değerlerini yükler
   (252 değer; uçuş öncesi 108, uçuş sonrası 144 — uçuş sırasında örnek yoktur).
   Ayrıntı: [veri notu](data/osdr/README.md).
3. Öznel durum formunu doldurun, alarmları "Gördüm" ile onaylayın, eylem
   kartındaki adımları "Yaptım" ile kaydedin ve "Neden bu durum?" panelinden her
   kararın kural, pencere, eşik ve kaynağını gösterin. "Risk kapsamı" bölümü
   NASA'nın beş tehlikesi ve ek bir kesitler arası "veri güvenilirliği" başlığı
   altında toplam 21 riski gösterir: 11'i kurallı, 4'ü yalnız veri, 6'sı boşluk
   (`GET /v1/risk-coverage`).

Komut satırından aynı işlemler:

```bash
curl -X POST http://127.0.0.1:8000/v1/demo/scenarios/fever-trend/run
uv run python -m spaceapp_logar.services.osdr_import
```

## Kurallar

| Kural | Durum |
|---|---|
| `ENV_CO2_NOMINAL_V1` — kabin CO₂, NASA-STD-3001 nominal sınırı | Onaylı ([alarm kuralları](docs/ALARM_RULES.md)) |
| `VITAL_SPO2_SUSTAINED_V1`, `VITAL_TEMP_TREND_V1`, `MULTI_CARDIO_RESP_V1` (dinlenme kalp + solunum + belirti), `DATA_HR_JUMP_V1` (kalp hızı sensör kalitesi) | **DEMO** ([DEMO kuralları](docs/DEMO_RULES.md)) |
| `RED_FLAG_SYMPTOM_V1` — göğüs ağrısı, ciddi nefes darlığı, bayılma vb. bildirilince anında Kritik | **DEMO**; ölçümlerle kapanmaz, ekip üyesi kapatır |
| `ENV_CABIN_ATMOSPHERE_V1` (kabin O₂ kısmi basıncı), `ENV_RADIATION_V1` (doz hızı + kümülatif doz), `BEHAV_SLEEP_V1` (uyku borcu) | **DEMO** ([DEMO kuralları](docs/DEMO_RULES.md)) |
| `SENS_MOTION_SICKNESS_V1`, `SANS_VISION_SYMPTOM_V1` | **DEMO**; belirtiye dayalı, en fazla İzle seviyesine çıkar |

Her kural bir eylem kartı açar (V2: adım nedenleri, yeniden değerlendirme
sayacı, yükselme/kapanma koşulları, canlı durum). Eski V1 kartları eski kayıtlar
için katalogda durur. Sorulmamış veya isteğe bağlı girdiler "Bilinmiyor" üretmez.

11 metrik toplanıp grafiklenir: kalp hızı, SpO₂, solunum, vücut sıcaklığı,
sistolik/diyastolik tansiyon, uyku, kabin CO₂/O₂/basınç ve radyasyon doz hızı.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `SPACEAPP_DATABASE_URL` | — | Veritabanı adresi; tanımlıysa `DATABASE_URL`'den önce gelir. |
| `DATABASE_URL` | — | Yedek veritabanı adresi (ör. Render'ın verdiği `postgres://…`). İkisi de yoksa `sqlite:///./spaceapp-logar.db`. `postgres://` ve `postgresql://` otomatik olarak `postgresql+psycopg://` sürücüsüne çevrilir. Alembic de aynı değişkenleri okur. |
| `SPACEAPP_CORS_ORIGINS` | `localhost` ve `127.0.0.1` üzerinde 5173 ve 3000 portları | Virgülle ayrılmış izinli kökenler, ör. `http://localhost:4200`. |
| `SPACEAPP_AUTH_REQUIRED` | `false` | `1`/`true`/`yes` ise `/v1` uçları token ister (bkz. Kimlik doğrulama). |
| `SPACEAPP_AUTH_SECRET` | — | Token imzalama anahtarı (HMAC-SHA256). Yoksa `POST /v1/auth/token` 503 döner. |
| `SPACEAPP_AUTH_USERS` | — | Demo kullanıcılar: `id:ROL:parola`, virgülle ayrılmış. |
| `SPACEAPP_ALEMBIC_INI` | proje kökündeki `alembic.ini` | Şema kontrolünün kodun beklediği revizyonu okuduğu dosya. Bulunamazsa şema durumu `unknown` olur. |
| `TEST_DATABASE_URL` | — | Yalnız testler: tanımlıysa tüm test seti bu PostgreSQL veritabanında koşar. |
| `PORT` | `8000` | Yalnız Docker imajı (`Dockerfile` CMD): uvicorn'un dinlediği port. |

İstek kimliği ve JSON loglar için ayrıca bir ortam değişkeni yoktur.

## Kimlik doğrulama (isteğe bağlı)

Varsayılan olarak **kapalıdır**; panel ve demo senaryoları token olmadan çalışır.

- **Bayrak kapalı (`SPACEAPP_AUTH_REQUIRED` tanımsız/`false`):** Token
  göndermeyen istek anonim demo kullanıcısı (`demo-anonymous`) olarak çalışır ve
  loglanır. Geçerli bir token gönderilirse kullanılır (roller uygulanır).
  Geçersiz veya süresi dolmuş token 401 vermez; yok sayılır, uyarı loglanır ve
  istek anonim olarak devam eder. Ekip eylemlerinde (onaylama, adım kaydı,
  kapatma) gövdedeki `crew_member_id` zorunludur (yoksa 422).
- **Bayrak açık:** `POST /v1/auth/token` dışındaki tüm `/v1` uçları
  `Authorization: Bearer <token>` ister; yoksa veya geçersizse 401. Alarm
  eylemlerinde (onaylama, adım kaydı, kapatma) token sahibinin kimliği
  kullanılır, gövdedeki farklı `crew_member_id` yok sayılır. Öznel form,
  kırmızı bayrak ve lab sonucu uçlarında gövdedeki `crew_member_id` token ile
  karşılaştırılmaz.
  `/health`, `/docs` ve panel dosyaları token istemez.

Roller: `ASTRONAUT`, `CREW_MEDICAL_OFFICER`, `GROUND`. Şu an tek rol kuralı:
token ile gelen istekte kırmızı bayrak alarmını kapatmak
(`POST /v1/alerts/{id}/resolve`) yalnız `CREW_MEDICAL_OFFICER` içindir (aksi
403).

Örnek (değerler sahtedir; gerçek parola veya anahtar repoya yazılmaz):

```bash
export SPACEAPP_AUTH_SECRET="ornek-yerel-anahtar"
export SPACEAPP_AUTH_USERS="crew-01:ASTRONAUT:ornek-parola-1,medic-01:CREW_MEDICAL_OFFICER:ornek-parola-2"
export SPACEAPP_AUTH_REQUIRED=true
uv run uvicorn spaceapp_logar.main:app --reload

curl -X POST http://127.0.0.1:8000/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"user_id": "medic-01", "passcode": "ornek-parola-2"}'
# -> {"access_token": "...", "token_type": "bearer", "expires_at": "...", "role": "CREW_MEDICAL_OFFICER", "user_id": "medic-01"}

curl -H "Authorization: Bearer <access_token>" \
  "http://127.0.0.1:8000/v1/alerts?mission_id=<gorev-id>"
```

Sınırlamalar: token'lar 12 saat geçerli HMAC imzalı demo kimlik bilgileridir;
iptal ve yenileme yoktur, parolalar ortam değişkeninde düz metindir (özetlenmez),
üretim kimlik sistemi değildir. Panelde giriş akışı yoktur; bayrak açıkken panel
veri çekemez.

## PostgreSQL

SQLite varsayılandır; paylaşılan dağıtım için PostgreSQL desteklenir (psycopg 3).

```bash
export SPACEAPP_DATABASE_URL="postgresql://kullanici:parola@localhost:5432/logar"
uv run alembic upgrade head
uv run uvicorn spaceapp_logar.main:app
```

Testleri PostgreSQL'de koşmak için boş bir test veritabanı verin (her test
`public` şemasını sıfırlar; geliştirme veritabanını kullanmayın):

```bash
TEST_DATABASE_URL="postgresql://kullanici:parola@localhost:5432/logar_test" uv run pytest
```

CI'da (`.github/workflows/ci.yml`) iki iş vardır: `test` (SQLite) ve
`test-postgres` (PostgreSQL 16 servisi ile aynı test seti).

**Yerelde PostgreSQL veya Docker kurmadan doğrulama:**

```bash
uv run --with pgserver python scripts/test_postgres_local.py
```

Betik geçici bir gömülü PostgreSQL başlatır, boş `logar_test` veritabanını
oluşturur, `TEST_DATABASE_URL` ile tüm testleri koşar ve sunucuyu kapatır. Ek
argümanlar pytest'e geçer (ör. `-q -x`). `pgserver` proje bağımlılığı değildir.

Render dağıtımında hangi veritabanının kullanılacağı henüz kararlaştırılmadı;
`render.yaml` veritabanı tanımlamaz.

## API

Tüm uçlar (koddan; ayrıntılı şema `/docs` ve [API ve veri modeli](docs/API_DATA_MODEL.md)):

| Uç | Açıklama |
|---|---|
| `GET /health` | Servis ve şema durumu (`current` / `outdated` / `unknown`) |
| `POST /v1/auth/token` | Demo kullanıcı için token (token gerektirmez) |
| `POST /v1/measurements` | Tek ölçüm (11 metrik), kuralları çalıştırır |
| `POST /v1/measurements/batch` | Toplu ölçüm (en fazla 1000); `all_or_nothing` veya `partial` |
| `GET /v1/measurements` | Ölçüm serisi |
| `GET /v1/metrics` | Metrik kataloğu |
| `GET /v1/missions` | Görevler |
| `POST /v1/observations` | Eski uç (yalnız CO₂), geriye uyumluluk için |
| `POST /v1/check-ins` | Öznel durum formu |
| `POST /v1/lab-results` | Laboratuvar sonucu |
| `GET /v1/crew/{crew_member_id}/lab-results` | Laboratuvar paneli |
| `GET /v1/crew/{crew_member_id}/status` | Genel durum ve kural sonuçları |
| `GET /v1/alerts` | Görevin alarmları (`mission_id` zorunlu) |
| `POST /v1/alerts/{alert_id}/acknowledge` | "Gördüm" |
| `POST /v1/alerts/{alert_id}/steps` | Eylem kartı adımı "Yaptım" |
| `POST /v1/alerts/{alert_id}/resolve` | Yalnız kırmızı bayrak alarmlarını kapatır |
| `GET /v1/red-flags/catalog` | Kırmızı bayrak belirti listesi |
| `POST /v1/red-flags` | Kırmızı bayrak bildirimi (anında Kritik) |
| `GET /v1/risk-coverage` | Risk kapsam haritası (NASA'nın beş tehlikesi + veri güvenilirliği) |
| `POST /v1/environment-contexts` | Ortam bağlamı değişikliği (yeni kişisel normal profili başlatır) |
| `GET /v1/environment-contexts` | Ortam bağlamları |
| `GET /v1/environment-contexts/current` | Geçerli ortam ve görev günü |
| `GET /v1/baselines` | Kişisel normal (bağlama göre) |
| `POST /v1/baseline-profiles` | Kişisel normal profil sürümü oluşturur |
| `GET /v1/baseline-profiles` | Profil sürümleri |
| `POST /v1/baseline-profiles/{profile_id}/activate` | Profil sürümünü etkinleştirir |
| `POST /v1/baseline-profiles/{profile_id}/release` | Etkin profili bırakır (204) |
| `GET /v1/demo/scenarios` | Demo senaryoları |
| `POST /v1/demo/scenarios/{scenario_id}/run` | Senaryoyu yeni görev olarak üretir |
| `POST /v1/demo/osdr-labs/import` | Gerçek OSDR lab verisini yükler |

Cihaz verisi için `spaceapp_logar.services.adapters` içinde CSV telemetri
adaptörü (`CsvTelemetryAdapter`, gerekli sütunlar: `timestamp, mission_id,
target_id, metric, value, unit`) kütüphane olarak bulunur; ayrı bir HTTP ucu
yoktur.

### İstek kimliği ve hata gövdesi

Her yanıtta `X-Request-ID` başlığı vardır. İstemci geçerli bir değer
gönderirse (harf, rakam, `.`, `_`, `-`; en fazla 100 karakter) aynen döner,
yoksa sunucu üretir. Her istek tek satır JSON log olarak yazılır (yalnız yol;
sorgu dizesi loglanmaz). Hata yanıtları ortak biçimdedir; eski istemciler için
`detail` korunur:

```json
{
  "detail": "...",
  "error": {"code": "VALIDATION_ERROR", "message": "İstek doğrulanamadı.", "request_id": "..."}
}
```

Kodlar: istek şeması doğrulama hatası `VALIDATION_ERROR`, beklenmeyen hata
`INTERNAL_ERROR`, diğerleri HTTP durum adı (ör. `NOT_FOUND`, `UNAUTHORIZED`;
uçların kendi 422'leri, örneğin eksik `crew_member_id`, `UNPROCESSABLE_ENTITY`).
İstisna: `POST /v1/measurements/batch` `all_or_nothing` kipinde geçersiz öğe
varsa 422 ile kendi sonuç gövdesini (`mode`, `accepted`, `rejected`,
`evaluations`) döner; ortak hata gövdesi kullanılmaz. Şema eski olduğunda
503 yanıtının `detail` alanında `"code": "SCHEMA_OUTDATED"` bulunur.

## Belgeler

- [Oturum durumu ve kaldığımız yer](docs/SESSION_STATUS.md)
- [Backend devir notu ve sıradaki işler](docs/HANDOFF.md)
- [Ortak iş panosu](docs/WORK_BOARD.md)
- [Git ile ortak çalışma düzeni](docs/GIT_WORKFLOW.md)
- [Birlikte çalışma biçimi ve onay noktaları](docs/COLLABORATION.md)
- [Açıklanabilir alarm kuralları](docs/ALARM_RULES.md)
- [DEMO kuralları ve eylem kartları](docs/DEMO_RULES.md)
- [CO₂ WATCH eylem kartı (V1 ve V2 onaylı)](docs/CO2_ACTION_CARD_PROPOSAL.md)
- [Biyolojik karar rehberi](docs/biyo.md)
- [API ve veri modeli](docs/API_DATA_MODEL.md)
- [MVP gösterge kısa listesi](docs/MVP_INDICATORS.md)
- [Araştırma ve geliştirme planı](docs/RESEARCH_PLAN.md)
- [Challenge ve açık veri ön incelemesi](docs/DATA_AUDIT.md)
- [Backend teknoloji yığını seçenekleri](docs/BACKEND_STACK_OPTIONS.md)
- [NASA Space Apps teslim paketi (İngilizce)](docs/SUBMISSION.md)
- [Gerçek OSDR laboratuvar verisi](data/osdr/README.md)

## Temel kaynaklar

- [NASA Space Apps challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=details)
- [NASA Open Science Data Repository](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study)
- [NASA Human Research Program](https://www.nasa.gov/hrp/)
