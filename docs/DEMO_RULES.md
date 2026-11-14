# DEMO Kuralları ve Eylem Kartları

Son güncelleme: 14 Kasım 2026

Durum: **DEMO — uçuş tıbbı uzmanı doğrulaması bekliyor (kanıt sınıfı F)**

Bu belge, hackathon demosu için CO₂ dışındaki göstergelere eklenen kuralları
açıklar. Sayısal eşikler, yaygın kullanılan **Dünya genel klinik referans
noktalarıdır**. Görev, program veya uçuş tıbbı eşiği değildir. Biyoloji karar
rehberindeki ([biyo.md](biyo.md)) kanıt sınıfı F'ye karşılık gelir: "takım
varsayımı veya sentetik demo kuralı; açıkça 'demo' etiketiyle test amaçlı".

API'de bu kurallar `evidence_level: "F"` ve
`validation_status: "DEMO_PENDING_REVIEW"` alanlarıyla döner; panelde DEMO
rozetiyle gösterilir. Onaylı CO₂ kuralı (`ENV_CO2_NOMINAL_V1`) değişmemiştir ve
`APPROVED` olarak kalır.

## Ortak ilkeler

- Kurallar deterministiktir; aynı veri her zaman aynı sonucu verir.
- Pencereler dakika bölmelerine ayrılır. Pencerenin en az %90'ı dolu olmalı ve
  en uzun boşluk pencerenin 1/12'sini (en az 1 dk) aşmamalıdır. Aksi halde sonuç
  `UNKNOWN` olur.
- Kaynağın `VALID` dışı bildirdiği veya fiziksel olarak imkânsız değerler
  (metrik kataloğundaki `plausible_min/max`) kullanılmaz.
- Kötü veri sağlık alarmı üretmez, mevcut bir alarmı da kapatmaz.
- Genel durum: herhangi bir kural değerlendirilemiyorsa ve hiçbir kural NORMAL'in
  üstünde değilse genel durum `NORMAL` değil, `UNKNOWN` gösterilir.
- Kişisel başlangıç (DEMO politikası): görevdeki en erken 60 kullanılabilir
  ölçümün medyanıdır; en az 30 ölçüm gerekir. Yalnızca değerlendirilen pencereden
  önceki veri kullanılır. Gerçek politika (`BASELINE_POLITIKASI`) biyoloji
  ekibinden beklenmektedir.

## Kurallar

| Kural | Girdi ve bağlam | Pencere | Sonuç |
|---|---|---|---|
| `VITAL_SPO2_SUSTAINED_V1` | SpO₂; egzersiz dışı | 10 dk ortalama | `<%95` → WATCH, `<%92` → ALERT |
| `VITAL_TEMP_TREND_V1` | Vücut sıcaklığı | 60 dk ortalama | kişisel başlangıç `+1,0 °C` → WATCH; `≥38,0 °C` → ALERT |
| `MULTI_CARDIO_RESP_V1` | Dinlenme (`REST`) kalp + solunum + son 120 dk öznel kayıt | 15 dk ortalama | kalp ≥ kişisel başlangıç +20 bpm **ve** solunum >20/dk → WATCH; ayrıca yorgunluk/baş dönmesi/bulantı/ağrı ≥2/4 → ALERT |
| `DATA_HR_JUMP_V1` | Ardışık kalp hızı ölçümleri | 2 dk | >40 bpm sıçrama → veri `SUSPECT`, sağlık `UNKNOWN` |

| `RED_FLAG_SYMPTOM_V1` | Astronotun bildirdiği kırmızı bayrak belirtisi | Yok (anında) | Her zaman CRITICAL + acil kart |

### Kırmızı bayrak (`RED_FLAG_SYMPTOM_V1`)

[biyo.md](biyo.md) bölüm 10'daki sınıflara dayanır: göğüs ağrısı/baskı, ciddi
nefes darlığı, bayılma veya bilinç kaybı, yeni bilinç bulanıklığı, yeni nörolojik
belirti, ani ciddi görme değişikliği, durdurulamayan kanama, hızla kötüleşen durum,
birden fazla ekip üyesinde aynı anda belirti.

