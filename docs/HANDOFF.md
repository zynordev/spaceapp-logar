# Backend Devir Notu

Son güncelleme: 15 Kasım 2026 (teslim günü, NASA Space Apps)

Bu belge projeyi devralacak geliştiricinin mevcut durumu yeniden keşfetmeden
güvenle devam etmesi içindir. Bugünkü oturumun ayrıntılı günlüğü, kararların
gerekçeleri ve sıra sıra yapılanlar için: [Oturum durumu](SESSION_STATUS.md).

SpaceApp Logar bir **prototip karar-destek aracıdır; teşhis koymaz, tedavi, ilaç
veya doz önermez.** Yalnız kabin CO2 kuralı (`ENV_CO2_NOMINAL_V1`) NASA-STD-3001'e
dayanır; diğer tüm eşikler **DEMO** etiketlidir (kanıt sınıfı F) ve uçuş tıbbı
doğrulaması bekler.

## Ekip ve roller

| Kişi | Rol |
|---|---|
| `piebio` | Backend + araştırma; Claude ile çalışıyor |
| Halil Erdem Yanık | Backend; ekip koordinasyonu |
| Hakan | Frontend |
| Kuzey | Antigravity aracıyla CI, `Dockerfile`, `render.yaml` ve `SUBMISSION.md`'yi hazırladı; şimdilik bu işten çekildi |

`docs/WORK_BOARD.md` artık kullanılmıyor; güncel durum bu belge ve
[SESSION_STATUS.md](SESSION_STATUS.md) içindedir.

## Devir anındaki Git durumu

- 15 Kasım'da paralel yapı (altı backend izi A-F, beş arayüz izi) ayrı dallarda
  yürüdü ve `main`'e merge edildi. Bu belge yazılırken `main` ucu `a561bde`
  ("Merge HUD mission-screen design").
- Commit yazarlığı ekip kararıyla Halil Erdem Yanık / `zynordev` olarak durur;
  geçmişin yeniden yazılması **planlandı, yapılmadı**. Yeniden yazım yapılırsa
  commit kimlikleri değişir ve bu belgedeki kimlikler eskir.
- Proje klasöründeki `.claude/` dizini alt ajanların worktree'lerini barındırır;
  commit'lenmez ve temizlenebilir.
