# Ne gerçek, ne simüle?

Arayüzdeki **"Ne gerçek, ne simüle?"** penceresiyle aynı tablo
(`frontend/src/features/tour/capabilities.ts`; ikisi birlikte güncellenir).

Durumlar: **ÇALIŞIYOR** (kodda var ve kullanılabilir) · **SİMÜLE** (çalışır ama
gerçeğin yerine geçen bir canlandırma / sentetik veri) · **PLANLI** (henüz yok,
yapılması gerekiyor) · **YOK** (yok; bir kısmı bilinçli olarak kapsam dışı).

## Kaynak etiketleri

| Etiket | Anlamı | Nerede |
|---|---|---|
| **GERÇEK** · OSDR / PhysioNet / NASA DONKI | Gerçek kamu verisi; canlı sensör değil | OSDR laboratuvar değerleri, EKG şeridi (PhysioNet MIT-BIH NSR 16265), güneş parçacık olayı zamanlaması (DONKI) |
| **STANDART** · NASA-STD-3001 | Eşik standarttan alınmış | Yalnız kabin CO₂ kuralı (`ENV_CO2_NOMINAL_V1`) ve kartı |
| **DEMO** | Demo eşik, kanıt sınıfı F, uzman doğrulaması bekliyor | Diğer tüm kurallar ve kartlar |
| **SENTETİK** | Demo senaryosunun ürettiği veri | Senaryo görevlerindeki tüm vital ve kabin ölçümleri |
| **ELLE** | Kullanıcının elle girdiği değer | Elle laboratuvar girişi |

Ölçüm serisi uç noktası kaynak türünü taşımadığı için arayüz, görevin
`scenario_id` alanına bakar: senaryo görevi = SENTETİK. Senaryosuz bir görevde
kaynak tahmin edilmez (etiket gösterilmez).

## Yetenekler

| Yetenek | Durum | Açıklama |
|---|---|---|
| Kural motoru ve "Neden?" açıklaması | ÇALIŞIYOR | 11 kural gemide yerel çalışır. Yalnız kabin CO₂ eşiği NASA-STD-3001 kaynaklı (STANDART); diğerleri DEMO (kanıt sınıfı F). |
| Eylem kartları V2 | ÇALIŞIYOR | Önceden yazılmış adımlar, nedenleri, "Yaptım", yeniden değerlendirme sayacı. Teşhis, ilaç veya doz yok. |
| Vital ve kabin ölçümleri | SİMÜLE | Demo senaryoları SENTETİK veri üretir. API ölçüm kabul eder (`POST /v1/measurements`), ama bağlı gerçek sensör yok. |
| Giyilebilir / kabin sensörü sürücüsü | YOK | Cihaz entegrasyonu yok; veri yalnız API ile gelir. |
| EKG şeridi | ÇALIŞIYOR | GERÇEK kayıt: PhysioNet MIT-BIH NSR 16265 tekrar oynatılır. Canlı değil, ritim yorumu yapılmaz, kalp hızı değeri bu kayıttan gelmez. |
| Laboratuvar değerleri | ÇALIŞIYOR | NASA OSDR içe aktarma (GERÇEK, ör. OSD-569) ve elle giriş (ELLE). Referans aralığı kaynağından gelir. |
| Uzay havası (güneş parçacık olayı) | ÇALIŞIYOR | NASA DONKI SEP olay zamanları (Mayıs 2024, depoda paketli dosya; canlı API değil). Doz değerleri SENTETİK. |
| Kırmızı bayrak bildirimi | ÇALIŞIYOR | Belirti bildirimi eşik beklemeden KRİTİK alarm ve acil kart açar. |
| Uçuş cerrahına otomatik yükseltme | ÇALIŞIYOR | Uyarı/Kritik alarm başına bir kez, kendiliğinden oluşur. |
| Yer ekibine paket + onay | ÇALIŞIYOR | Alıcıya göre paket (uçuş cerrahı, yaşam destek, radyasyon, görev kontrol); sha256 özeti, sunucu anahtarı varsa HMAC-SHA256 imza. Şifreleme yok. |
| Dünya bağlantısı ve ışık gecikmesi | SİMÜLE | Gecikme yalnız yer konsolunda (`#/yer`) canlandırılır; gerçek uzay iletişimi / DTN yok. |
| Görev profili (ISS / Ay / Mars) | ÇALIŞIYOR | Tek yön gecikme ve yükseltme sorumlusu sunucudan gelir. Sunucuda uç nokta yoksa seçici devre dışı görünür. |
| Rol tabanlı oturum | ÇALIŞIYOR | İsteğe bağlı imzalı belirteç (Astronot / Ekip sağlık sorumlusu / Yer ekibi). Demo girişi yalnız sunucuda açıkça etkinse görünür. |
| Çevrimdışı çalışma | ÇALIŞIYOR | Gemide yerel sunucu + SQLite; Dünya'ya bağımlı değil. Arayüz bağlantı kesilince son bilinen veriyi etiketleyerek gösterir. |
| 3B vücut haritası | ÇALIŞIYOR | BodyParts3D modeli (CC BY 4.0). Bölge = kural grubu; anatomik bulgu veya teşhis değildir. |
| Trend ve HRV | ÇALIŞIYOR | Saatlik/günlük özet. HRV (RMSSD) yalnız veri: eşik ve kural yok. |
| Rutinler ve aktivite beyanı | ÇALIŞIYOR | Su, egzersiz, uyku penceresi, periyodik testler (DEMO aralıklar). İlaç rutini yok. |
| DEMO eşiklerin uzman doğrulaması | PLANLI | Uçuş tıbbı uzmanı incelemesi bekliyor; o zamana kadar DEMO etiketi kalır. |
| Teşhis, ilaç veya doz önerisi | YOK | Bilinçli olarak kapsam dışı. |
| Araç / ekipman komutu | YOK | Yazılım hiçbir sistemi kendisi çalıştırmaz. |

## Rehberli jüri turu

Üst şeritte iki düğme: **"Senaryoyu oynat: CO₂ + baş ağrısı"** ve **"Kırmızı
bayrak"**. Tur, demo senaryosunu `POST /v1/demo/scenarios/{id}/run` ile yeni bir
görevde çalıştırır, görevi seçer ve gerçek ekranlar üzerinde adım adım ilerler
(→ / ← / Esc, isteğe bağlı otomatik ilerleme, azaltılmış hareket desteği).
Adımlar ve 30 sn'lik video kurgusu: `docs/VIDEO_SCRIPT.md`.