- `POST /v1/red-flags` ile bildirilir; seçenekler `GET /v1/red-flags/catalog`.
- Hiçbir pencere, ortalama veya sensör doğrulaması beklenmez. Normal sensör
  değerleri ciddi bir olayı (örneğin kalp krizini) dışlamaz.
- Kural teşhis koymaz. Yalnızca acil ilk adım kartını açar.
- Alarm ölçümlerle kendiliğinden kapanmaz. Bir ekip üyesi değerlendirdikten sonra
  `POST /v1/alerts/{id}/resolve` ile kapatır. Kapatan kişi ve zamanı kaydedilir;
  kural durumu NORMAL'e döner. Ölçüm tabanlı alarmlar elle kapatılamaz (409).
- Sistem kalp krizini veya başka bir hastalığı tespit etmez. Bunun için EKG, kan
  testi ve hekim değerlendirmesi gerekir.

Öznel girişler tek başına hiçbir kuralı tetiklemez. Yalnızca
`MULTI_CARDIO_RESP_V1`'de, ölçülen iki sinyal zaten yüksekken seviyeyi WATCH'tan
ALERT'e taşır. Bu, [ALARM_RULES.md](ALARM_RULES.md)'deki aday kuralın
uygulamasıdır.

Tansiyon, uyku, kabin O₂, kabin basıncı ve radyasyon toplanır ve grafikte
gösterilir. Bunlar için kural yoktur; eşikleri biyoloji ekibinden beklenir.

## Eylem kartları

DEMO kartları yalnızca [biyo.md](biyo.md) bölüm 10.2'de izin verilen ilk adım
türlerini içerir: ölçümü tekrarlamak veya doğrulamak, aktiviteyi durdurup
dinlenmek, belirtileri kaydetmek, görev prosedürünü açmak, ekip sağlık
sorumlusuna veya yer ekibine bildirmek. Hiçbir kart teşhis, ilaç, doz veya
invaziv müdahale içermez. Hiçbir kart araç veya ekipmana komut vermez
(`allows_automatic_vehicle_command=false`).

| Kart | Kural ve seviye |
|---|---|
| `VITAL_SPO2_WATCH_CARD_V1` | SpO₂ WATCH: sensör yerleşimini doğrula, belirtileri kaydet, kabin O₂/basıncına bak |
| `VITAL_SPO2_ALERT_CARD_V1` | SpO₂ ALERT: dinlen, ikinci sensörle doğrula, ekip sağlık sorumlusuna bildir |
| `VITAL_TEMP_WATCH_CARD_V1` | Sıcaklık WATCH: sensör temasını doğrula, belirtileri kaydet, 1 saat içinde yeniden ölç |
| `VITAL_TEMP_ALERT_CARD_V1` | Sıcaklık ALERT: ikinci ölçümle doğrula, belirtileri kaydet, bildir |
| `MULTI_CARDIO_RESP_WATCH_CARD_V1` | Dinlen ve tekrar ölç, aktivite bağlamını kaydet, belirtileri kaydet |
| `MULTI_CARDIO_RESP_ALERT_CARD_V1` | Dinlen, tüm vitalleri yeniden ölç, bildir |
| `DATA_HR_SENSOR_CHECK_CARD_V1` | Sensörü yeniden yerleştir, ölçümü tekrarla, arızayı kaydet (sağlık alarmı değil) |
| `RED_FLAG_EMERGENCY_CARD_V1` | İşi durdur ve güvenli pozisyona geç; ekip sağlık sorumlusuna ve yer ekibine hemen bildir, yanında biri kalsın; acil tıbbi prosedürü aç |

## Alarm davranışı

Kartlı WATCH/ALERT sonuçları alarm açar. Aynı görev, hedef ve kural için tek
etkin alarm vardır. Seviye yükselirse (WATCH → ALERT) aynı alarm güncellenir ve
daha önce "görüldü" olarak işaretlenmişse yeniden astronotun onayını bekler.
Ayrıntı: [API_DATA_MODEL.md](API_DATA_MODEL.md).

## Doğrulama öncesi yapılmaması gerekenler

- Bu eşikleri gerçek görev kuralı olarak sunmak;
- DEMO etiketini arayüzden kaldırmak;
- kartlara teşhis, ilaç veya doz eklemek.
