# Backend Devir Notu

Son güncelleme: 14 Kasım 2026 (teslim: 15 Kasım 2026, NASA Space Apps)

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
| Halil Erdem Yanık | Backend; [ortak iş panosunun](WORK_BOARD.md) koordinatörü |
| Hakan | Frontend; kendi arayüzünü tasarlıyor (şu an auth header göndermiyor) |
| Kuzey | Antigravity aracıyla CI, `Dockerfile`, `render.yaml` ve `SUBMISSION.md`'yi hazırladı; şimdilik bu işten çekildi |

## Devir anındaki Git durumu

- Herkes aynı `main` dalında çalışır.
- `8e3e7a3` (isteğe bağlı token auth + roller) ve belge commit'leri (`aa52bea`,
  `9a92a07`) `origin/main`'e push edildi; bu belge güncellenirken
  `HEAD` = `origin/main` = `9a92a07`. Sonraki belge commit'leri bunun üstüne gelir.
- CI: `aa52bea` için `test` ve `test-postgres` yeşil; `9a92a07` için de CI yeşil.
- Proje klasöründeki `.claude/` dizini alt ajanların worktree'lerini barındırır
  (`worktree-agent-ad4cee321b7ed7d95`: toplu ölçüm/CSV ve log/hata gövdesi;
  `worktree-agent-af568f6b7abd41ec4`: auth). İkisinin işi de `main`'e alındı;
  dizin commit'lenmez ve temizlenebilir.
- Paralel bir fork oturumunun açtığı PR #1 (`infra/mvp-exit`) 14 Kasım'da merge
  edilmeden kapatıldı; işleri ana oturumda `main`'e alındı. Uzak `infra/mvp-exit`
  dalı ve yerel `../spaceapp-logar-infra` worktree'si hâlâ duruyor; silinmeleri
  `piebio`'nun kararıdır.

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

