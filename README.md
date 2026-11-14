# SpaceApp Logar

NASA Space Apps Challenge 2026 için geliştirilen açıklanabilir astronot sağlık
karar-destek aracı.

Projenin amacı astronotun sağlık ve çevre ölçümlerini birlikte izlemek, ölçümün
kişisel ve görev bağlamına göre dikkat gerektirip gerektirmediğini belirlemek ve
doğrulanmış eylem kartları sunmaktır. Sistem tıbbi teşhis koymaz ve serbest metin
tedavi üretmez.

## Backend'i çalıştırma

Gereksinimler: Python 3.12 ve [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn spaceapp_logar.main:app --reload
```

- **Panel:** `http://127.0.0.1:8000/` (yönlendirir: `/ui/`). Çevrimdışı çalışır;
  CDN, harici font veya build adımı yoktur.
- **Etkileşimli API dokümantasyonu:** `http://127.0.0.1:8000/docs`

```bash
curl http://127.0.0.1:8000/health
```

Ayrı bir frontend geliştirme sunucusu kullanılıyorsa CORS varsayılan olarak
`localhost`/`127.0.0.1` üzerindeki 5173 (Vite) ve 3000 portlarına açıktır. Başka
bir adres için: `SPACEAPP_CORS_ORIGINS="http://localhost:4200"` ortam değişkeni.

### Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `SPACEAPP_DATABASE_URL` / `DATABASE_URL` | `sqlite:///./spaceapp-logar.db` | Veritabanı. `postgres://` ve `postgresql://` adresleri otomatik olarak psycopg sürücüsüne çevrilir (Render gibi platformlar `DATABASE_URL` verir). SQLite yerel/demo içindir. |
| `SPACEAPP_CORS_ORIGINS` | 5173 ve 3000 yerel portları | Virgülle ayrılmış izinli adresler. |
| `SPACEAPP_LOG_FORMAT` | `json` | `text` ile düz satır log. Loglar istek/yanıt gövdesi içermez. |
| `SPACEAPP_LOG_LEVEL` | `INFO` | Log seviyesi. |
| `SPACEAPP_SCHEMA_GUARD` | `on` | Şema eskiyse `/v1` uçları 500 yerine açık bir 503 döndürür. |

`/health` her zaman 200 döner; `status` alanı `ok` veya `degraded` olur ve
`database`, `schema_state`, `schema_revision`, `expected_revision` alanlarıyla
neyin eksik olduğunu söyler. `git pull` sonrası `degraded` görürseniz
`uv run alembic upgrade head` çalıştırın. Her yanıtta `X-Request-ID` başlığı
vardır; hata bildirirken bu kimliği paylaşın.

PostgreSQL ile test: `SPACEAPP_TEST_POSTGRES_URL` boş bir test veritabanını
gösterecek şekilde ayarlanırsa `uv run pytest tests/db/test_postgres.py tests/api`
testleri Postgres'e karşı çalışır (veritabanının `public` şeması her testte
silinir). CI bunu ayrı bir işte yapar.

## Demo akışı

Panelin üst şeridinden:

1. **Demo senaryosu çalıştır.** Dört sentetik senaryodan birini, şu an biten bir
   zaman çizelgesiyle yeni bir görev olarak üretir. Hiçbir mevcut veri silinmez.
   - `co2-headache` (akut): kabin CO₂ yükselir, baş ağrısı bildirilir, CO₂ WATCH
     kartı açılır. Arada yapılan egzersiz bağlam sayesinde alarm üretmez.
   - `fever-trend` (saat–gün): sıcaklık, dinlenme kalp ve solunum hızı yükselir;
     öznel yorgunluk girildiğinde seviye ALERT olur.
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
   ([veri notu](data/osdr/README.md)).
3. Panelde öznel durum formunu doldurun, alarmları "Gördüm" ile onaylayın ve
   "Neden bu durum?" panelinden her kararın kural, pencere, eşik ve kaynağını
   gösterin.

Komut satırından aynı işlemler:

