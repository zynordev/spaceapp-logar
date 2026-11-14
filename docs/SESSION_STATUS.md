# Kaldığımız yer (oturum durumu)

Bu dosya, bir sonraki çalışma oturumunun (insan ya da yapay zekâ) hiçbir
şeyi yeniden keşfetmeden devam edebilmesi içindir. Ayrıntılı teknik belgeler
için: `docs/HANDOFF.md`, `docs/ALARM_RULES.md`, `docs/DEMO_RULES.md`,
`docs/GIT_WORKFLOW.md`, `docs/WORK_BOARD.md`, `docs/biyo.md`.

> Sistem bir **prototip karar-destek aracıdır; teşhis koymaz.** Yalnız kabin
> CO2 kuralı NASA-STD-3001'e dayanır. Diğer bütün eşikler **DEMO** etiketlidir
> (kanıt sınıfı F) ve uçuş tıbbı doğrulaması bekler.

## 1. Tarih ve özet

- Tarih: 14 Kasım 2026. Teslim (NASA Space Apps): **15 Kasım 2026**.
- Ekip:
  - **piebio**: backend + araştırma (Claude ile çalışıyor).
  - **Halil Erdem Yanık**: backend; `docs/WORK_BOARD.md` koordinatörü.
  - **Hakan**: frontend; kendi arayüzünü tasarlıyor; şu an auth header göndermiyor.
  - **Kuzey**: Antigravity aracıyla CI, Dockerfile, `render.yaml`, `docs/SUBMISSION.md`
    yaptı; şimdilik bu işten çekildi.
- Özet: Tek metrikli CO2 kuralından başlayan backend; bugün sonunda çok metrikli
  kural motoru (11 metrik), alarm yaşam döngüsü, eylem kartı V2, kırmızı bayrak,
  çevrimdışı panel (`/ui/`), gerçek NASA OSDR Inspiration4 lab verisi, ortam
  bağlamı + kişisel normal, şema kontrolü, PostgreSQL desteği, toplu ölçüm + CSV
  adaptörü, JSON log + `X-Request-ID`, isteğe bağlı token auth + roller içeriyor.

## 2. Bugün yapılanlar (kronolojik, `main` sırası, en eskiden en yeniye)

Kaynak: `git log --oneline -n 60`. Hepsi 14 Kasım 2026.

**Başlangıç ve araştırma (zynordev, Halil)**
- `f7a3ad3`, `a3e743b` — ilk commit, README.
- `7837df9` araştırma planı · `1b8c2e2` iş akışı + gösterge taslağı ·
  `bc3dba0` MVP gösterge kapsamı onayı · `7066f41` backend yığın karşılaştırması.

**İlk backend ve CO2 (Halil)**
- `671cc8a` FastAPI iskeleti · `df07609` açıklanabilir alarm kuralları taslağı ·
  `0de9aeb` CO2 WATCH kuralı · `f185f47` API/veri modeli önerisi.
- `fefa64a` CO2 gözlem sözleşmesi · `3b2ce5f` gözlem migration'ı ·
  `24b7f78` gözlemleri API ile kaydetme · `7e5d227` kayan CO2 penceresi ·
  `d0d6d37` kural değerlendirme kanıtı · `a58309c` öznel check-in ·
  `14c60ac` birleşik ekip durumu · `6e9381c` CO2 eylem kartı önerisi ·
  `2bb9587` biyoloji karar rehberi (`docs/biyo.md`).

**CO2 kartı, Git düzeni, yaşam döngüsü**
- `3ebb073` + `f1fc478` — onaylı CO2 WATCH eylem kartı V1 (piebio).
- `b704e59` — biyoloji rehberinden CO2 senaryo testleri.
- `5d2acf7` Git iş akışı · `01aabd8` backend devir notu (Halil).
- `6741e2f` + `1278503` — alarm yaşam döngüsü + periyodik laboratuvar sonuçları.

