# Araştırma ve Geliştirme Planı

Son güncelleme: 14 Kasım 2026

## Ürün kararı

Bu proje bir **astronot sağlık karar-destek aracıdır**. Sistem:

- sağlık ve çevre ölçümlerini toplar;
- ölçümlerin kalitesini ve tutarlılığını kontrol eder;
- kişisel başlangıç değerini, görev bağlamını ve zaman içindeki değişimi birlikte
  değerlendirir;
- açıklanabilir bir risk durumu üretir;
- yalnızca önceden doğrulanmış eylem kartlarını gösterir.

Sistem teşhis koymaz, doktorun yerini almaz, ilaç veya tedavi uydurmaz. Üretken
AI/LLM, hızlı triyaj AI'sı ve serbest metin tıbbi öneri bu sürümün kapsamından
çıkarılmıştır.

## Tasarım ilkeleri

1. Her alarm hangi ölçüm, kural, zaman penceresi ve bağlam nedeniyle oluştuğunu
   açıklayabilmelidir.
2. Tek bir sabit "normal aralık" yerine kişisel başlangıç değeri, eğilim ve görev
   bağlamı kullanılmalıdır.
3. Sensör arızası ile fizyolojik anormallik birbirinden ayrılmalıdır.
4. Kritik eylemler deterministik, sürümlenmiş ve kaynağı belirtilmiş kurallardan
   gelmelidir.
5. Yazılım çevrimdışı çalışabilmeli; Dünya bağlantısı ek doğrulama kanalı olarak
   görülmelidir.
6. OSDR verisi bilimsel bağlam ve demo doğrulaması için kullanılmalı; küçük insan
   örneklemlerinden teşhis modeli eğitildiği iddia edilmemelidir.

## Ortam modeli

ISS, uzay aracı, Ay ve Mars için birbirinden kopuk sabit tablolar oluşturmak yerine
ortam aşağıdaki bağlam değişkenleriyle tanımlanacaktır:

```text
location: EARTH | ISS | TRANSIT_VEHICLE | LUNAR_HABITAT |
          MARS_HABITAT | EVA
gravity_g
radiation_dose_rate
cabin_co2
cabin_o2
cabin_pressure
temperature
humidity
mission_day
activity_state
sleep_phase
eva_state
communication_delay
```

Bu model aynı konum içindeki egzersiz, uyku, EVA ve görev safhası farklarını da
hesaba katabilir.

## Aşamalar

### 1. Challenge ve kaynak doğrulaması — tamamlandı

Teslimat beklentileri, önerilen sağlık göstergeleri, NASA HRP tehlikeleri ve açık
veri kaynakları doğrulanır.

Çıktı: `docs/DATA_AUDIT.md` içindeki challenge özeti ve kaynak listesi.

### 2. Veri envanteri — devam ediyor

OSDR'deki doğrudan astronot verileri; hücre, organoid ve model organizma
çalışmalarından ayrılır. Her çalışma için katılımcı sayısı, zaman noktaları, ölçüm
türü, dosya biçimi, lisans ve erişim durumu kaydedilir.

Tamamlanma ölçütü:

- MVP için aday çalışmaların dosya düzeyinde doğrulanması;
- doğrudan insan verisi ile deneysel insan hücresi verisinin ayrılması;
- sürekli sensör verisi boşluğunun belgelenmesi.

### 3. MVP sağlık göstergelerinin seçimi — sırada

İlk sürüm için 8–12 gösterge seçilir. Adaylar:

- kalp hızı ve kalp hızı eğilimi;
- SpO2;
- solunum hızı;
- vücut sıcaklığı;
- tansiyon;
- aktivite ve uyku;
- öznel yorgunluk, baş dönmesi ve ruh hali;
- kabin CO2, O2, basınç ve radyasyon;
- periyodik glukoz ve temel metabolik panel değerleri.

Seçim ölçütleri: görevle ilgisi, uzayda ölçülebilirlik, veri bulunabilirliği,
yorumlanabilirlik ve demo uygulanabilirliği.

### 4. Ölçüm sözlüğü ve veri sözleşmesi

Her gösterge için birim, veri tipi, örnekleme sıklığı, beklenen sensör, kalite
bayrakları, kişisel başlangıç penceresi ve eksik veri davranışı tanımlanır.

Çıktı: sürümlenebilir bir ölçüm sözlüğü ve backend olay şeması.

### 5. Tehlike–gösterge–eylem eşlemesi

NASA'nın beş uzay uçuşu tehlikesi sağlık ve çevre göstergeleriyle eşleştirilir.
Her eşlemede kaynak, kanıt seviyesi ve belirsizlik belirtilir.

Örnek:

```text
kapalı ortam -> yüksek CO2 -> baş ağrısı/bilişsel etkilenme riski
değişen yerçekimi -> kalp hızı + tansiyon eğilimi -> ortostatik tolerans takibi
izolasyon -> uyku + ruh hali -> davranışsal sağlık takibi
```

### 6. Deterministik karar motoru ve eylem kartları

Durum makinesi tasarlanır:

```text
NORMAL -> WATCH -> ALERT -> CRITICAL
                 \-> SENSOR_FAULT
```

Kurallar tek ölçümün yanı sıra süre, değişim hızı, diğer göstergeler ve görev
bağlamını kullanır. Eylem kartları kısa, basit, kaynaklı ve önceden yazılmış olur.

### 7. Demo veri akışı ve doğrulama

Gerçek OSDR laboratuvar verisi, sentetik 7/24 sensör akışı ve OSDR çevre
telemetrisi aynı olay modelinde birleştirilir. Normal seyir, sensör arızası, yavaş
kötüleşme ve kritik olay senaryoları test edilir.

## Araştırma soruları

- Uzayda hangi ölçümler gerçekten sürekli, hangileri periyodik alınabilir?
- Hangi referans aralıklar Dünya klinik aralığıdır, hangileri kişisel başlangıç
  değerinden türetilmelidir?
- ISS/araç telemetrisi ile bireysel sağlık zaman serisi nasıl zaman eşleştirilir?
- Ay ve Mars için gerçek insan verisi olmadığında hangi analoglar ve belirsizlik
  etiketleri kullanılmalıdır?
- Bir alarmın astronota, ekip sağlık sorumlusuna veya yer ekibine iletilme koşulu
  nasıl ayrılmalıdır?

## Kapsam dışı

- Otomatik teşhis ve hastalık adı koyma
- Üretken AI ile tedavi/ilaç önerme
- OSDR'nin küçük örneklemlerinden klinik model eğitildiği iddiası
- Ay veya Mars için kanıtsız "normal insan aralığı" üretme
- Doktor onayı olmadan invaziv veya farmakolojik müdahale önerme
