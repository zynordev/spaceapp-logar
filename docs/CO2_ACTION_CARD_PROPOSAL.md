# CO₂ WATCH Eylem Kartı — Onay Taslağı

Son güncelleme: 14 Kasım 2026

Durum: **V1 onaylandı; V2 onaylandı ve etkin (14 Kasım 2026)**

Bu kart yalnızca bir saatlik ortalama kabin `ppCO2` değeri NASA'nın nominal
`3 mmHg` sınırını aştığında gösterilecek `WATCH` kartıdır. Göreve özel `ALERT` veya
`CRITICAL` sınırı değildir; teşhis, ilaç veya doğrudan araç komutu üretmez.

## Astronota gösterilecek kısa metin

Kart kimliği: `ENV_CO2_WATCH_CARD_V1`

Başlık: **Kabin CO₂ değerini kontrol et**

Neden gösteriliyor:

> Son bir saatlik ortalama CO₂ değeri nominal sınırın üzerinde. Ölçümü doğrula ve
> görev prosedürünü kontrol et.

Basit adımlar:

1. **Ölçümü tekrar kontrol et.** Kabin CO₂ göstergesini ve sensör durumunu kontrol
   et. Sensör hatası görünüyorsa bunu kaydet.
2. **Nasıl hissettiğini kaydet.** Özellikle yorgunluk veya ağrı/baş ağrısı varsa
   kısa öznel durum kontrolünü doldur.
3. **Görev prosedürünü aç.** Göreve özel CO₂ havalandırma/giderim prosedürünü aç
   ve prosedürde belirtilen sorumlu ekibe bildir.

Alt not:

> Bu bir WATCH bildirimidir. Yazılım kendi başına havalandırma veya CO₂ giderim
> ekipmanına komut vermez. Göreve özel prosedür önceliklidir.

## Backend'de saklanacak yapı

| Alan | Değer |
|---|---|
| `card_id` | `ENV_CO2_WATCH_CARD_V1` |
| `version` | `1` |
| `attention` | `WATCH` |
| `rule_id` | `ENV_CO2_NOMINAL_V1` |
| `title_key` | `co2_watch.title` |
| `reason_key` | `co2_watch.reason` |
| `step_keys` | `verify_measurement`, `record_check_in`, `open_mission_procedure` |
| `requires_mission_procedure` | `true` |
| `allows_automatic_vehicle_command` | `false` |

Metin anahtarları kullanılarak kart daha sonra Türkçe ve İngilizce sunulabilir.
İlk backend uygulaması kartın sürümünü ve gösterildiği kural değerlendirmesini
kaydedecektir.

## Neden daha güçlü bir talimat vermiyoruz?

NASA-STD-3001, kabin atmosferi güvenli sınır dışına çıktığında ekibin yerel ve
uzak şekilde uyarılmasını ister. Ancak off-nominal CO₂ eşikleri ve uygulanacak
prosedürler görev/program seviyesinde belirlenir.

NASA OCHMO CO₂ teknik özeti, ortalama CO₂ birkaç gün boyunca açıklanamayan biçimde
aşıldığında Flight Control Team'in bozulan CO₂ giderim ekipmanını belirleme,
teşhis/onarım veya ek giderim ekipmanı etkinleştirme gibi düzeltici işlemleri
yönettiğini belirtir. Bir saatlik nominal sınır aşıldığında prototipin astronota
doğrudan cihaz komutu vermesi bu yetki ayrımını ihlal eder.

## Onay kaydı

14 Kasım 2026 tarihinde proje sahibi, bu üç adımlı `WATCH` kartının aynı metin ve
sınırlarla backend'e sürümlü eylem kartı olarak eklenmesini onayladı.

## Uygulama

- Kart sabit ve sürümlü olarak `src/spaceapp_logar/rules/action_cards.py` içinde
  durur; metinler bu belgedeki onaylı metinle aynıdır.
- Kart yalnızca `ENV_CO2_NOMINAL_V1` kuralı `WATCH` ürettiğinde **ve** veri
  kalitesi `VALID` olduğunda seçilir. Yetersiz, şüpheli veya hatalı veride kart
  gösterilmez.
- Gösterilen kartın kimliği ve sürümü, kural değerlendirmesiyle birlikte
  `rule_evaluations.action_card_id` ve `action_card_version` alanlarında saklanır
  (migration `20261114_0004`).
- `POST /v1/observations` cevabında `action_card`, `GET /v1/crew/{id}/status`
  cevabında `co2.action_card` alanı döner; kart yoksa `null`.
- Yalnızca Türkçe metin eklendi (`*_tr` alanları). İngilizce metin ayrıca
  onaylanıp eklenecek.

## Sürüm 2 (`ENV_CO2_WATCH_CARD_V2`)

14 Kasım 2026'da proje sahibi, V1'in fazla genel olduğu geri bildirimiyle
aşağıdaki V2 kartını onayladı. Yeni değerlendirmeler V2'yi gösterir; V1 eski
kayıtlar için katalogda kalır.

**Başlık:** Kabin CO₂ yüksek: hava akışını ve bulunduğun modülü kontrol et

1. **Bulunduğun yerde hava akışını kontrol et:** fan ve menfezlerin önü kapalı
   mı, uyku bölmesinin fanı çalışıyor mu?
   *Neden:* Mikro yerçekiminde sıcak hava yükselmez ve doğal hava dolaşımı olmaz;
   nefesle verilen CO₂ fan olmadan yüz çevresinde birikebilir.
2. **Diğer modüllerin CO₂ değerine bak.** Yalnızca burada yüksekse
   havalandırması iyi bir modüle geç.
   *Neden:* Yerel birikim ile tüm kabinin sorunu farklı müdahale gerektirir.
3. **CO₂ giderim sisteminin durumunu görev prosedürüne göre kontrol et ve yer
   ekibine bildir.**
   *Neden:* Giderim ekipmanını uçuş kontrol ekibi yönetir; yazılım ekipmana komut
   vermez.
4. **Belirtileri kaydet:** baş ağrısı, yorgunluk veya dikkat dağınıklığı.
   *Neden:* CO₂ ile ilişkili belirtiler uzayda daha düşük düzeylerde
   görülebilir; belirtiler etkinin tek göstergesidir.

- **Yeniden değerlendirme:** 30 dakika (panelde geri sayım).
- **Seviye yükselir:** baş ağrısı artarsa, bilinç bulanıklığı veya nefes
  darlığı olursa "Acil belirti bildir"e geçilir.
- **Kapanır:** bir saatlik ortalama 3 mmHg veya altına indiğinde.

Taslakta dördüncü adım "30 dakika sonra yeniden değerlendir" idi. Uygulamada bu
adım kart düzeyinde bir sayaca dönüştürüldü; dördüncü adım olarak V1'deki
belirti kaydı korundu. Kartın üstünde canlı durum bölümü vardır: ölçülen değer,
süre, eğilim, diğer modüllerin CO₂ değeri ve son öznel kayıt.

## Resmî kaynaklar

- [NASA OCHMO Carbon Dioxide Technical Brief](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf)
- [NASA-STD-3001 Volume 2 Revision F](https://www.nasa.gov/wp-content/uploads/2025/05/nasa-std-3001-vol-2.pdf)
- [NASA Carbon Dioxide Risk](https://www.nasa.gov/directorates/esdmd/hhp/carbon-dioxide-risk/)
- [NASA OCHMO Carbon Dioxide overview](https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/)

