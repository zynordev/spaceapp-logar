# Kaldığımız yer (oturum durumu)

Bu dosya, bir sonraki çalışma oturumunun (insan ya da yapay zekâ) hiçbir
şeyi yeniden keşfetmeden devam edebilmesi içindir. Ayrıntılı teknik belgeler
için: `docs/HANDOFF.md`, `docs/API_DATA_MODEL.md`, `docs/ALARM_RULES.md`,
`docs/DEMO_RULES.md`, `docs/GIT_WORKFLOW.md`, `docs/biyo.md`.

> Sistem bir **prototip karar-destek aracıdır; teşhis koymaz.** Yalnız kabin
> CO2 kuralı NASA-STD-3001'e dayanır. Diğer bütün eşikler **DEMO** etiketlidir
> (kanıt sınıfı F) ve uçuş tıbbı doğrulaması bekler.

Son güncelleme: 15 Kasım 2026, teslim günü (NASA Space Apps). Bu dosya `main`
ucu `a561bde` anında yazıldı; sonraki commit'ler bunun üstüne gelir.

## 1. Özet

- Ekip: **piebio** (backend + araştırma; Claude ile çalışıyor), **Halil Erdem
  Yanık** (backend, koordinasyon), **Hakan** (frontend), **Kuzey** (Antigravity
  ile CI, Dockerfile, `render.yaml`, `SUBMISSION.md`; şimdilik çekildi).
- 14 Kasım'da backend: 11 metrikli kural motoru, alarm yaşam döngüsü, eylem
  kartı V2, kırmızı bayrak, OSDR lab verisi, ortam bağlamı + kişisel normal,
  PostgreSQL, toplu ölçüm, JSON log, isteğe bağlı token auth + roller, eski
  vanilla JS paneli.
- 15 Kasım'da: altı backend izi (A-F) ve beş arayüz izi paralel yürüdü ve
  `main`'e merge edildi. Sonuç: yeni React arayüzü, vücut haritası, aktivite
  bildirimi, rutinler, yer ile senkron, eğilim ve HRV (aşağıda).

## 2. 15 Kasım'da yapılanlar

Paralel yapının sözleşmesi [CONTRACT_PARALLEL_BUILD.md](CONTRACT_PARALLEL_BUILD.md)
dosyasındaydı; o dosya tarihsel kayıttır, **kod esastır**. Çalışma, ana oturumun
başlattığı yapay zekâ alt ajanlarıyla ayrı dallarda (worktree) yürütüldü ve
`main`'e merge edildi.

**Backend (ayrıntı: [API_DATA_MODEL.md](API_DATA_MODEL.md))**
- A: `GET /v1/auth/config` (token istemez), `GET /v1/auth/me`.
- B: aktivite bildirimleri `/v1/activities` (migration 0015);
  `observations.activity_source` = `SENSOR` | `DECLARED`; süre dolunca bağlam
  bilinmiyor (`EXPIRED`); `CrewStatusRead.current_activity`.
- C: `GET /v1/crew/{id}/body-map`, `rules/body_map.py`, 9 sabit bölge.
- D: rutinler, periyodik testler ve seriler `/v1/routines/*` (migration 0016);
  DEMO aralıklar; ilaç hatırlatması yoktur. Rutin tamamlamada aynı dilime tekrar
  tamamlama seriyi şişirmez, gelecekteki `completed_at` reddedilir.
- E: yer ile senkron ve otomatik uçuş hekimi eskalasyonu `/v1/sync/status|packet|ack|escalations`
  (migration 0017); SHA-256 + isteğe bağlı HMAC-SHA256; onay için `GROUND` rolü;
  `SPACEAPP_LINK_DELAY_SECONDS`; alarm başına bir eskalasyon.
- F: `GET /v1/measurements/trend` (saatlik/günlük sepetler, en fazla 1000) ve
  `HRV_RMSSD` metriği (yalnız veri; kural/eşik yok). Metrik sayısı 12 oldu.

**Arayüz (`frontend/`, sıfırdan)**
- Vite + React 19 + TypeScript + React Three Fiber; HUD tarzı görev ekranı;
  vitals, grafikler, alarmlar, eylem kartı V2, "Neden bu durum?"; girişler
  (öznel durum, aktivite, rutinler, lab, kırmızı bayrak, demo); yer istasyonu
  paneli (senkron, eskalasyon, risk kapsamı); giriş penceresi; çevrimdışı
  öncelikli (CDN yok).