**Kural motoru, panel, OSDR**
- `233abbc` — çok metrikli kural motoru + demo senaryoları (DEMO vital kurallar:
  SpO2, sıcaklık eğilimi, dinlenme kalp+solunum+belirti, kalp hızı sensör kalitesi).
- `d631f8d` — çevrimdışı panel (`/ui/`, vanilla JS, CDN/derleme yok).
- `c5aa47c` — gerçek OSDR Inspiration4 lab verisi (OSD-569 CBC, OSD-575 CMP;
  252 değer: uçuş öncesi 108 / sonrası 144; hemoglobin birimi g/dL doğrulandı).
- `a06bf1d` — demo kuralları, panel ve OSDR belgeleri.

**CORS, CI, kırmızı bayrak, dağıtım**
- `871caea` — yerel frontend dev sunucuları için CORS (5173 / 3000).
- `00ed0e9` — GitHub Actions CI (Kuzey).
- `9c6c8b5`, `422cb3e`, `5654c35` — kırmızı bayrak: anında CRITICAL; panelden
  bildirme ve elle kapatma; belgeler.
- `3a46915` SQLite WAL + busy_timeout · `9187079` Dockerfile + `render.yaml` ·
  `d1221e7` `docs/SUBMISSION.md` (Kuzey).

**Eylem kartı V2 ve kapsam genişletmesi**
- `e7829b1`, `028834a`, `5d7fbf6` — eylem kartı V2 (adım nedenleri, yeniden
  değerlendirme sayacı, yükselme/kapanma koşulları, olası açıklamalar, canlı
  durum, "Yaptım" adım kaydı); CO2 V2 kartı piebio onaylı.
- `792ecd0`, `9fd1ac0`, `0ec5a42` — kapsam: kabin O2 kısmi basıncı, radyasyon +
  kümülatif doz, uyku borcu, hareket hastalığı, görme/SANS; öznel forma
  görme/sırt ağrısı/burun tıkanıklığı; NASA'nın 5 tehlikesi ve kesitler arası
  bir veri güvenilirliği grubuna göre risk kapsam haritası
  (`rules/risk_coverage.py`; toplam 21 risk = 11 kural, 4 sadece veri, 6
  boşluk); 9 demo senaryosu.
- `a684072` — `SUBMISSION.md`'deki abartılı/yanlış iddialar düzeltildi (piebio onayı).

**Altyapı (MVP çıkışı)**
- `e218f87`, `e8d4d28` — ortam bağlamı + kişisel normal servisi + profil
  sürümleri (migration 0011-0013); panelde kişisel normal durumu.
- `4842661` — çalışma anında eski şema tespiti (eski şemada 503, `/health`
  `schema` alanı).
- `0140bf5` — SQLite yanında PostgreSQL (migration 0014: `rule_evaluations.source`
  TEXT; 266 > 255 uzunluk hatası).
- `68809c6` — `POST /v1/measurements/batch` + CSV telemetri adaptörü
  (`services/adapters/csv_telemetry.py`) — alt ajan, cherry-pick.
- `980c93f` — `X-Request-ID`, JSON istek logları, tutarlı hata gövdeleri — alt
  ajan, cherry-pick. Bu commit'te CI kırmızıydı.
- `2e029f7` — 422 hata gövdesi testi yerel veritabanından bağımsız yapıldı; CI
  tekrar yeşil.
- `8e3e7a3` — isteğe bağlı token auth + roller — alt ajan, cherry-pick.
  **Henüz push edilmedi.**

## 3. Alınan kararlar ve gerekçeleri

- **Yeni eşikler DEMO / kanıt sınıfı F.** Teşhis, ilaç, doz yok. Gerekçe: kanıta
  dayalı tek eşik CO2 (NASA-STD-3001); diğerleri doğrulanmadı.