- Panel: `http://127.0.0.1:8000/` (`/ui/`'ye yönlendirir; vanilla JS, çevrimdışı,
  CDN veya build adımı yok).
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
| `SPACEAPP_AUTH_SECRET` | yok | Token imzalama anahtarı; yoksa `POST /v1/auth/token` 503 döner |
| `SPACEAPP_AUTH_USERS` | yok | `id:ROL:passcode` girdileri, virgülle ayrılmış; parolalar yalnız ortamda tutulur, repoya yazılmaz |
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
- **Çok metrikli kural motoru:** 11 metrik (kalp hızı, SpO2, solunum, vücut
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
- **Panel:** çevrimdışı izleme paneli; risk kapsamı, kişisel normal durumu,
  eylem kartı V2 ve kırmızı bayrak akışı dahil.
- **Altyapı:** SQLite (WAL, `busy_timeout=30000`) ve PostgreSQL desteği; CORS;
  GitHub Actions CI (`test` + `test-postgres`); `Dockerfile` ve `render.yaml`.

Genel durum kuralı: herhangi bir kural bilinmiyorsa ve hiçbiri NORMAL üstünde
değilse genel durum UNKNOWN'dur (kötü veri ≠ normal sağlık). Sorulmamış veya
isteğe bağlı girdiler "Bilinmiyor" üretmez.

## Veritabanı durumu

On dört Alembic migration'ı sıralıdır; head `20261114_0014`:

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
    `VARCHAR(255)` → `TEXT`. Radyasyon kuralının kaynak metni 266 karakterdir;
    PostgreSQL bu yüzden tüm demo senaryolarında hata veriyordu, SQLite
    uzunluğu zorlamadığı için fark edilmemişti.

Yeni migration veri silmemeli; hem SQLite hem PostgreSQL'de çalışmalıdır
(SQLite için `batch_alter_table`). Destrüktif migration için Halil'in açık onayı
gerekir.

## Test durumu

`8e3e7a3` commit'inde:

- SQLite: **317 geçti, 2 atlandı** (atlananlar PostgreSQL'e özgü 2 test).
- Gömülü PostgreSQL 16.2 (`pgserver`): **319 geçti**.
- CI'da `aa52bea` (auth kodunu ve 319 testi içerir) için `test` ve
  `test-postgres` yeşil.

Makinede PostgreSQL veya Docker yoksa tüm test seti gömülü bir PostgreSQL'e
karşı şöyle koşulur (betik geçici bir veritabanı başlatır, `TEST_DATABASE_URL`
ile pytest çalıştırır, sonra sunucuyu durdurur; geliştirme veritabanına
dokunmaz):

```bash
uv run --with pgserver python scripts/test_postgres_local.py
```

## Bilinen sınırlamalar

- DEMO eşikler (CO2 dışındaki tümü) uçuş tıbbı doğrulaması bekliyor; kanıt
  sınıfı F.
- Canlı veri sentetiktir; gerçek olan yalnız OSDR Inspiration4 laboratuvar
  değerleridir.
- Panelde giriş akışı yoktur: `SPACEAPP_AUTH_REQUIRED` açılırsa panel ve
  Hakan'ın frontend'i (auth header göndermiyor) çalışmaz.
- Token iptali ve yenilemesi yoktur; parolalar ortamda düz metin tutulur
  (üretim kimlik sistemi değildir).
- Rol kuralı yalnız kırmızı bayrak alarmını kapatmada uygulanır
  (`CREW_MEDICAL_OFFICER`, yalnız kimliği doğrulanmış çağıranlar için;
  bayrak kapalıyken anonim demo erişimi açık kalır).
- Render'da hangi veritabanının kullanılacağına karar verilmedi; `render.yaml`
  yalnız web servisini tanımlar, veritabanı eklenmedi.
- Belirtiye dayalı kurallar (hareket hastalığı, görme) en fazla İzle seviyesine
  çıkar.
- `AGENTS.md` var olmayan `/home/kuzey/RULES.md` dosyasına işaret eder ve
  "195 test" gibi eski bilgi içerir. Kuzey'in dosyasıdır; dokunulmadı.

## Devralan geliştirici için önerilen sonraki adımlar

1. Push edilmemiş commit kaldıysa push etmek (sıra alınarak, fetch + ayrışma
   kontrolüyle) ve son commit'te iki CI işinin yeşil olduğunu doğrulamak.
2. `infra/mvp-exit` uzak dalının ve `spaceapp-logar-infra` worktree'sinin
   temizlenmesi (`piebio` kararı).
3. [WORK_BOARD.md](WORK_BOARD.md)'ye bugünkü işler için satır eklemek — önce
   `piebio`'ya sorulur; pano koordinatörü Halil'dir.
4. Hakan'ın frontend'i ile entegrasyon (uç sözleşmeleri, CORS origin'i, ileride
   auth header).
5. Render veritabanı kararı (SQLite diskte mi, yönetilen PostgreSQL mi) ve buna
   göre `render.yaml`.
6. Panele giriş akışı; ardından token iptal/yenileme ve rol kurallarının
   genişletilmesi.
7. Aktivite bildirimi fikri ("Egzersize başla/bitir"; süre dolunca bağlam
   bilinmiyor olur) konuşuldu, uygulanmadı.
8. `.claude/` altındaki alt ajan worktree'lerinin temizlenmesi.
9. Sunum ve 30 saniyelik video provası ([teslim paketi](SUBMISSION.md)).
10. Uzun vadede: DEMO eşiklerin uçuş tıbbı uzmanınca doğrulanması.

## Değiştirilemeyecek ürün sınırları

- Sistem teşhis veya tedavi üreten bir yapay zekâ olarak sunulmaz; açıklanabilir
  karar-destek aracıdır. Teşhis, ilaç veya doz önerilmez.
- Yeni eşikler DEMO / kanıt sınıfı F olarak etiketlenir.
- CO2 `WATCH`, görev-özel `CRITICAL` eşiği değildir.
- Sentetik, OSDR ve diğer kaynak türleri açıkça etiketlenir.
- Yeni tıbbi eşik, teşhis iddiası veya eylem kartı metni kullanıcı onayı
  gerektirir; kart metni değişirse yeni sürüm açılır.
- Auth bayrağı varsayılan olarak kapalı kalır.
- Push yalnız `MAIN BENDE` sırasıyla yapılır; yapay zekâ ajanları açık talep
  olmadan push veya deploy yapmaz.

## Başlıca kaynak dosyalar

- Oturum günlüğü: [SESSION_STATUS.md](SESSION_STATUS.md)
- API ve uygulama durumu: [API_DATA_MODEL.md](API_DATA_MODEL.md)
- Kural sınırları: [ALARM_RULES.md](ALARM_RULES.md),
  [DEMO_RULES.md](DEMO_RULES.md)
- Onaylı CO2 kartı: [CO2_ACTION_CARD_PROPOSAL.md](CO2_ACTION_CARD_PROPOSAL.md)
- Biyoloji karar rehberi: [biyo.md](biyo.md)
- Araştırma aşamaları: [RESEARCH_PLAN.md](RESEARCH_PLAN.md)
- Git düzeni: [GIT_WORKFLOW.md](GIT_WORKFLOW.md)
- Aktif görevler: [WORK_BOARD.md](WORK_BOARD.md)
- Teslim paketi: [SUBMISSION.md](SUBMISSION.md)
