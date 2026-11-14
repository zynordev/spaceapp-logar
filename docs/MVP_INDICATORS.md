# MVP Sağlık ve Çevre Göstergeleri

Son güncelleme: 14 Kasım 2026

Durum: **Onaylandı (Onay Kapısı A tamamlandı)**

Bu liste backend veya alarm eşiklerini kesinleştirmez. İlk demoda toplanacak ve
kullanıcıya gösterilecek ölçümlerin ürün kapsamını belirler.

## Önerilen 12 temel gösterge

| No | Gösterge | Toplama biçimi | Neden MVP'de? | Açık veri durumu |
|---:|---|---|---|---|
| 1 | Kalp hızı | Sürekli giyilebilir | Kardiyovasküler durum, aktivite ve dinlenme bağlamı | Sürekli açık astronot serisi bulunamadı; sentetik demo |
| 2 | SpO2 | Sürekli/periyodik optik sensör | Hipoksi ve solunum bağlamı | Ölçülebilirliği doğrulandı; sentetik demo |
| 3 | Solunum hızı | Sürekli giyilebilir | Solunum yükü ve aktivite bağlamı | Ölçülebilirliği doğrulandı; sentetik demo |
| 4 | Cilt/vücut sıcaklığı | Sürekli/periyodik | Enfeksiyon, ısı yükü ve sensör tutarlılığı | Ölçülebilirliği doğrulandı; sentetik demo |
| 5 | Tansiyon (sistolik/diyastolik) | Periyodik veya türetilmiş | Kardiyovasküler adaptasyon ve ortostatik bağlam | Ölçülebilirliği doğrulandı; sentetik demo |
| 6 | Aktivite seviyesi | Sürekli ivmeölçer | Kalp/solunum değerlerini doğru bağlamda yorumlama | Ölçülebilirliği doğrulandı; sentetik demo |
| 7 | Uyku süresi/kalitesi | Uyku periyodu | Yorgunluk, sirkadiyen düzen ve performans | NASA ISS wearable araştırmaları var; sentetik demo |
| 8 | Öznel durum | Beş kısa manuel giriş | Baş dönmesi, bulantı, ağrı, yorgunluk ve ruh hali sensörle tam ölçülemez | Challenge tarafından öneriliyor |
| 9 | Kabin CO2 | Çevre telemetrisi | Kapalı ortam tehlikesi ve biliş/solunum bağlamı | OSDR EDA'da çevre verisi bulunuyor |
| 10 | Kabin O2 | Çevre telemetrisi | Hipoksi bağlamı | OSDR EDA'da çevre verisi bulunuyor |
| 11 | Kabin basıncı | Çevre telemetrisi | O2 ölçümünü ve dekompresyon riskini bağlama oturtma | Araç telemetrisi/sentetik demo |
| 12 | Radyasyon doz hızı | Çevre telemetrisi; ana sağlık ekranı | Görev ortamını ve kümülatif maruziyeti izleme | OSDR RadLab/telemetri kaynakları |

Onay kararı: 12 göstergenin tamamı MVP kapsamındadır. Radyasyon doz hızı yalnızca
çevre detayında değil, ana sağlık ekranında da gösterilecektir.

## Öznel durum kontrolü

Astronot tek bir belirsiz “nasılsın?” puanı yerine aşağıdaki beş alanı ayrı ayrı
`0–4` arasında yanıtlar:

| Alan | 0 | 4 |
|---|---|---|
| Yorgunluk | Yok | Çok şiddetli |
| Baş dönmesi | Yok | Çok şiddetli |
| Bulantı | Yok | Çok şiddetli |
| Ağrı | Yok | Çok şiddetli |
| Ruh hali sıkıntısı | Yok/iyi | Çok kötü/yoğun sıkıntı |

Backend, bu beş cevabı ayrı ayrı saklar. Arayüz isterse özet bir “öznel iyilik
durumu” göstergesi türetebilir; ham cevaplar kaybolmaz ve bu özet tek başına
teşhis veya tedavi kararı üretmez.

## Periyodik laboratuvar kartı