- **Eylem kartı metni değişirse yeni sürüm.** V1 eski kayıtlar için katalogda
  kalır. Gerekçe: geçmiş alarmlar gösterildikleri metinle izlenebilmeli.
- **Sorulmamış/isteğe bağlı girdiler "Bilinmiyor" üretmez.** Gerekçe: boş
  bırakılan isteğe bağlı alan veri eksikliği değildir.
- **Belirtiye dayalı kurallar (hareket hastalığı, görme) en fazla İzle seviyesi.**
  Gerekçe: öznel girdi tek başına yükseltme kanıtı değildir.
- **Genel durum UNKNOWN:** herhangi bir kural bilinmiyorsa ve hiçbiri NORMAL
  üstünde değilse. Gerekçe: eksik veriyle "her şey normal" denmez.
- **Kırmızı bayrak:** anında CRITICAL; otomatik kapanmaz, elle kapatılır
  (`POST /v1/alerts/{alert_id}/resolve`). Geçerli token'la yapılan çağrıda
  yalnız `CREW_MEDICAL_OFFICER` kapatabilir (değilse 403). Auth kapalıyken
  token'sız ya da geçersiz token'lı çağrı anonim demo olarak açık kalır.
  Ölçüme dayalı alarmlar bu uçtan kapatılamaz (409).
- **Madde 2 (şema kontrolü) ve 3 (PostgreSQL) ana oturumda kaldı** (piebio kararı).
  Paralel fork oturumunun açtığı PR #1 (`infra/mvp-exit`) bunlarla çakışıyordu.
- **Auth bayrağı varsayılan kapalı** (`SPACEAPP_AUTH_REQUIRED`, varsayılan
  `false`). Kapalıyken geçersiz token yok sayılır ve loglanır; açıkken 401.
  Gerekçe: panel ve Hakan'ın frontend'i bugün token göndermiyor.
- **`SUBMISSION.md` iddiaları koda uydurulur**, tersi değil (piebio onayı).

## 4. Şu anki durum

- Branch: `main`. `HEAD` = `8e3e7a3`; `origin/main` = `2e029f7`.
  `git rev-list --left-right --count HEAD...origin/main` → `1 0` (bu dosya
  yazılırken). Push edilmemiş: `8e3e7a3` (auth) + belge commit'i (bu dosya,
  `scripts/test_postgres_local.py` ve çalışma ağacındaki belge değişiklikleri;
  aşağıdaki "Çalışma ağacı" maddesine bak); birlikte push edilecek.
- CI (`.github/workflows/ci.yml`): iki iş — `test` (SQLite) ve `test-postgres`
  (`postgres:16` servisi, `TEST_DATABASE_URL`). `2e029f7` için yeşil; `980c93f`
  için kırmızıydı. `8e3e7a3` CI'da henüz koşmadı (push edilmedi).
- Testler (`8e3e7a3`): 319 test toplanıyor. SQLite: 317 geçti, 2 atlandı
  (`tests/db/test_postgres.py`, yalnız PostgreSQL). Gömülü PostgreSQL 16.2
  (pgserver): 319 geçti.
- Yerel PostgreSQL doğrulaması: makinede PostgreSQL/Docker yok.
  `uv run --with pgserver python scripts/test_postgres_local.py` gömülü
  PostgreSQL başlatıp `TEST_DATABASE_URL` ile tüm seti koşar.
  `scripts/test_postgres_local.py` çalışma ağacında hazır (henüz izlenmiyor) ve
  belge commit'iyle birlikte ekleniyor.
- Yerel sunucu: bir terminal sekmesinde
  `uv run uvicorn spaceapp_logar.main:app --reload` çalışıyor. `/` → `/ui/`
  yönlendirir; API belgeleri `/docs`; sağlık `/health`.
