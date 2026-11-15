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

## Kapsam genişletmesi (14 Kasım 2026)

Kurallar NASA'nın beş uzay uçuşu tehlikesine yayıldı. Hangi riskin nasıl
kapsandığı `GET /v1/risk-coverage` ve paneldeki "Risk kapsamı" bölümünde
gösterilir: kural var / sadece veri / boşluk. Harita kural kataloğundan
hesaplanır; var olmayan bir kural kapsanmış gibi gösterilemez.

| Kural | Tehlike | Girdi | Sonuç |
|---|---|---|---|
| `ENV_CABIN_ATMOSPHERE_V1` | Kapalı ortam | Kabin O₂ % × toplam basınç → O₂ kısmi basıncı (15 dk) | <18 kPa İzle, <16 kPa Uyarı |
| `ENV_RADIATION_V1` | Radyasyon | Doz hızı (15 dk) / modülün kendi başlangıcı; kümülatif doz | ≥3× İzle, ≥10× Uyarı |
| `BEHAV_SLEEP_V1` | İzolasyon | Son 3 gecenin uyku süresi + yorgunluk/ruh hali | ort. <6 sa İzle; <5 sa ve belirti ≥3/4 Uyarı |
| `SENS_MOTION_SICKNESS_V1` | Yerçekimi | Bulantı ve baş dönmesi (öznel) | ikisi de ≥2/4 İzle |
| `SANS_VISION_SYMPTOM_V1` | Yerçekimi | Görme değişikliği (öznel) | ≥2/4 İzle |

Notlar:

- **O₂ kısmi basıncı:** Kural oran yerine kısmi basınç kullanır. Böylece toplam
  basıncı farklı habitatlar adil karşılaştırılır. Örneğin ISS benzeri ~101 kPa /
  %21 ile düşük basınçlı keşif atmosferi ~56 kPa / %34 ikisi de "Normal" çıkar
  (testle doğrulanır).
- **Kümülatif doz:** Değerlendirme açıklamasında NASA'nın 600 mSv kariyer sınırı
  bağlamıyla gösterilir; uzun dönem sağlık riski tahmini yapılmaz.
- **Belirtiye dayalı kurallar:** Hareket hastalığı ve görme kuralları yalnızca
  öznel girişe dayanır ve İzle seviyesine kadar çıkabilir. Bu, önceki "öznel
  giriş tek başına alarm üretmez" sınırının bilinçli bir genişletmesidir.
  Uyarı/Kritik seviyesi yine yalnızca ölçüm veya kırmızı bayrakla oluşur.
- **İsteğe bağlı girdiler "Bilinmiyor" üretmez:** Görme sorusu yanıtlanmadıysa
  veya iki geceden az uyku kaydı varsa ilgili kural çalışmaz. Böylece
  sorulmamış bir soru genel durumu "Bilinmiyor"a çekmez.
- Öznel forma isteğe bağlı üç alan eklendi: görme değişikliği, sırt ağrısı,
  burun tıkanıklığı / yüz şişkinliği (migration 0010). Sırt ağrısı ve burun
  tıkanıklığı yalnızca kaydedilir.

## Eylem kartları (sürüm 2)

14 Kasım 2026'da kartlar genel "ölçümü doğrula, bildir" metinlerinden somut ve
açıklamalı bir yapıya geçti. Yeni değerlendirmeler V2 kartlarını gösterir; V1
kartları eski kayıtların açıklanabilmesi için katalogda kalır
(`src/spaceapp_logar/rules/action_cards_v2.py`).

Her V2 kartında şunlar vardır:

- **Somut adımlar ve her adımın tek cümlelik nedeni.** Örneğin CO₂ kartı,
  mikro yerçekiminde doğal hava dolaşımı olmadığı için CO₂'nin yüz çevresinde
  birikebileceğini açıklar.
- **Yeniden değerlendirme süresi** (`reassess_minutes`). Panelde geri sayım
  olarak görünür; tamamlanan her adımla yeniden başlar.
- **Seviyenin ne zaman yükseleceği** (`escalate_if_tr`) ve **alarmın ne zaman
  kapanacağı** (`closes_when_tr`).
- **Olası açıklamalar** (`considerations_tr`): biyo.md bölüm 9'daki "olasılık /
  dışlanmamış alternatif" sınıfı. Teşhis değildir.
- **Kaynaklar** (`references`).

Kartın üstünde canlı **"Şu an ne oluyor?"** bölümü (`situation`) gösterilir. Bu
bölümde yalnızca ölçülmüş veya kaydedilmiş gerçekler yer alır: ölçülen değer ve
sınır, durumun ne kadar süredir devam ettiği, 30 dakikalık eğilim, son öznel
kayıt, CO₂ için diğer modüllerin değeri (yerel birikim mi, kabin geneli mi) ve
tamamlanan adım sayısı.

Astronot her adımı panelde "Yaptım" ile işaretler
(`POST /v1/alerts/{id}/steps`). Kayıt değiştirilemez; aynı adımı tekrar
işaretlemek ilk kaydı korur.