- `infra/mvp-exit` uzak dalı ve yerel `../spaceapp-logar-infra` worktree'si hâlâ
  duruyor (14 Kasım'daki PR #1 merge edilmeden kapatılmıştı); silinmeleri
  `piebio`'nun kararıdır.
- Son commit için CI sonucu bu belgede doğrulanmadı; push sonrası GitHub'da
  `test`, `test-postgres` ve `frontend` işlerine bakın.

## İlk yapılacak Git işlemi

Devralan kişi önce yazma sırasını alır (`MAIN BENDE`), sonra:

```bash
git status --short
git switch main
git fetch origin
git pull --ff-only origin main
uv sync --locked
uv run alembic upgrade head
uv run pytest
```

Push öncesi tekrar `git fetch origin` yapılır ve ayrışma kontrol edilir:

```bash
git rev-list --left-right --count HEAD...origin/main
```

Sağdaki sayı 0 değilse push yapılmaz. Ekip bilgilendirilir ve
[GIT_WORKFLOW.md](GIT_WORKFLOW.md)'deki ayrışma adımı uygulanır:
`git rebase origin/main`, `uv run pytest`, sonra push. Çakışmada emin
olunamazsa `git rebase --abort`. **Force-push yapılmaz.**

Ekip aynı `main` dalını kullandığı için [Git çalışma düzenindeki](GIT_WORKFLOW.md)
`MAIN BENDE` / `MAIN SERBEST` sırası zorunludur:

```text
MAIN BENDE — <işin kısa adı> — <dokunulacak ana dosyalar>
MAIN SERBEST — <commit kimliği> — <test sonucu> — <açık not>
```

## Çalıştırma

```bash
uv run uvicorn spaceapp_logar.main:app --reload
```

- Panel: `http://127.0.0.1:8000/` (`/ui/`'ye yönlendirir). Önce arayüzü derleyin:
  `cd frontend && npm ci && npm run build` (Node 22+). FastAPI `frontend/dist`
  klasörünü sunar (`dashboard.py`, `SPACEAPP_UI_DIST`); derleme yoksa `/ui/` nasıl
  derleneceğini söyleyen yerleşik bir sayfa döner. Geliştirme: `npm run dev`
  (`http://localhost:5173/ui/`, `/v1` ve `/health` arka uca yönlenir;
  `VITE_BACKEND`, `VITE_PORT`).
- API dokümantasyonu: `http://127.0.0.1:8000/docs`
- `GET /health`: servis durumu + `schema` alanı (`current` / `outdated` /
  `unknown`). Veritabanı revizyonu kodun head'iyle eşleşmezse (genellikle şema
  geride olduğunda) veritabanı kullanan uçlar 503 `SCHEMA_OUTDATED` döner ve
  mesaj `uv run alembic upgrade head` komutunu söyler. `/health` 200 dönmeye
  devam eder ve durumu `schema` alanında bildirir.
- Geliştirme veritabanı `./spaceapp-logar.db` (gitignore'da).

Ortam değişkenleri (kaynak koddan doğrulandı):

| Değişken | Varsayılan | Etki |
|---|---|---|
| `SPACEAPP_DATABASE_URL`, sonra `DATABASE_URL` | `sqlite:///./spaceapp-logar.db` | `postgres://` ve `postgresql://` önekleri `postgresql+psycopg://`'a çevrilir |
| `SPACEAPP_CORS_ORIGINS` | localhost/127.0.0.1 üzerinde 5173 ve 3000 | Virgülle ayrılmış origin listesi |
| `SPACEAPP_AUTH_REQUIRED` | `false` | `1`/`true`/`yes` ile açılır |
| `SPACEAPP_AUTH_SECRET` | yok | Token imzalama anahtarı; senkron paketlerini de imzalar; yoksa `POST /v1/auth/token` 503 döner |
| `SPACEAPP_AUTH_USERS` | yok | `id:ROL:passcode` girdileri, virgülle ayrılmış; parolalar yalnız ortamda tutulur, repoya yazılmaz |
| `SPACEAPP_UI_DIST` | `frontend/dist` | Arayüz derlemesinin klasörü |
| `SPACEAPP_LINK_DELAY_SECONDS` | yok | Yer bağlantısı gecikmesi (saniye); `GET /v1/sync/status` döner |
| `SPACEAPP_ALEMBIC_INI` | repo kökündeki `alembic.ini` | Şema kontrolünün kod head'ini okuduğu dosya |
| `TEST_DATABASE_URL` | yok | Testleri PostgreSQL'e karşı koşturur |
| `PORT` | `8000` | Yalnız Docker imajı: uvicorn portu (`Dockerfile` CMD) |

## Çalışan backend kapsamı

Bugün eklenenler dahil, ana başlıklar (ayrıntı için
[API ve veri modeli](API_DATA_MODEL.md), [alarm kuralları](ALARM_RULES.md),
[DEMO kuralları](DEMO_RULES.md)):

- **CO2:** son 60 dakikalık pencere, veri yeterliliği/boşluk/kalite bayrakları;
  onaylı `ENV_CO2_WATCH_CARD_V1` ve `piebio` onaylı V2 kartı. Biyoloji
  rehberindeki CO2 senaryoları kural ve API seviyesinde test edilir.
- **Çok metrikli kural motoru:** 12 metrik (kalp hızı, HRV_RMSSD [yalnız veri], SpO2, solunum, vücut
  sıcaklığı, sistolik/diyastolik tansiyon, uyku, kabin CO2/O2/basınç, radyasyon
  doz hızı). Genel ölçüm ucu `POST /v1/measurements`; eski
  `POST /v1/observations` (yalnız CO2) geriye uyumluluk için durur.
- **DEMO vital kurallar:** `VITAL_SPO2_SUSTAINED_V1`, `VITAL_TEMP_TREND_V1`,
  `MULTI_CARDIO_RESP_V1` (dinlenme kalp + solunum + belirti), `DATA_HR_JUMP_V1`
  (kalp hızı sensör kalitesi).
- **Kapsam genişletmesi (DEMO):** kabin O2 kısmi basıncı, radyasyon + kümülatif
  doz, uyku borcu, hareket hastalığı, görme/SANS. Öznel forma görme, sırt ağrısı
  ve burun tıkanıklığı alanları eklendi.
- **Risk kapsam haritası:** `GET /v1/risk-coverage`: NASA'nın 5 tehlikesi ve
  kesitler arası bir veri güvenilirliği bölümü altında toplam 21 risk. Bunların
  11'i kuralla izleniyor, 4'ünde yalnız veri toplanıyor, 6'sı boşluk.
- **Alarm yaşam döngüsü:** `GET /v1/alerts`, `POST /v1/alerts/{id}/acknowledge`,
  `POST /v1/alerts/{id}/resolve` (yalnız kırmızı bayrak alarmları; diğerleri
  ölçümle kendiliğinden kapanır, elle kapatma 409), `POST /v1/alerts/{id}/steps`
  ("Yaptım" adım kaydı).
- **Kırmızı bayrak:** `GET /v1/red-flags/catalog`, `POST /v1/red-flags`;
  anında CRITICAL, ölçümlerle kapanmaz, yalnız ekip üyesi kapatır.
- **Eylem kartı V2:** her adımın nedeni, yeniden değerlendirme sayacı,
  yükselme/kapanma koşulları, olası açıklamalar, canlı durum bölümü, adım kaydı.
  Kart metni değişince yeni sürüm açılır; V1 eski kayıtlar için katalogda kalır.
- **Periyodik laboratuvar:** `POST /v1/lab-results`,
  `GET /v1/crew/{id}/lab-results`. Gerçek NASA OSDR Inspiration4 verisi
  (OSD-569 CBC, OSD-575 CMP): 252 değer, uçuş öncesi 108 / sonrası 144;
  hemoglobin birimi g/dL olarak doğrulandı ([veri notu](../data/osdr/README.md)).
- **Ortam bağlamı ve kişisel normal:** `/v1/environment-contexts`
  (+ `/current`), `GET /v1/baselines`, `/v1/baseline-profiles`
  (+ `/{id}/activate`, `/{id}/release`). Yeni ortam bağlamı yeni profil başlatır.
- **Toplu ölçüm ve CSV adaptörü:** `POST /v1/measurements/batch`, istek başına
  en fazla 1000 ölçüm (aşılırsa 413), `mode` = `all_or_nothing` (varsayılan) veya
  `partial`. CSV adaptörü: `services/adapters/csv_telemetry.py`.
- **Gözlemlenebilirlik:** `X-Request-ID` başlığı, JSON istek logları ve tutarlı
  hata gövdesi (`observability.py`).
- **İsteğe bağlı token auth + roller:** `POST /v1/auth/token`; roller
  `ASTRONAUT`, `CREW_MEDICAL_OFFICER`, `GROUND`. Bayrak kapalıyken tokensız
  istek anonim demo kullanıcısıyla çalışır; geçersiz token yok sayılır ve
  loglanır. Bayrak açıkken token yoksa veya geçersizse 401. Token 12 saat geçerli,
  HMAC-SHA256 imzalı demo kimlik bilgisidir.
- **Demo:** 9 sentetik senaryo (`GET /v1/demo/scenarios`,
  `POST /v1/demo/scenarios/{id}/run`), OSDR yükleme
  (`POST /v1/demo/osdr-labs/import`). Mevcut veri silinmez.
- **Aktivite bildirimi:** `/v1/activities` (başlat / bitir / güncel);
  `observations.activity_source` (`SENSOR` | `DECLARED`); süre dolunca bağlam
  bilinmiyor (`EXPIRED`); `CrewStatusRead.current_activity`. Migration 0015.
- **Vücut haritası:** `GET /v1/crew/{id}/body-map`, `rules/body_map.py`, 9 sabit
  bölge; kural ve metrik -> bölge tek tablodur (yeni kural eklenince tabloya da
  eklenmeli; test zorlar).
- **Rutinler, periyodik testler, seriler:** `/v1/routines/*`; DEMO aralıklar;
  ilaç hatırlatması yoktur. Migration 0016.
- **Yer ile senkron + otomatik uçuş hekimi eskalasyonu:** `/v1/sync/status|packet|ack|escalations`;
  SHA-256 + isteğe bağlı HMAC; onay için `GROUND` rolü; alarm başına bir
  eskalasyon. Migration 0017.
- **Eğilim ve HRV:** `GET /v1/measurements/trend`; `HRV_RMSSD` yalnız veridir
  (kural/eşik yok).
- **Kimlik uçları:** `GET /v1/auth/config`, `GET /v1/auth/me`.
- **Arayüz (`frontend/`):** Vite + React 19 + TypeScript + React Three Fiber;
  HUD tarzı görev ekranı, 3D vücut haritası (BodyParts3D 4.0, CC BY 4.0; atıf:
  `frontend/public/models/ATTRIBUTION.md`), 2D yedek, giriş penceresi,
  çevrimdışı öncelikli (CDN yok). Eski `src/spaceapp_logar/web/` paneli
  kaldırıldı.
- **Altyapı:** SQLite (WAL, `busy_timeout=30000`) ve PostgreSQL desteği; CORS;
  GitHub Actions CI (`test`, `test-postgres`, `frontend`); çok aşamalı
  `Dockerfile` (Node derlemesi + Python) ve `render.yaml`.

Genel durum kuralı: herhangi bir kural bilinmiyorsa ve hiçbiri NORMAL üstünde
değilse genel durum UNKNOWN'dur (kötü veri ≠ normal sağlık). Sorulmamış veya
isteğe bağlı girdiler "Bilinmiyor" üretmez.

## Veritabanı durumu

On yedi Alembic migration'ı sıralıdır; head `20261115_0017`:

1. `20261114_0001_create_observations.py`
2. `20261114_0002_create_rule_evaluations.py`
3. `20261114_0003_create_subjective_check_ins.py`
4. `20261114_0004_add_action_card_to_rule_evaluations.py`
5. `20261114_0005_create_alert_events.py`
6. `20261114_0006_create_lab_results.py`
7. `20261114_0007_add_activity_state_to_observations.py`
8. `20261114_0008_add_red_flag_reports.py`
9. `20261114_0009_add_action_step_logs.py`
10. `20261114_0010_add_spaceflight_symptoms.py`
11. `20261114_0011_create_environment_contexts.py`
12. `20261114_0012_create_baseline_profiles.py`
13. `20261114_0013_add_baseline_to_rule_evaluations.py`
14. `20261114_0014_widen_rule_evaluation_source.py` — `rule_evaluations.source`
    `VARCHAR(255)` → `TEXT` (PostgreSQL'de 266 karakterlik radyasyon kaynak metni
    için gerekti).
15. `20261115_0015_create_activity_declarations.py` — `activity_declarations` ve
    `observations.activity_source`.
16. `20261115_0016_create_routines.py` — `routine_schedules`,
    `routine_completions`.
17. `20261115_0017_create_ground_sync.py` — `ground_sync_acks`,
    `ground_escalations`.

Yeni migration veri silmemeli; hem SQLite hem PostgreSQL'de çalışmalıdır
(SQLite için `batch_alter_table`). Destrüktif migration için Halil'in açık onayı
gerekir.

## Test durumu

- SQLite (`a561bde`, 15 Kasım): **371 geçti, 2 atlandı** (atlananlar PostgreSQL'e
  özgü 2 test); 373 test toplanıyor.
- PostgreSQL ve CI sonuçları bu commit için bu belgede doğrulanmadı. Önceki
  durum (14 Kasım, `8e3e7a3`): gömülü PostgreSQL'de tüm testler geçmişti.
- Arayüz için ayrı test yoktur; CI `frontend` işi `tsc --noEmit` ve `vite build`
  koşar.
- Hızlı kontrol: `uv run pytest -q tests/test_dashboard.py`.

Makinede PostgreSQL veya Docker yoksa tüm test seti gömülü bir PostgreSQL'e
karşı şöyle koşulur (geçici veritabanı; geliştirme veritabanına dokunmaz):

```bash
uv run --with pgserver python scripts/test_postgres_local.py
```

## Bilinen sınırlamalar

- DEMO eşikler (CO2 dışındaki tümü) uçuş tıbbı doğrulaması bekliyor; kanıt
  sınıfı F.
- Canlı veri sentetiktir; gerçek olan yalnız OSDR Inspiration4 laboratuvar
  değerleridir.
- Token iptali ve yenilemesi yoktur; parolalar ortamda düz metin tutulur
  (üretim kimlik sistemi değildir).
- Rol kuralları yalnız ikidir: kırmızı bayrak kapatma (`CREW_MEDICAL_OFFICER`)
  ve senkron onayı (`GROUND`); yalnız kimliği doğrulanmış çağıranlar için,
  bayrak kapalıyken anonim demo erişimi açık kalır.
- Aktivite bitirme sahiplik denetlemez (başka ekip üyesinin bildirimi
  bitirilebilir).
- Rutin varsayılanlarının tekrar çağrılabilirliği koddadır; veritabanında
  benzersizlik kısıtı yoktur.
- Senkron durumundaki `pending_items` yaklaşıktır (alınma zamanına göre sayılır,
  en fazla 5000 öğe).
- BodyParts3D 4.0'da akciğer parankimi ve iç kulak labirenti etiketi yoktur:
  akciğerler bronş ağacı ve akciğer damarlarıyla, `inner_ear` bölgesi dış kulakla
  gösterilir.
- Makine öğrenmesi, teşhis ve ilaç önerisi yoktur; HRV için eşik yoktur.
- Render'da hangi veritabanının kullanılacağına karar verilmedi; `render.yaml`
  yalnız web servisini tanımlar, veritabanı eklenmedi.
- Belirtiye dayalı kurallar (hareket hastalığı, görme) en fazla İzle seviyesine
  çıkar.
- `AGENTS.md` var olmayan `/home/kuzey/RULES.md` dosyasına işaret eder ve eski
  test sayısı gibi eskimiş bilgi içerir. Kuzey'in dosyasıdır; dokunulmadı.

## Devralan geliştirici için önerilen sonraki adımlar

1. Push edilmemiş commit varsa push etmek (fetch + ayrışma kontrolüyle) ve son
   commit'te `test`, `test-postgres` ve `frontend` CI işlerinin yeşil olduğunu
   doğrulamak.
2. Commit yazarlığı geçmişinin yeniden yazılması (ekip kararı, planlandı):
   yapılacaksa tüm ekibe duyurulur, herkes yeniden klonlar.
3. Arayüzü gerçek tarayıcıda gözden geçirmek: `models/body.glb` ve
   `ATTRIBUTION.md` ile 3D vücut, WebGL olmayan ortamda 2D yedek, giriş penceresi
   (`SPACEAPP_AUTH_REQUIRED=true` ile).
4. Aktivite bitirmeye sahiplik denetimi; rutin varsayılanları için benzersizlik
   kısıtı (yeni migration).
5. Render veritabanı kararı (SQLite diskte mi, yönetilen PostgreSQL mi) ve buna
   göre `render.yaml`; canlı dağıtım yapılırsa gerçek adresi `SUBMISSION.md`'ye
   ekleme.
6. `infra/mvp-exit` uzak dalının, `spaceapp-logar-infra` worktree'sinin ve
   `.claude/` altındaki alt ajan worktree'lerinin temizlenmesi.
7. Sunum ve 30 saniyelik video provası ([teslim paketi](SUBMISSION.md)); video
   senaryosu yeni React arayüzüne göre güncellendi, ekran adları değişmiş olabilir.
8. Uzun vadede: DEMO eşiklerin uçuş tıbbı uzmanınca doğrulanması; HRV için
   doğrulanmış bir eşik bulunmadan kural eklenmemesi.

## Değiştirilemeyecek ürün sınırları

- Sistem teşhis veya tedavi üreten bir yapay zekâ olarak sunulmaz; açıklanabilir
  karar-destek aracıdır. Teşhis, ilaç veya doz önerilmez.
- Yeni eşikler DEMO / kanıt sınıfı F olarak etiketlenir.
- CO2 `WATCH`, görev-özel `CRITICAL` eşiği değildir.
- Sentetik, OSDR ve diğer kaynak türleri açıkça etiketlenir.
- Yeni tıbbi eşik, teşhis iddiası veya eylem kartı metni kullanıcı onayı
  gerektirir; kart metni değişirse yeni sürüm açılır.
- Auth bayrağı varsayılan olarak kapalı kalır.
- Yapay zekâ ajanları açık talep olmadan push veya deploy yapmaz.

## Başlıca kaynak dosyalar

- Oturum günlüğü: [SESSION_STATUS.md](SESSION_STATUS.md)
- API ve uygulama durumu: [API_DATA_MODEL.md](API_DATA_MODEL.md)
- Kural sınırları: [ALARM_RULES.md](ALARM_RULES.md),
  [DEMO_RULES.md](DEMO_RULES.md)
- Onaylı CO2 kartı: [CO2_ACTION_CARD_PROPOSAL.md](CO2_ACTION_CARD_PROPOSAL.md)
- Biyoloji karar rehberi: [biyo.md](biyo.md)
- Araştırma aşamaları: [RESEARCH_PLAN.md](RESEARCH_PLAN.md)
- Git düzeni: [GIT_WORKFLOW.md](GIT_WORKFLOW.md)
- Paralel yapı sözleşmesi (tarihsel; kod esastır): [CONTRACT_PARALLEL_BUILD.md](CONTRACT_PARALLEL_BUILD.md)
- Teslim paketi: [SUBMISSION.md](SUBMISSION.md)