- Veritabanı: varsayılan `sqlite:///./spaceapp-logar.db` (`./spaceapp-logar.db`,
  `.gitignore`'da), migration 0014'te (head). URL sırası:
  `SPACEAPP_DATABASE_URL` → `DATABASE_URL` → varsayılan.
- Ortam değişkenleri (uygulama kodundan): `SPACEAPP_DATABASE_URL`, `DATABASE_URL`,
  `SPACEAPP_CORS_ORIGINS` (varsayılan localhost/127.0.0.1 için 5173 ve 3000),
  `SPACEAPP_AUTH_REQUIRED`, `SPACEAPP_AUTH_SECRET` (yoksa `POST /v1/auth/token`
  503), `SPACEAPP_AUTH_USERS` (`id:ROLE:passcode`, virgülle), `SPACEAPP_ALEMBIC_INI`.
  Roller: `ASTRONAUT`, `CREW_MEDICAL_OFFICER`, `GROUND`. Token ömrü 12 saat.
  Ayrıca testlerde `TEST_DATABASE_URL` (PostgreSQL ile test), Docker'da `PORT`
  (varsayılan 8000).
- Dağıtım: `Dockerfile` CMD = `alembic upgrade head` → OSDR içe aktarma →
  uvicorn (`$PORT`, varsayılan 8000). `render.yaml`: tek web servisi (docker,
  free, frankfurt), yalnız `SPACEAPP_CORS_ORIGINS="*"`; veritabanı tanımı yok.
- Çalışma ağacı (bu dosya yazılırken): `.claude/` (alt ajan worktree'leri,
  commit'lenmez), `scripts/test_postgres_local.py` ve `docs/SESSION_STATUS.md`
  izlenmiyor. Değiştirilmiş (commit'lenmemiş): `docs/SUBMISSION.md` (319 test,
  isteğe bağlı auth, ortam bağlamı + kişisel normal, Render'da DB yok),
  `README.md`, `docs/API_DATA_MODEL.md`, `docs/HANDOFF.md` (belge güncellemesi).
  `.claude/` dışındakiler belge commit'iyle birlikte commit'lenecek.

## 5. Paralel oturumlar / ajanlar ve branch'leri

| Branch | Nerede | İçerik | Durum |
| --- | --- | --- | --- |
| `infra/mvp-exit` | yerel + `origin`; worktree `../spaceapp-logar-infra` | `c7736d9` şema kontrolü + yapılandırılmış log + request id; `c236d6b` PostgreSQL + CI; `f2694ff` source TEXT | Fork oturumu. PR #1 `gh pr list`'te **CLOSED**. İş `main`'de ayrı commit'lerle yapıldı; branch ve worktree hâlâ duruyor. |
| `worktree-agent-ad4cee321b7ed7d95` | `.claude/worktrees/agent-ad4cee321b7ed7d95` | `9e7f254` toplu ölçüm + CSV; `78b9c34` request id/JSON log/hata gövdesi | `main`'e cherry-pick edildi (`68809c6`, `980c93f`). |
| `worktree-agent-af568f6b7abd41ec4` | `.claude/worktrees/agent-af568f6b7abd41ec4` | `a373483` token auth + roller | `main`'e cherry-pick edildi (`8e3e7a3`). |

- `.claude/` commit'lenmez; iki alt ajan worktree'si ve branch'i temizlenebilir.

## 6. Açık işler ve bekleyen kararlar

- **Push:** `8e3e7a3` + belge commit'i (bölüm 4'teki çalışma ağacı değişiklikleri dahil); `GIT_WORKFLOW.md` sırasına göre (MAIN
  BENDE / MAIN SERBEST). — piebio
- **PR #1 / `infra/mvp-exit`:** PR kapalı görünüyor; uzak branch ve
  `../spaceapp-logar-infra` worktree'si silinsin mi? — piebio
- **`docs/WORK_BOARD.md`'ye satır eklemek:** önce piebio'ya sorulacak;
  koordinatör Halil. — piebio / Halil
- **Render'da veritabanı:** karar yok; `render.yaml`'a DB eklenmedi. Free planda
  SQLite dosyası kalıcı olmayabilir (Render belgesinden doğrulanmadı). — ekip
- **Panelde giriş akışı yok:** auth bayrağı açıkken panel çalışmaz. — backend
- **Token iptal/yenileme yok;** rol kuralı yalnız kırmızı bayrak elle kapatmada
  (`require_role` tek kullanım: `api/alerts.py`). — backend
- **DEMO eşikler** uçuş tıbbı doğrulaması bekliyor. — dış uzman
- **Canlı veri sentetik** (demo senaryoları); gerçek veri yalnız OSDR lab. — bilgi
- **Hakan'ın frontend'i ile entegrasyon** (CORS hazır; auth header yok). — Hakan + backend
- **Aktivite bildirimi** ("Egzersize başla/bitir", süre dolunca bilinmiyor):
  konuşuldu, yapılmadı. — piebio
- **`AGENTS.md`:** var olmayan `/home/kuzey/RULES.md`'ye işaret ediyor, "195
  test" gibi eski bilgi içeriyor. Kuzey'in dosyası; dokunulmadı. — Kuzey / ekip
- **Alt ajan worktree'lerinin temizlenmesi.** — piebio
- **Sunum/video provası** (`docs/SUBMISSION.md`). — ekip

## 7. Bilinen riskler ve dikkat edilecekler

- Herkes aynı `main`'de: push öncesi `git fetch` +
  `git rev-list --left-right --count HEAD...origin/main`; **asla force-push**.
- `8e3e7a3` CI'da koşmadı; push sonrası iki CI işini (test, test-postgres) kontrol et.
- Auth açılırsa (`SPACEAPP_AUTH_REQUIRED=true`) panel ve frontend 401 alır.
  Demo/teslimde kapalı tut. Gerçek secret/parola repoya yazılmaz.
- Token'lar demo kimliğidir: iptal yok, yenileme yok, parola özeti yok.
- Yeni migration eklenirse çalışan sunucunun veri uçları eski şemada 503
  (`SCHEMA_OUTDATED`) döner; `/health` 200 ile `schema: outdated` gösterir.
  Önce `uv run alembic upgrade head`.
- Şema/metin uzunlukları PostgreSQL'de katıdır (0014 örneği); yeni alanlarda
  PostgreSQL testini de koş.
- `SUBMISSION.md` ve sunumda: teşhis iddiası yok; yalnız CO2 NASA-STD-3001;
  diğerleri DEMO (kanıt sınıfı F); canlı veri sentetik.
- Commit yazar tarihleri cherry-pick ve rebase yüzünden yer yer sırasız
  görünür (ör. `68809c6`, `980c93f`, `8e3e7a3`, `5d2acf7`, `e7829b1`); sırayı
  `git log` (topolojik) belirler.

## 8. Sonraki oturumda ilk 5 adım

1. `git fetch` + `git status -sb` +
   `git rev-list --left-right --count HEAD...origin/main`; push edilmemiş commit
   kaldıysa MAIN BENDE ile push et, CI'nın iki işinin yeşil olduğunu doğrula.
2. Testleri koş: `uv run pytest` (beklenen 317 geçti / 2 atlandı); PostgreSQL
   için `uv run --with pgserver python scripts/test_postgres_local.py`
   (beklenen 319 geçti).
3. piebio'ya sor: `infra/mvp-exit` branch/worktree silinsin mi, `.claude/`
   worktree'leri temizlensin mi, `WORK_BOARD.md`'ye satır eklensin mi.
4. Hakan ile frontend entegrasyonunu dene (auth kapalı, CORS 5173/3000);
   Render veritabanı kararını ekiple netleştir.
5. Teslim provası: sunucuyu aç, `/ui/`'den demo senaryolarını çalıştır,
   `docs/SUBMISSION.md` iddialarını panel çıktısıyla karşılaştır.
