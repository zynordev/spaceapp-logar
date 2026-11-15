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

Gereksinimler: Python 3.12, [uv](https://docs.astral.sh/uv/) ve arayüzü derlemek
için Node 22+.

```bash
uv sync
uv run alembic upgrade head
(cd frontend && npm ci && npm run build)   # arayüz: frontend/dist
uv run uvicorn spaceapp_logar.main:app --reload
```

> **Her `git pull` sonrası mutlaka `uv run alembic upgrade head` çalıştırın.**
> Veritabanı şeması kodun gerisinde kalırsa veri kullanan tüm `/v1` uçları
> `503` ve `SCHEMA_OUTDATED` koduyla yanıt verir, `GET /health` ise
> `"schema": "outdated"` gösterir (veritabanı ve kod revizyonlarıyla birlikte).
> Migration uygulandıktan birkaç saniye içinde API kendiliğinden düzelir.

- **Panel:** `http://127.0.0.1:8000/` (yönlendirir: `/ui/`). `frontend/dist`
  klasöründeki React derlemesini FastAPI sunar (`src/spaceapp_logar/dashboard.py`;
  klasör `SPACEAPP_UI_DIST` ile değiştirilebilir). Derleme yoksa `/ui/` bunu
  söyleyen ve komutu gösteren yerleşik bir sayfa döner, API çalışmaya devam eder.
  Çalışırken CDN, harici font veya ağ bağımlılığı yoktur (derleme için Node
  gerekir; Docker imajı derlemeyi içerir).
- **Etkileşimli API dokümantasyonu:** `http://127.0.0.1:8000/docs`
- **Sağlık kontrolü:** `curl http://127.0.0.1:8000/health`

Varsayılan veritabanı, komutun çalıştırıldığı klasörde (normalde proje kökü)
`spaceapp-logar.db` dosyasıdır (SQLite, WAL kipi; git'e girmez). PostgreSQL için aşağıdaki bölüme bakın.

Testler:

```bash
uv run pytest
```

SQLite'ta (`a561bde`) 371 test geçer, 2 test atlanır (yalnız PostgreSQL'de koşan testler).

## Arayüz (`frontend/`)

Yeni arayüz sıfırdan yazıldı: Vite + React 19 + TypeScript + React Three Fiber
(`three`, `@react-three/drei`), durum yönetimi için `zustand`. Eski vanilla JS
paneli (`src/spaceapp_logar/web/`) kaldırıldı. Başlıca parçalar:

- **HUD tarzı görev ekranı:** tam ekran 3D sahnenin üstünde cam efektli HUD;
  genel durum, vital kutucukları, zaman/eğilim grafiği, alarmlar, eylem kartı V2
  ve "Neden bu durum?" kural açıklamaları.
- **3D vücut haritası:** `GET /v1/crew/{id}/body-map` çıktısındaki 9 sabit bölgeyi
  (`head, eyes, inner_ear, heart, lungs, torso, musculoskeletal, skin, cabin`)
  dikkat seviyesine göre renklendirir; bölgeye tıklayınca kural, değer ve alarm
  ayrıntısı açılır. Gerçekçi anatomi **BodyParts3D 4.0**'dan türetilir
  (© The Database Center for Life Science, **CC BY 4.0**; atıf ve dönüştürme
  notu `frontend/public/models/ATTRIBUTION.md` dosyasında). `models/body.glb`
  sunulamıyorsa arayüz yerleşik prosedürel 3D gövdeye, 3D çalışmıyorsa 2D SVG
  yedeğine düşer.
- **Girişler:** öznel durum formu, aktivite bildirimi, rutinler ve periyodik
  testler, laboratuvar, kırmızı bayrak, demo senaryosu ve OSDR yükleme.
- **Yer istasyonu paneli:** senkron paketleri, uçuş hekimi eskalasyonları ve risk
  kapsam haritası.
- **Giriş penceresi:** `GET /v1/auth/config` yetkilendirme istendiğini söylerse
  kullanıcı id'si ve parola ile `POST /v1/auth/token` çağrılır; token
  `sessionStorage`'da tutulur (sekme kapanınca silinir). Bayrak kapalıyken giriş
  gerekmez.
- **Çevrimdışı öncelikli:** CDN, harici font veya dış istek yok; meshopt kod
  çözücü pakete dahildir.

Geliştirme: `cd frontend && npm ci && npm run dev` (varsayılan
`http://localhost:5173/ui/`; `/v1` ve `/health` isteklerini arka uca yönlendirir).
`VITE_BACKEND` arka uç adresini (varsayılan `http://127.0.0.1:8000`),
`VITE_PORT` dev sunucu portunu değiştirir. Üretim derlemesi: `npm run build`
(`tsc --noEmit` + `vite build` -> `frontend/dist`). Arayüz bileşenleri için:
`frontend/src/ui/README.md`.

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
   Gerçek NASA DONKI (Mayıs 2024 SEP) olay zamanları radyasyon senaryosunun
   zamanlamasını belirler; doz değerleri sentetiktir ([veri notu](data/nasa/README.md)).
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

12 metrik toplanıp grafiklenir: kalp hızı, kalp hızı değişkenliği (`HRV_RMSSD`),
SpO₂, solunum, vücut sıcaklığı, sistolik/diyastolik tansiyon, uyku, kabin
CO₂/O₂/basınç ve radyasyon doz hızı. `HRV_RMSSD` **yalnız veridir**: hiçbir
kural veya eşik okumaz, risk kapsamında "yalnız veri" görünür.

## 15 Kasım 2026'da eklenenler

- **Aktivite bildirimi** (`/v1/activities`): REST / LIGHT / EXERCISE / SLEEP ve
  planlanan süre (5-240 dk). Ölçümde sensör etiketi yoksa bildirilen aktivite
  ölçüme damgalanır (`observations.activity_source` = `SENSOR` | `DECLARED`).
  Süre dolup bitiş bildirilmezse bağlam **bilinmiyor** sayılır (`state: EXPIRED`).
  `CrewStatusRead.current_activity` durum cevabında döner.
- **Vücut haritası** (`GET /v1/crew/{id}/body-map`, `rules/body_map.py`): her kural
  ve metrik sabit bir bölgeye eşlenir; bölge dikkati o bölgedeki en kötü kural
  seviyesidir. Kuralı olmayan bölge `UNKNOWN` ve `DATA_ONLY` ya da `GAP` görünür.
- **Rutinler, periyodik testler ve seriler** (`/v1/routines/*`): su, egzersiz, uyku
  penceresi ve öznel durum hatırlatmaları; haftalık vücut kütlesi, haftalık
  kavrama kuvveti ve iki haftalık kas-iskelet değerlendirmesi. Aralıklar **DEMO**
  varsayılanlardır; ardışık tamamlanan dilimler seri (streak) üretir. **İlaç
  hatırlatması yoktur.**
- **Yer ile senkron ve otomatik uçuş hekimi eskalasyonu** (`/v1/sync/*`): alıcıya
  göre (uçuş hekimi, yaşam destek, radyasyon, görev kontrol) sabit yönlendirme
  tablosuyla gecikmeye dayanıklı paketler; SHA-256 özeti ve `SPACEAPP_AUTH_SECRET`
  tanımlıysa HMAC-SHA256 imzası. Paketi alan taraf `POST /v1/sync/ack` ile
  özeti onaylar (token varsa `GROUND` rolü gerekir). ALERT/CRITICAL alarm
  açılınca (kırmızı bayrak dahil) alarm başına bir kez otomatik eskalasyon
  oluşur. Yönlendirme kural tablosudur; makine öğrenmesi yoktur.
- **Eğilim** (`GET /v1/measurements/trend`): saatlik/günlük sepetlerle
  ortalama, en küçük, en büyük ve sayı.
- **Kimlik:** `GET /v1/auth/config` (token istemez) ve `GET /v1/auth/me`.

## Doğrulama (sentetik)

Kural motoru, sabit tohumlu sentetik senaryolarda (normal günler, CO2, SpO2,
ateş, kalp+solunum, sensör arızası, kırmızı bayrak) tek eşikli saf bir tabanla
karşılaştırılır: yakalama oranı, normal pencerelerde yanlış alarm ve sensör
arızasında "Bilinmiyor" oranı. **Sentetik veri — klinik doğrulama değildir;
eşikler DEMO.** Yöntem ve sonuçlar: [docs/VALIDATION.md](docs/VALIDATION.md).
Yeniden üretmek için: `uv run python scripts/validate_rules.py --n 15 --write docs/VALIDATION.md`
(yaklaşık 2 dk). Ayrıca `tests/test_language_guard.py`, eylem kartlarında,
kural metinlerinde ve arayüz metinlerinde tanı/ilaç dilini CI'da engeller.

## Bilinen sınırlar

- **Aktivite bitirme sahiplik denetimi yapmaz:** `POST /v1/activities/{id}/end`
  başka bir ekip üyesinin açık bildirimini de bitirebilir.
- **Rutin varsayılanlarının tekrar çağrılabilirliği (idempotency) koddadır:**
  `POST /v1/routines/defaults` mevcut etkin takvimi yeniden kullanır, ama
  veritabanında benzersizlik kısıtı yoktur; eşzamanlı iki çağrı yinelenen takvim
  üretebilir.
- **Senkron durumundaki bekleyen sayıları yaklaşıktır:** `pending_items` son
  onaydan beri alınan kayıtları sayar ve en fazla 5000 öğe tarar; paketle birebir
  aynı olmayabilir.
- **BodyParts3D 4.0'da akciğer parankimi ve iç kulak labirenti etiketi yoktur:**
  akciğerler bronş ağacı ve akciğer damarlarıyla gösterilir; `inner_ear` bölgesi
  dış kulağı kullanır. Bu bir görselleştirme sınırıdır.
- DEMO eşikler uçuş tıbbı uzmanı doğrulaması bekler; canlı veri sentetiktir
  (yalnız OSDR lab değerleri gerçektir). Makine öğrenmesi, teşhis ve ilaç
  önerisi yoktur.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `SPACEAPP_DATABASE_URL` | — | Veritabanı adresi; tanımlıysa `DATABASE_URL`'den önce gelir. |
| `DATABASE_URL` | — | Yedek veritabanı adresi (ör. Render'ın verdiği `postgres://…`). İkisi de yoksa `sqlite:///./spaceapp-logar.db`. `postgres://` ve `postgresql://` otomatik olarak `postgresql+psycopg://` sürücüsüne çevrilir. Alembic de aynı değişkenleri okur. |
| `SPACEAPP_CORS_ORIGINS` | `localhost` ve `127.0.0.1` üzerinde 5173 ve 3000 portları | Virgülle ayrılmış izinli kökenler, ör. `http://localhost:4200`. |
| `SPACEAPP_AUTH_REQUIRED` | `false` | `1`/`true`/`yes` ise `/v1` uçları token ister (bkz. Kimlik doğrulama). |
| `SPACEAPP_AUTH_SECRET` | — | Token imzalama anahtarı (HMAC-SHA256); tanımlıysa senkron paketlerini de imzalar. Yoksa `POST /v1/auth/token` 503 döner. |
| `SPACEAPP_AUTH_USERS` | — | Demo kullanıcılar: `id:ROL:parola`, virgülle ayrılmış. |
| `SPACEAPP_UI_DIST` | proje kökünde `frontend/dist` | `/ui/` altında sunulan arayüz derlemesinin klasörü. |
| `SPACEAPP_LINK_DELAY_SECONDS` | — | Yer bağlantısı gecikmesi (tam sayı, saniye); `GET /v1/sync/status` içinde `link_delay_seconds` olarak döner. Geçersizse yok sayılır. |
| `VITE_BACKEND`, `VITE_PORT` | `http://127.0.0.1:8000`, `5173` | Yalnız `npm run dev`: arka uç adresi ve dev sunucu portu. |
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
- **Bayrak açık:** `POST /v1/auth/token` ve `GET /v1/auth/config` dışındaki tüm `/v1` uçları
  `Authorization: Bearer <token>` ister; yoksa veya geçersizse 401. Alarm
  eylemlerinde (onaylama, adım kaydı, kapatma) token sahibinin kimliği
  kullanılır, gövdedeki farklı `crew_member_id` yok sayılır. Öznel form,
  kırmızı bayrak ve lab sonucu uçlarında gövdedeki `crew_member_id` token ile
  karşılaştırılmaz.
  `/health`, `/docs` ve panel dosyaları token istemez.

Roller: `ASTRONAUT`, `CREW_MEDICAL_OFFICER`, `GROUND`. İki rol kuralı vardır:
token ile gelen istekte kırmızı bayrak alarmını kapatmak
(`POST /v1/alerts/{id}/resolve`) yalnız `CREW_MEDICAL_OFFICER` içindir;
senkron paketini onaylamak (`POST /v1/sync/ack`) yalnız `GROUND` içindir (aksi
403). `GET /v1/auth/me` çağıranın kimliğini ve rolünü döner.

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
üretim kimlik sistemi değildir. Panelin giriş penceresi vardır; token
`sessionStorage`'da tutulur, süre dolunca yeniden giriş gerekir.

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
| `GET /v1/auth/config` | Yetkilendirme istenip yapılandırıldığı (token gerektirmez) |
| `GET /v1/auth/me` | Çağıranın kimliği ve rolü (anonim demo dahil) |
| `POST /v1/measurements` | Tek ölçüm (12 metrik), kuralları çalıştırır |
| `POST /v1/measurements/batch` | Toplu ölçüm (en fazla 1000); `all_or_nothing` veya `partial` |
| `GET /v1/measurements` | Ölçüm serisi |
| `GET /v1/measurements/trend` | Saatlik/günlük eğilim sepetleri (en fazla 1000 sepet) |
| `GET /v1/metrics` | Metrik kataloğu |
| `GET /v1/missions` | Görevler |
| `POST /v1/observations` | Eski uç (yalnız CO₂), geriye uyumluluk için |
| `POST /v1/check-ins` | Öznel durum formu |
| `POST /v1/lab-results` | Laboratuvar sonucu |
| `GET /v1/crew/{crew_member_id}/lab-results` | Laboratuvar paneli |
| `GET /v1/crew/{crew_member_id}/status` | Genel durum, kural sonuçları ve güncel aktivite (`current_activity`) |
| `GET /v1/crew/{crew_member_id}/body-map` | 9 sabit bölgeli vücut haritası |
| `POST /v1/activities` | Aktivite bildirimi başlatır (açık olan bitirilir) |
| `POST /v1/activities/{activity_id}/end` | Aktiviteyi bitirir (zaten bitmişse 409) |
| `GET /v1/activities/current` | Güncel aktivite: `ACTIVE`, `EXPIRED` veya `NONE` |
| `GET /v1/routines/catalog` | Rutin ve periyodik test kataloğu (DEMO aralıklar) |
| `POST /v1/routines` | Rutin takvimi oluşturur |
| `POST /v1/routines/defaults` | Katalogdaki tüm rutinler için varsayılan takvim |
| `GET /v1/routines/due` | Zamanı gelen/geciken/yaklaşan rutinler ve seriler |
| `POST /v1/routines/{schedule_id}/complete` | Rutini tamamlandı işaretler |
| `GET /v1/sync/status` | Alıcı başına bekleyen kayıtlar, bağlantı gecikmesi, bekleyen eskalasyonlar |
| `GET /v1/sync/packet` | Alıcıya özel, SHA-256 özetli (ve isteğe bağlı HMAC imzalı) paket |
| `POST /v1/sync/ack` | Paketi özetiyle onaylar (özet uyuşmazsa 409; token varsa `GROUND`) |
| `GET /v1/sync/escalations` | Otomatik uçuş hekimi eskalasyonları |
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
| `GET /v1/space-weather/events?month=2024-05` | Gerçek NASA DONKI SEP olay zamanları (akı/doz yok) |

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
- [Git ile ortak çalışma düzeni](docs/GIT_WORKFLOW.md)
- [Birlikte çalışma biçimi ve onay noktaları](docs/COLLABORATION.md)
- [Açıklanabilir alarm kuralları](docs/ALARM_RULES.md)
- [DEMO kuralları ve eylem kartları](docs/DEMO_RULES.md)
- [CO₂ WATCH eylem kartı (V1 ve V2 onaylı)](docs/CO2_ACTION_CARD_PROPOSAL.md)
- [Biyolojik karar rehberi](docs/biyo.md)
- [API ve veri modeli](docs/API_DATA_MODEL.md)
- [Paralel yapı sözleşmesi (15 Kasım; kod esastır)](docs/CONTRACT_PARALLEL_BUILD.md)
- [MVP gösterge kısa listesi](docs/MVP_INDICATORS.md)
- [Araştırma ve geliştirme planı](docs/RESEARCH_PLAN.md)
- [Challenge ve açık veri ön incelemesi](docs/DATA_AUDIT.md)
- [Backend teknoloji yığını seçenekleri](docs/BACKEND_STACK_OPTIONS.md)
- [NASA Space Apps teslim paketi (İngilizce)](docs/SUBMISSION.md)
- [Gerçek OSDR laboratuvar verisi](data/osdr/README.md)
- [Gerçek NASA DONKI olay zamanlaması (radyasyon senaryosu)](data/nasa/README.md)

## Temel kaynaklar

- [NASA Space Apps challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=details)
- [NASA Open Science Data Repository](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study)
- [NASA Human Research Program](https://www.nasa.gov/hrp/)
