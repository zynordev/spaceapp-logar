# MVP Sağlık ve Çevre Göstergeleri — Onay Taslağı

Son güncelleme: 14 Kasım 2026

Durum: **Kullanıcı onayı bekliyor (Onay Kapısı A)**

Bu liste backend veya alarm eşiklerini kesinleştirmez. Amaç, ilk demoda hangi
ölçümlerin toplanacağını ve kullanıcıya gösterileceğini birlikte seçmektir.

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
| 8 | Öznel durum | Kısa manuel kontrol | Baş dönmesi, bulantı, ağrı, yorgunluk ve ruh hali sensörle tam ölçülemez | Challenge tarafından öneriliyor |
| 9 | Kabin CO2 | Çevre telemetrisi | Kapalı ortam tehlikesi ve biliş/solunum bağlamı | OSDR EDA'da çevre verisi bulunuyor |
| 10 | Kabin O2 | Çevre telemetrisi | Hipoksi bağlamı | OSDR EDA'da çevre verisi bulunuyor |
| 11 | Kabin basıncı | Çevre telemetrisi | O2 ölçümünü ve dekompresyon riskini bağlama oturtma | Araç telemetrisi/sentetik demo |
| 12 | Radyasyon doz hızı | Çevre telemetrisi | Görev ortamını ve kümülatif maruziyeti izleme | OSDR RadLab/telemetri kaynakları |

## Periyodik laboratuvar kartı

Bu alanlar 7/24 ana alarm akışına dahil edilmek yerine ayrı bir “periyodik sağlık
kontrolü” kartında gösterilmelidir.

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

## Kullanıcının inceleyeceği noktalar

1. Ana ekranda 12 göstergenin tamamı gerekli mi?
2. Öznel durum tek puan mı olmalı, yoksa yorgunluk/baş dönmesi/ruh hali ayrı mı
   gösterilmeli?
3. Periyodik laboratuvar kartı ilk demoya dahil edilmeli mi?
4. Radyasyon ana sağlık ekranında mı, yalnızca görev/çevre ekranında mı olmalı?

Bu kararlar verilmeden alarm eşikleri veya backend alanları kesinleştirilmeyecektir.
