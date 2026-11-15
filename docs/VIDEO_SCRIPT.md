# 30 saniyelik video senaryosu — "Senaryoyu oynat: CO₂ + baş ağrısı"

Bu senaryo, arayüzdeki rehberli jüri turunun (`frontend/src/features/tour/`)
adım adım kaydıdır. Video, üst şeritteki **"Senaryoyu oynat: CO₂ + baş
ağrısı"** düğmesine basılıp **"Otomatik ilerle"** işaretlenerek tek çekimde
kaydedilebilir. Her ekran gerçek arayüzdür; veriler sentetik demo
senaryosundandır (`co2-headache`).

Kayıt ayarı önerisi: 1440×900, görev profili **Mars** (tek yön ≈12,5 dk),
yer konsolunda **60×** hızlandırılmış gösterim (gecikme ekranda ≈12,5 sn).
Sunucuyu `SPACEAPP_AUTH_SECRET` ile başlatın ki paket HMAC ile imzalansın
(yoksa ekranda "İmzasız" yazar). Otomatik uçuş cerrahı bildirimi CO₂
senaryosunda oluşmaz (alarm İzle seviyesinde); o kare için kırmızı bayrak
turunu kullanın.

| Süre | Tur adımı | Ekranda | Altyazı / seslendirme (TR) |
|---|---|---|---|
| **0–4 sn** | 1–2 · `body-cabin`, `body-head` | 3B vücut haritası; önce kabin, sonra baş bölgesi ışıklanır. Değerlerin yanında **SENTETİK** etiketi. | "Kabin CO₂ yükseliyor; astronot baş ağrısı bildiriyor. Sistem iki bulguyu birlikte gösterir." |
| **4–10 sn** | 3 · `action-card` | Eylem kartı V2: adımlar + "Neden", yeniden değerlendirme sayacı, **STANDART · NASA-STD-3001** rozeti. Profil Mars ise "Dünya'nın yanıt süresi ~25 dk → karar gemideki sağlık sorumlusunda" satırı. | "Ne yapmalı, neden? CO₂ eşiği NASA-STD-3001'den. Diğer eşikler DEMO: uzman doğrulaması bekliyor. Karar desteği, teşhis değil." |
| **10–17 sn** | 4–6 · `escalation`, `routing`, `packet` | Yer istasyonu sekmesi: uçuş cerrahı bildirim listesi (bu senaryoda CO₂ alarmı **İzle** seviyesinde kalır, öncelikli bildirim oluşmaz; tur bunu açıkça yazar); CO₂ verisi yaşam destek paketinde; uçuş cerrahı paketi sha256 (+ sunucuda `SPACEAPP_AUTH_SECRET` varsa HMAC-SHA256 imza). | "CO₂ verisi yaşam destek ekibine, sağlık verisi uçuş cerrahına yönlenir. Uyarı/Kritik bir alarm uçuş cerrahına kendiliğinden bildirim üretir. Paket imzalı: bütünlük doğrulaması, şifreleme değil." |
| **17–24 sn** | 7 · `console` | `#/yer` Dünya görev kontrol konsolu: gemi (anlık) / Dünya (gecikmeli) sütunları, sinyal bandında ışık gecikmesi sayacı. | "Dünya aynı olayları ışık gecikmesiyle görür. Bu bir gecikme simülasyonu: gemi beklemeden çalışır." |
| **24–30 sn** | 8–9 · `ack`, `ack-back` | Yer ekibi uçuş cerrahı paketini onaylar (ack); onay sinyal bandında gemiye doğru yol alır. | "Yer onaylar; onay da aynı gecikmeyle gemiye döner. SpaceApp Logar — gemide, açıklanabilir karar desteği." |

## Kırmızı bayrak turu (yedek / ikinci çekim)

Düğme: **"Kırmızı bayrak"** (senaryo `chest-pain-red-flag`).

| Süre | Tur adımı | Ekranda | Altyazı |
|---|---|---|---|
| 0–4 sn | `rf-report` | Gövde bölgesi seçili 3B harita | "Ölçümler normalken göğüs ağrısı bildirimi." |
| 4–10 sn | `rf-critical` | Genel durum: **Kritik** | "Kırmızı bayrak ortalama beklemez: anında Kritik." |
| 10–17 sn | `rf-card` | Acil eylem kartı, görev prosedürü öncelikli | "Teşhis yok, ilaç yok: prosedür ve değerlendirme." |
| 17–24 sn | `rf-escalation` | Uçuş cerrahına KRİTİK bildirim | "Uçuş cerrahına öncelikli bildirim kendiliğinden oluştu." |
| 24–30 sn | `rf-console` | Gecikmeli Dünya konsolu | "Dünya gecikmeyle öğrenir; o sırada karar gemide." |

## Dürüstlük kuralları (altyazıda değiştirilmez)

- "Karar desteği, teşhis değil." Hiçbir karede teşhis, ilaç veya doz yok.
- Veriler **sentetik** (senaryo etiketi ekranda); EKG şeridi **gerçek PhysioNet
  kaydı**, canlı değil.
- Yalnız kabin CO₂ eşiği **NASA-STD-3001**; diğer eşikler **DEMO** (kanıt sınıfı F).
- Işık gecikmesi **simülasyondur**; gerçek uzay iletişimi yoktur.
- Tur, "ack" adımında onay düğmesine **yer ekibi adına** basar; bu bir demo eylemidir.