İçerik sınırları değişmedi. Kartlar yalnızca [biyo.md](biyo.md) bölüm 10.2'de
izin verilen ilk adım türlerini içerir: ölçümü doğrulamak, ortamı kontrol etmek,
dinlenmek, belirtileri kaydetmek, görev prosedürünü açmak, ekip sağlık
sorumlusuna veya yer ekibine bildirmek. Hiçbir kart teşhis, ilaç, doz veya
invaziv müdahale içermez. Hiçbir kart araç veya ekipmana komut vermez
(`allows_automatic_vehicle_command=false`). Bu sınırlar testle denetlenir.

| Kart | Durum | Öne çıkan adımlar | Yeniden değerlendirme |
|---|---|---|---|
| `ENV_CO2_WATCH_CARD_V2` | **Onaylı** | Hava akışını kontrol et, modülleri karşılaştır, giderim sistemini kontrol et ve bildir, belirtileri kaydet | 30 dk |
| `VITAL_SPO2_WATCH_CARD_V2` | DEMO | Eli ısıt ve hareketsiz ölç, ikinci cihazla karşılaştır, kabin O₂/basıncına bak | 10 dk |
| `VITAL_SPO2_ALERT_CARD_V2` | DEMO | Dinlen, ikinci cihazla doğrula, ekibe ve kabine bak, bildir | 5 dk |
| `VITAL_TEMP_WATCH_CARD_V2` | DEMO | Sensör temasını doğrula, egzersiz/ortam bağlamını kaydet, dinlen ve sıvı alımını kaydet | 60 dk |
| `VITAL_TEMP_ALERT_CARD_V2` | DEMO | İkinci termometre, belirtiler, görev prosedüründeki enfeksiyon kontrol önlemleri, bildir | 30 dk |
| `MULTI_CARDIO_RESP_WATCH_CARD_V2` | DEMO | 5 dk dinlen ve tekrar ölç, aktivite bağlamını kaydet, SpO₂ ve sıcaklığa bak | 15 dk |
| `MULTI_CARDIO_RESP_ALERT_CARD_V2` | DEMO | Dinlen, tüm vitalleri ölç, kritik görevleri yalnız yapma, bildir | 10 dk |
| `DATA_HR_SENSOR_CHECK_CARD_V2` | DEMO | Sensörü yerleştir, hareketsiz ölç, nabzı elle say, arızayı kaydet | 5 dk |
| `RED_FLAG_EMERGENCY_CARD_V2` | DEMO | İşi bırak ve sabitlen, ekibe sesli haber ver, ekip sağlık sorumlusu ve uçuş hekimiyle iletişime geç, acil prosedürü aç | 5 dk |

## Alarm davranışı

Kartlı WATCH/ALERT sonuçları alarm açar. Aynı görev, hedef ve kural için tek
etkin alarm vardır. Seviye yükselirse (WATCH → ALERT) aynı alarm güncellenir ve
daha önce "görüldü" olarak işaretlenmişse yeniden astronotun onayını bekler.
Ayrıntı: [API_DATA_MODEL.md](API_DATA_MODEL.md).

## Radyasyon senaryosu: gerçek NASA DONKI olay zamanlaması

`radiation-spe` senaryosunun **zamanlaması** gerçek bir olaya dayanır; **doz
değerleri sentetiktir**. Kaynak: NASA DONKI SEP kaydı, Mayıs 2024
(`data/nasa/donki_sep_2024-05.json`, 14 kayıt). Bu dosya yalnızca olay
zamanını ve üst veriyi içerir; akı veya doz değeri yoktur.

Zaman eşlemesi (senaryo 180 dakikadır, gerçek zaman 37,75 kat sıkıştırılır):

| Gerçek olay (GOES-P SEISS) | Gerçek zaman | Senaryo dakikası | Sentetik doz hızı |
|---|---|---|---|
| >10 MeV başlangıcı | 2024-05-10T13:35Z | 100 | 25 → 90 µSv/h yükselişi başlar |
| >100 MeV başlangıcı | 2024-05-11T02:10Z (+755 gerçek dk) | 120 | 90 → 400 µSv/h ikinci basamak başlar |

Eşikler ve kural mantığı (`ENV_RADIATION_V1`) değişmedi. Gösterilen etiket:
"Olay zamanlaması gerçek NASA DONKI kaydından (Mayıs 2024 SEP, GOES >10 MeV
başlangıcı 10 Mayıs 13:35Z); doz değerleri sentetiktir." Etiket senaryo
açıklamasında, çalıştırma özetinde ve `GET /v1/space-weather/events?month=2024-05`
yanıtında bulunur; radyasyon gözlemlerinin `source_id` değeri
`demo-scenario-runner-donki-timing` olur. Teşhis veya yeni tıbbi eşik eklenmemiştir.

## Doğrulama öncesi yapılmaması gerekenler

- Bu eşikleri gerçek görev kuralı olarak sunmak;
- DEMO etiketini arayüzden kaldırmak;
- kartlara teşhis, ilaç veya doz eklemek.