```bash
curl -X POST http://127.0.0.1:8000/v1/demo/scenarios/fever-trend/run
```

```bash
uv run python -m spaceapp_logar.services.osdr_import
```

## Kurallar

| Kural | Durum |
|---|---|
| `ENV_CO2_NOMINAL_V1` — kabin CO₂, NASA-STD-3001 nominal sınırı | Onaylı |
| `VITAL_SPO2_SUSTAINED_V1`, `VITAL_TEMP_TREND_V1`, `MULTI_CARDIO_RESP_V1`, `DATA_HR_JUMP_V1` | **DEMO**, uzman doğrulaması bekliyor ([DEMO kuralları](docs/DEMO_RULES.md)) |
| `RED_FLAG_SYMPTOM_V1` — göğüs ağrısı, ciddi nefes darlığı, bayılma vb. bildirilince anında Kritik | **DEMO**; ölçümlerle kapanmaz, ekip üyesi kapatır |
| `ENV_CABIN_ATMOSPHERE_V1`, `ENV_RADIATION_V1`, `BEHAV_SLEEP_V1`, `SENS_MOTION_SICKNESS_V1`, `SANS_VISION_SYMPTOM_V1` | **DEMO** ([kapsam genişletmesi](docs/DEMO_RULES.md)) |

NASA'nın beş tehlikesine göre risk kapsamı: `GET /v1/risk-coverage` ve paneldeki
"Risk kapsamı" bölümü (kural var / sadece veri / boşluk).

11 metrik toplanıp grafiklenir: kalp hızı, SpO₂, solunum, vücut sıcaklığı,
sistolik/diyastolik tansiyon, uyku, kabin CO₂/O₂/basınç ve radyasyon doz hızı.

## API

Ana uçlar: `POST /v1/measurements` (tüm metrikler), `GET /v1/measurements`,
`GET /v1/metrics`, `GET /v1/missions`, `POST /v1/check-ins`,
`POST /v1/lab-results`, `GET /v1/crew/{id}/status`,
`GET /v1/crew/{id}/lab-results`, `GET /v1/alerts`,
`POST /v1/alerts/{id}/acknowledge`, `GET /v1/demo/scenarios`,
`POST /v1/demo/scenarios/{id}/run`, `POST /v1/demo/osdr-labs/import`,
`GET /v1/red-flags/catalog`, `POST /v1/red-flags`,
`POST /v1/alerts/{id}/resolve` (yalnızca kırmızı bayrak alarmları). Eski
`POST /v1/observations` (yalnız CO₂) geriye uyumluluk için durur. Ayrıntı için
[API ve veri modeli](docs/API_DATA_MODEL.md).

Testleri çalıştırmak için:

```bash
uv run pytest
```

## Araştırma

- [Araştırma ve geliştirme planı](docs/RESEARCH_PLAN.md)
- [Challenge ve açık veri ön incelemesi](docs/DATA_AUDIT.md)
- [Birlikte çalışma biçimi ve onay noktaları](docs/COLLABORATION.md)
- [Git ile ortak çalışma düzeni](docs/GIT_WORKFLOW.md)
- [Ortak iş panosu](docs/WORK_BOARD.md)
- [Backend devir notu ve sıradaki işler](docs/HANDOFF.md)
- [MVP gösterge kısa listesi](docs/MVP_INDICATORS.md)
- [Backend teknoloji yığını seçenekleri](docs/BACKEND_STACK_OPTIONS.md)
- [Açıklanabilir alarm kuralları](docs/ALARM_RULES.md)
- [API ve veri modeli](docs/API_DATA_MODEL.md)
- [CO₂ WATCH eylem kartı taslağı](docs/CO2_ACTION_CARD_PROPOSAL.md)
- [DEMO kuralları ve eylem kartları](docs/DEMO_RULES.md)
- [Gerçek OSDR laboratuvar verisi](data/osdr/README.md)

## Temel kaynaklar

- [NASA Space Apps challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=details)
- [NASA Open Science Data Repository](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study)
- [NASA Human Research Program](https://www.nasa.gov/hrp/)