- Gerçekçi 3D vücut haritası: BodyParts3D 4.0 (CC BY 4.0) türevi GLB; atıf
  `frontend/public/models/ATTRIBUTION.md`; GLB yoksa prosedürel gövde, 3D
  çalışmazsa 2D yedek.
- `src/spaceapp_logar/dashboard.py` arayüzü `/ui/` altında `frontend/dist`
  klasöründen sunar (`SPACEAPP_UI_DIST`); derleme yoksa bilgi sayfası. Eski
  `src/spaceapp_logar/web/` paneli kaldırıldı.
- `Dockerfile` çok aşamalı (Node derlemesi + Python); CI'ya `frontend` işi eklendi.

**Belgeler:** README, API/veri modeli, devir notu, bu dosya ve `SUBMISSION.md`
koda göre güncellendi; `WORK_BOARD.md` artık kullanılmıyor.

## 3. Alınan kararlar

- **Commit yazarlığı:** ekip kararıyla commit'ler Halil Erdem Yanık / `zynordev`
  adına durur. Geçmişin yeniden yazılması **planlandı, henüz yapılmadı**;
  yapılırsa commit kimlikleri değişir ve belgelerdeki kimlikler eskir.
- **Kod esastır:** paralel yapı sözleşmesi tarihsel kayıttır; belgeler koda
  uydurulur, tersi değil. `SUBMISSION.md` abartı içermez.
- **Yeni eşikler DEMO / kanıt sınıfı F;** teşhis, ilaç, doz yok. Rutin
  kataloğunda ilaç hatırlatması hiçbir zaman yer almaz.
- **HRV yalnız veridir:** doğrulanmış eşik olmadan kural eklenmez.
- **Eskalasyon kural tabanlıdır:** sabit yönlendirme tablosu; makine öğrenmesi yok.
- **Eylem kartı metni değişirse yeni sürüm;** V1 eski kayıtlar için katalogda kalır.
- **Genel durum UNKNOWN** kuralı: kötü veri normal sağlık sayılmaz. Süresi dolan
  aktivite bildirimi de bağlamı "bilinmiyor" yapar.
- **Kırmızı bayrak** anında CRITICAL; otomatik kapanmaz, elle kapatılır
  (token varsa `CREW_MEDICAL_OFFICER`).
- **Auth bayrağı varsayılan kapalı** (`SPACEAPP_AUTH_REQUIRED`). Arayüzün giriş
  penceresi vardır, ama demo/teslimde kapalı tutulur.
- **3D anatomi:** BodyParts3D 4.0 (CC BY 4.0) kullanılır, atıf zorunludur;
  görselleştirme sınırları dürüstçe belirtilir (aşağıda).
- **Tek arayüz:** eski vanilla JS paneli kaldırıldı, yenisi tek arayüzdür.

## 4. Şu anki durum

- Branch: `main`, ucu `a561bde` ("Merge HUD mission-screen design"). Push durumu
  bu belgede doğrulanmadı: `git status -sb` ve
  `git rev-list --left-right --count HEAD...origin/main` ile bakın.