Bu alanlar 7/24 ana alarm akışına dahil edilmek yerine ayrı bir “periyodik sağlık
kontrolü” ekranında gösterilecektir. MVP kartı her ölçüm için son değeri, kaynak
referans aralığını, önceki ölçüme göre değişimi, uçuş öncesi kişisel başlangıç
değerine göre değişimi ve örnek tarihini gösterir.

MVP'nin çekirdek laboratuvar alanları şunlardır:

1. Glukoz
2. Sodyum
3. Potasyum
4. Kreatinin
5. Beyaz kan hücresi (WBC)
6. Hemoglobin
7. Trombosit
8. ALT ve AST

ALT ve AST aynı karaciğer kartında iki ayrı ölçüm olarak saklanacaktır. Diğer
OSD-569 ve OSD-575 alanları veri modelinde sonradan genişletilebilir; ilk ekranı
kalabalıklaştırmayacaktır.

| Grup | Önerilen ölçümler | Kaynak |
|---|---|---|
| Kan sayımı | WBC, hemoglobin, hematokrit, trombosit | OSD-569 CBC |
| Elektrolit/metabolizma | Glukoz, sodyum, potasyum, klorür, CO2 | OSD-575 CMP |
| Böbrek | Kreatinin, BUN, BUN/kreatinin oranı | OSD-575 CMP |
| Karaciğer/protein | ALT, AST, bilirubin, albumin, total protein | OSD-575 CMP |

İlk dosya incelemesinde:

- OSD-569 CBC dönüştürülmüş tablosu 28 satır ve 20 ölçüm içeriyor.
- OSD-575 CMP dönüştürülmüş tablosu 28 satır ve 19 ölçüm içeriyor.
- Her iki tabloda da ölçümle birlikte kaynak dosyanın referans alt/üst değerleri
  bulunuyor.
- CBC tablosundaki hemoglobin alanı `hemoglobin_value_percent` olarak
  adlandırılmış. Birim özgün dosya ve metadata ile doğrulanmadan kullanılmayacak.

## Neden omics göstergeleri MVP dışında?

RNA, DNA metilasyonu, proteomik ve bağışıklık panelleri bilimsel olarak değerlidir
ancak gerçek zamanlı karar desteğine doğrudan çevrilmeleri zordur. İlk demoda:

- açıklaması kolay değildir;
- sonuç üretme süreleri 7/24 sensör akışına uymaz;
- küçük örneklem nedeniyle eşik türetmek güvenilir değildir;
- ürün hikâyesini gereksiz yere karmaşıklaştırır.

Bu veriler araştırma ve gelecek sürüm kaynağı olarak korunacaktır.

## Kaynaklar

- [Challenge: Health Monitoring Software](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=details)
- [NASA Wearable Tech for Space Station Research](https://www.nasa.gov/missions/station/iss-research/wearable-tech-for-space-station-research/)
- [NASA Peak Performance in Microgravity — Bio-Monitor](https://www.nasa.gov/missions/station/iss-research/peak-performance-in-microgravity/)
- [NASA Spaceflight and Non-invasive Biosensors](https://ntrs.nasa.gov/api/citations/20240000117/downloads/AI_and_Human_Spaceflight.pdf)
- [NASA-STD-3001 Volume 1](https://www.nasa.gov/reference/nasa-std-3001v1/)
- [NASA Crew Health Records and Trend Analysis](https://www.nasa.gov/reference/7-0-crew-health-records/)
- [OSDR FAQ — EDA and astronaut data access](https://science.nasa.gov/reference/osdr-faq/)
- [NASA OSDR RadLab](https://visualization.osdr.nasa.gov/radlab/gui/overview/)

## Onay kaydı

14 Kasım 2026 tarihinde proje sahibi:

- 12 göstergenin tamamını onayladı;
- öznel durumu beş ayrı kısa giriş olarak onayladı;
- periyodik laboratuvar kartının MVP'ye ayrı ekran olarak eklenmesini onayladı;
- radyasyonun ana sağlık ekranında gösterilmesini istedi.

Sıradaki karar backend teknoloji yığınıdır (Onay Kapısı B). Alarm eşikleri ve API
alanları daha sonraki onay kapılarında kesinleştirilecektir.