- Testler (SQLite, `a561bde`): **371 geçti, 2 atlandı** (PostgreSQL'e özgü 2 test);
  373 test toplanıyor. PostgreSQL koşusu ve CI sonucu bu commit için doğrulanmadı.
- CI (`.github/workflows/ci.yml`): `test` (SQLite), `frontend` (Node 22,
  `npm ci` + `npm run build`) ve `test-postgres` (`postgres:16`). Son commit
  için sonuçlar doğrulanmadı.
- Migration head: `20261115_0017` (17 migration).
- Çalıştırma: `uv sync`, `uv run alembic upgrade head`,
  `cd frontend && npm ci && npm run build`, `uv run uvicorn spaceapp_logar.main:app`.
  Geliştirme: `cd frontend && npm run dev` (`VITE_BACKEND`, `VITE_PORT`).
- Ortam değişkenleri: `SPACEAPP_DATABASE_URL`, `DATABASE_URL`,
  `SPACEAPP_CORS_ORIGINS`, `SPACEAPP_AUTH_REQUIRED`, `SPACEAPP_AUTH_SECRET`,
  `SPACEAPP_AUTH_USERS`, `SPACEAPP_ALEMBIC_INI`, `SPACEAPP_UI_DIST`,
  `SPACEAPP_LINK_DELAY_SECONDS`, testlerde `TEST_DATABASE_URL`, Docker'da `PORT`.
- Dağıtım: `Dockerfile` (Node derlemesi, sonra `alembic upgrade head` → OSDR
  içe aktarma → uvicorn) ve `render.yaml` (tek web servisi, veritabanı yok).
  Henüz dağıtılmadı.
- Canlı veri sentetiktir; gerçek olan yalnız OSDR Inspiration4 lab değerleridir
  (252 değer). Makine öğrenmesi yoktur.

## 5. Bilinen sınırlar

- Aktivite bitirme sahiplik denetlemez (başka ekip üyesinin bildirimi bitirilebilir).
- Rutin varsayılanlarının tekrar çağrılabilirliği (idempotency) koddadır;
  veritabanında benzersizlik kısıtı yoktur.
- `GET /v1/sync/status` içindeki bekleyen sayıları yaklaşıktır.
- BodyParts3D 4.0'da akciğer parankimi ve iç kulak labirenti etiketi yoktur:
  akciğerler bronş ağacı ve akciğer damarlarıyla, `inner_ear` bölgesi dış kulakla
  gösterilir.
- DEMO eşikler uçuş tıbbı uzmanınca doğrulanmadı.
- Token'lar demo kimliğidir (iptal, yenileme, parola özeti yok); rol kuralları
  yalnız kırmızı bayrak kapatma ve senkron onayı için vardır.
- Render'da veritabanı kararı yok; ücretsiz planda SQLite dosyası kalıcı değildir.
- `AGENTS.md` var olmayan `/home/kuzey/RULES.md`'ye işaret eder ve eski bilgi
  içerir (Kuzey'in dosyası; dokunulmadı).

## 6. Açık işler

- Son commit'i push etmek ve üç CI işinin yeşil olduğunu doğrulamak.
- Commit yazarlığı geçmişinin yeniden yazılması (planlandı; yapılırsa herkes
  yeniden klonlar, force-push gerekir ve ekibe önceden duyurulur).
- Arayüzü gerçek tarayıcıda gözden geçirmek: 3D vücut (GLB ve atıf dosyası
  yerinde mi), 2D yedek, giriş penceresi.
- Aktivite sahiplik denetimi ve rutin benzersizlik kısıtı (yeni migration).
- Render veritabanı kararı; dağıtım yapılırsa gerçek adresin `SUBMISSION.md`'ye
  eklenmesi.
- `infra/mvp-exit` uzak dalı, `../spaceapp-logar-infra` ve `.claude/` altındaki
  worktree'lerin temizlenmesi (piebio kararı).
- Sunum ve 30 saniyelik video provası; senaryo yeni arayüze göre güncellendi.
- Uzun vadede: DEMO eşiklerin uçuş tıbbı uzmanınca doğrulanması.

## 7. Dikkat edilecekler

- Push öncesi `git fetch` ve ayrışma kontrolü; **force-push yok** (yazarlık
  yeniden yazımı ekip kararıyla ayrıca ele alınır).
- Yeni migration eklenirse çalışan sunucunun veri uçları 503 `SCHEMA_OUTDATED`
  döner; önce `uv run alembic upgrade head`.
- Auth açılırsa arayüz giriş penceresi çıkarır; gerçek secret/parola repoya
  yazılmaz.
- `SUBMISSION.md` ve sunumda: teşhis iddiası yok; yalnız CO2 NASA-STD-3001;
  diğerleri DEMO; canlı veri sentetik; yapay zekâ araçlarının kullanımı
  beyan edilir.

## 8. Sonraki oturumda ilk adımlar

1. `git fetch`, `git status -sb`, ayrışma kontrolü; push edilmemiş commit varsa
   push et ve CI'yı doğrula.
2. `uv run alembic upgrade head`, `uv run pytest` (SQLite'ta 371 geçti / 2
   atlandı bekleniyor), `cd frontend && npm ci && npm run build`.
3. Sunucuyu aç, `/ui/`'den demo senaryolarını çalıştır, `docs/SUBMISSION.md`
   iddialarını ekran çıktısıyla karşılaştır.
4. piebio'ya sor: yazarlık geçmişi yeniden yazımı ne zaman, eski dallar silinsin mi.
