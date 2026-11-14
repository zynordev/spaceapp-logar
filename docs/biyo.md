# Astronot Sağlık İzleme Sistemi

## Biyoloji ve Fizyoloji Ekibi İçin Kritik Kararlar ve Tartışma Rehberi

> **Belgenin amacı:** Biyoloji/fizyoloji ekibinin “araştırılabilecek her şeyi” değil,
> ürünün bilimsel doğruluğunu, kapsamını ve algoritmasını gerçekten değiştirecek
> kararları tartışmasını sağlamak.

> **Önemli sınır:** Bu proje bir araştırma ve karar-destek prototipidir. Buradaki
> hiçbir örnek eşik veya eylem, uzman doğrulaması olmadan gerçek uçuş tıbbı kuralı,
> teşhis ya da tedavi talimatı olarak kullanılamaz.

---

## 1. Challenge'ın biyolojik olarak bizden istediği nedir?

Challenge'ın özünde şu zincir vardır:

```text
Uzay uçuşu tehlikesi
        ↓
İnsan vücudu ve zihnindeki biyolojik/fizyolojik etki
        ↓
Ölçülebilir sağlık göstergesi veya bildirilen semptom
        ↓
Normal, dikkat gerektiren veya acil durum ayrımı
        ↓
Astronota anlaşılır ve güvenli yönlendirme
```

Dolayısıyla biyoloji ekibinin görevi bütün hastalıkları öğretmek değildir. Ekibin
görevi şu dört soruya bilimsel ve kaynaklı cevap üretmektir:

1. **Neyi ölçeceğiz?**
2. **Değişimin biyolojik anlamı nedir?**
3. **Hangi bağlam ve bulgularla birlikte önemli hâle gelir?**
4. **Sistem güvenli olarak hangi ilk yönlendirmeyi yapabilir?**

NASA, insanlı uzay uçuşu risklerini uzay radyasyonu, izolasyon ve kapalı kalma,
Dünya'dan uzaklık, değişen yerçekimi alanları ve kapalı/düşmanca ortamlar olmak
üzere beş ana tehlike altında inceler. Bu tehlikeler birbirinden bağımsız değildir;
birbirlerinin insan üzerindeki etkisini artırabilir.

Bu nedenle ürünün temel bilimsel modeli şu olmalıdır:

```text
Tehlike ≠ sağlık problemi ≠ ölçüm ≠ teşhis
```

Örneğin:

```text
Kapalı ortam tehlikesi
→ kabin CO₂ artışı
→ fizyolojik stres olasılığı
→ baş ağrısı + çevresel telemetri
→ dikkat durumu
→ ölçümü doğrulama ve onaylı prosedüre yönlendirme
```

---

## 2. Kanıt seviyeleri: Her OSDR çalışması aynı değerde değildir

OSDR; omics, fizyolojik, davranışsal, biyomedikal, görüntüleme ve çevresel
telemetri verileri içerir. Ancak “Homo sapiens” filtresinde çıkan her çalışma,
gerçek astronotun sürekli sağlık kaydı değildir. İnsan hücresi, organoid, doku
çipi, Dünya analogu ve gerçek astronot verileri aynı aramada bulunabilir.

Biyoloji ekibi her veri veya iddiaya aşağıdaki kanıt sınıfını vermelidir:

| Kod | Kanıt tipi | Üründe izin verilen kullanım |
|---|---|---|
| A | Gerçek astronot/insan, görev sırasında veya görevle ilişkili veri | İnsan eğilimi ve senaryo desteği |
| B | Gerçek insan, yer analogu/bed rest/simülasyon | Destekleyici karşılaştırma |
| C | İnsan hücresi, organoid veya tissue-chip | Mekanizma açıklaması; klinik eşik değil |
| D | Hayvan/model organizma | Hipotez ve mekanizma; insan normali değil |
| E | Uzman görüşü, standart veya operasyonel kılavuz | Kapsamına göre kural/eylem kaynağı |
| F | Takım varsayımı veya sentetik demo kuralı | Açıkça “demo” etiketiyle test amaçlı |

### Kritik karar 2.1 — OSDR'yi ne için kullanıyoruz?

**Seçenek A: Tanı modeli eğitmek**

- Çekici görünür ancak mevcut veri heterojen, küçük örneklemli ve çoğu zaman
  klinik tanı etiketi içermez.
- İnsan, hücre ve hayvan verilerinin yanlış birleştirilmesi riski yüksektir.
- Hackathon için bilimsel olarak savunulması zordur.

**Seçenek B: Kanıt ve mekanizma bilgi tabanı oluşturmak**

- OSDR çalışmaları, uzay koşullarının hangi sistemleri etkileyebileceğini gösterir.
- Derin analiz AI'ı ilgili çalışma ve mekanizmaları kaynak göstererek açıklayabilir.
- Klinik teşhis iddiası daha kontrollü olur.

**Seçenek C: Seçilmiş insan verileriyle örnek eğilimler, OSDR bilgisiyle açıklama**

- Gerçek astronot/insan verisi uygun olduğunda trend gösterilir.
- Canlı demo için kontrollü sentetik zaman serileri kullanılabilir.
- OSDR, mekanizma ve bilimsel bağlam sağlar.

**Önerilen karar:** B + C. OSDR doğrudan “hastalık teşhis eğitim seti” olarak
sunulmamalıdır.

**Biyoloji ekibinin çıktısı:** `OSDR_UYGUNLUK_MATRISI`

| Çalışma | İnsan/organizmа | Gerçek uçuş/analog | Ölçüm | Zaman ölçeği | Kullanım | Kullanılamayacağı alan | Kanıt kodu |
|---|---|---|---|---|---|---|---|

---

## 3. Sistemin kapsayacağı sağlık alanları

Challenge genel sağlık izlemesi ister; yalnızca CO₂ veya tek bir organ sistemiyle
sınırlı değildir. Fakat bütün sağlık problemlerini aynı derinlikte çözmek de
gerçekçi değildir.

### Aday sağlık alanları

| Alan | İzlenebilir göstergeler | Tipik zaman ölçeği | OSDR/HRP bağlantısı |
|---|---|---|---|
| Kardiyovasküler/solunumsal | Nabız, HRV, tansiyon, SpO₂, solunum, aktivite | Saniye–gün | Kardiyovasküler adaptasyon, fitness |
| Çevresel sağlık | CO₂, O₂, basınç, sıcaklık, nem, radyasyon | Saniye–ay | Kapalı ortam, hipoksi, EVA, radyasyon |
| Uyku/biliş/davranış | Uyku, ışık, ruh hâli, yorgunluk, biliş testi | Saat–hafta | Uyku kaybı, sirkadiyen bozulma, davranışsal risk |
| Kas/kemik | Egzersiz, güç, hareket, vücut kompozisyonu | Hafta–ay | Kas atrofisi, kemik kaybı |
| Bağışıklık/enfeksiyon | Sıcaklık, semptom, CBC, sitokin, mikrobiyom | Saat–ay | Değişmiş bağışıklık, viral reaktivasyon |
| Metabolizma/beslenme | Glukoz, sıvı alımı, idrar, elektrolit, beslenme | Saat–hafta | Yetersiz beslenme, dehidrasyon |
| Sensorimotor/vestibüler | Denge, koordinasyon, bulantı, baş dönmesi | Dakika–hafta | Yerçekimi geçişleri, hareket hastalığı |
| Nöro-oküler | Görme şikâyeti, göz görüntüsü, baş ağrısı | Gün–ay | SANS |

### Kritik karar 3.1 — Platform kapsamı ile demo kapsamını ayırıyor muyuz?

**Tartışılması gereken gerçek konu:** Ürün vizyonu geniş olabilir; fakat hangi
alanlarda gerçekten çalışan karar mantığı göstereceğiz?

**Önerilen yaklaşım:**

- Platform veri modeli yukarıdaki alanların tamamını genişleyebilir biçimde destekler.
- Hackathon demosu üç farklı zaman ölçeğini temsil eden en az üç doğrulanmış
  senaryo gösterir:
  1. Akut çevresel olay: CO₂ + baş ağrısı/sersemlik.
  2. Saat–gün ölçeği: sıvı alımı + dinlenme nabzı + yorgunluk/dehidrasyon olasılığı.
  3. Gün–hafta ölçeği: uyku + bilişsel performans + ruh hâli.
- Kas/kemik, bağışıklık, SANS ve radyasyon “bilgi/trend modülü” olarak gösterilebilir;
  ancak karar kuralı doğrulanmamışsa çalışan teşhis gibi sunulmaz.

**Karar ölçütleri:**

- Ölçüm görev ortamında gerçekçi mi?
- Biyolojik ilişki kaynaklandırılabiliyor mu?
- Güvenli ilk eylem tanımlanabiliyor mu?
- Normal, dikkat ve acil örnekleri üretilebiliyor mu?
- Jüriye birkaç dakikada açıklanabiliyor mu?

**Biyoloji ekibinin çıktısı:** En fazla 3–4 adet `SENARYO_KARTI`.

---

## 4. Sürekli izlenebilir veri ile araştırma biyobelirtecini ayırmak

Bu ayrım ürünün en kritik bilimsel kararlarından biridir.

### Sürekli veya sık izlenebilir göstergeler

- Kalp hızı ve bazı giyilebilir cihaz ölçümleri
- Aktivite ve uyku
- Kabin çevre telemetrisi
- Bazı görevlerde SpO₂, solunum veya sıcaklık
- Kısa semptom anketleri

### Periyodik ölçümler

- Tansiyon
- Kuvvet, denge ve biliş testleri
- Kan şekeri
- Ultrason veya göz görüntüleme
- Kan, tükürük, idrar ve dışkı örnekleri

### Araştırma/omics ölçümleri

- RNA/DNA profilleri
- Proteomik
- Metabolomik
- Epigenetik
- Mikrobiyom dizileme
- Sitokin panelleri

### Kritik karar 4.1 — Omics anlık alarm motorunda kullanılacak mı?

Çoğu omics ölçümü gerçek zamanlı değildir ve doğrudan semptom teşhisi vermez.
Bu yüzden:

- Omics verisi hızlı alarm katmanına varsayılan olarak girmemelidir.
- Periyodik laboratuvar/omics verisi, uzun dönem eğilim ve derin analiz katmanında
  kullanılabilir.
- Bir omics bulgusundan doğrudan tedavi veya kritik eşik üretilmemelidir.

**Biyoloji ekibinin çıktısı:** Her gösterge için `ölçüm tipi = continuous / periodic / research`.

---

## 5. “Normal” değer nasıl tanımlanacak?

Tek bir evrensel normal aralık kullanmak yetersizdir. Fakat her ortam için bilimsel
dayanağı olmayan ayrı aralıklar icat etmek de yanlıştır.

### Önerilen üç katman

#### 5.1 Mutlak güvenlik sınırı

Kaynaklandırılmış ve belirli bağlama ait güvenlik sınırlarıdır. Kişisel profil
bu sınırları geçersiz kılamaz.

#### 5.2 Kişisel başlangıç profili

Astronotun görev öncesi ve kararlı dönemlerdeki güvenilir ölçümleridir:

- Dinlenme, uyku ve egzersiz durumları ayrı tutulur.
- Medyan, yüzdelik aralık ve değişim hızı saklanır.
- Hastalık veya sensör hatası dönemi yeni “normal” olarak öğrenilmez.

#### 5.3 Görev bağlamı

- Görev evresi ve görev günü
- Dünya, transit, ISS, Ay/Mars yüzeyi veya EVA
- Aktivite/uyku durumu
- Çevresel koşullar
- Son egzersiz, sıvı/besin alımı ve ilaçlar
- Mikrogravite veya kısmi yerçekimine geçiş dönemi

### Kritik karar 5.1 — Beş ortam için ayrı normal tablolar mı?

**Seçenek A: Her ortam için sabit normal aralık**

- Uygulaması kolaydır.
- Ay ve Mars için yeterli uzun dönem insan verisi yoktur.
- Yanlış bilimsel kesinlik üretir.

**Seçenek B: Dünya normali + ortam katsayısı**

- Basittir ancak tek bir katsayı karmaşık adaptasyonu temsil edemez.

**Seçenek C: Kişisel başlangıç + bağlam profili + kanıt seviyesi**

- Bilimsel belirsizliği korur.
- Daha fazla veri modeli ve açıklama gerektirir.

**Önerilen karar:** C. Ortam “normal değeri değiştiren kesin tablo” değil, ölçümün
yorumlandığı bağlam olmalıdır. Doğrudan insan verisi bulunmayan ortamda model
`tahmini/araştırma` olarak etiketlenmelidir.

### Kritik karar 5.2 — Kişisel profil ne zaman güncellenir?

Karar verilmesi gerekenler:

- Kaç güvenilir ölçüm gerekir?
- Hangi görev dönemleri “kararlı” kabul edilir?
- Semptomlu dönemler profilden çıkarılır mı?
- Yeni yerçekimi ortamına geçişten sonra ayrı profil mi açılır?
- İlaç veya hastalık sonrası profil otomatik mi, uzman onayıyla mı güncellenir?

**Önerilen güvenlik ilkesi:** Sistem kişisel normali kendiliğinden ve sınırsız biçimde
kaydırmamalıdır. Profil güncellemeleri izlenebilir ve geri alınabilir olmalıdır.

**Biyoloji ekibinin çıktısı:** `BASELINE_POLITIKASI`.

---

## 6. Zaman ölçeği: Aynı algoritma her probleme uygulanamaz

### Akut: saniye–dakika

Örnekler:

- Ciddi hayati ölçüm değişimi
- Hipoksi şüphesi
- Kabin çevre olayı
- Ani nörolojik veya solunumsal semptom

İhtiyaç: Kesin ve hızlı kural, veri doğrulama, acil eskalasyon.

### Subakut: saat–gün

Örnekler:

- Dehidrasyon
- Uyku kaybı
- Enfeksiyon/ateş eğilimi
- Yorgunluk ve bilişsel performans düşüşü

İhtiyaç: Zaman serisi, kişisel başlangıç, birden çok göstergenin birleşimi.

### Kronik: hafta–ay

Örnekler:

- Kas ve kemik kaybı
- Bağışıklık değişimi
- SANS
- Radyasyon birikimi

İhtiyaç: Periyodik ölçüm, trend, uzun dönem karşılaştırma ve uzman yorumu.

### Kritik karar 6.1 — Her sağlık alanının değerlendirme penceresi nedir?

Biyoloji ekibi her gösterge/senaryo için şunları belirlemelidir:

- Tek ölçüm anlamlı mı?
- Minimum devam süresi nedir?
- Eğilimin hangi penceresi incelenir?
- Yeniden ölçüm zamanı nedir?
- Hangi değişim hızı önemlidir?

**Biyoloji ekibinin çıktısı:** Her kuralda `duration`, `trend_window` ve
`reassessment_interval` alanları.

---

## 7. Tek değer mi, bulgu kombinasyonu mu?

Birçok fizyolojik değişken özgül değildir. Yüksek nabız tek başına egzersiz, stres,
ateş, dehidrasyon, ilaç, çevresel stres veya sensör hatası anlamına gelebilir.

Bu nedenle model şu yapıda olmalıdır:

```text
Ana gösterge
+ destekleyici ölçüm
+ semptom
+ görev bağlamı
+ süre/eğilim
+ veri kalitesi
= dikkat seviyesi
```

### Kritik karar 7.1 — Minimum kanıt kombinasyonu nedir?

Her senaryo için tartışılmalıdır:

- Hangi tek değer kendi başına alarm üretir?
- Hangi değer ancak semptomla birlikte önemlidir?
- Hangi semptom ölçüm normal olsa da alarm üretir?
- Hangi destekleyici ölçüm olasılıkları ayırır?
- Birden fazla ekip üyesindeki ortak bulgu çevresel olasılığı nasıl değiştirir?

**Biyoloji ekibinin çıktısı:** Kaynaklı `KARAR_MATRISI`.

Örnek şablon:

| Ana bulgu | Destekleyici bulgu | Bağlam | Süre | Veri kalitesi | Dikkat seviyesi | Sonraki ölçüm |
|---|---|---|---|---|---|---|

---

## 8. Veri kalitesi ile sağlık durumunu ayırmak

```text
Kötü veri ≠ normal sağlık
Kötü veri = sağlık durumu hakkında daha fazla belirsizlik
```

İki ayrı durum tutulmalıdır:

```text
data_quality: GOOD / DEGRADED / POOR / MISSING / CONFLICTING
health_attention: NORMAL / WATCH / ATTENTION / URGENT / CRITICAL / UNKNOWN
```

### Kritik karar 8.1 — Şüpheli kritik ölçümde ne yapılacak?

Tartışma seçenekleri:

- Alarmı tamamen bastırmak: Yanlış negatif riski taşır.
- Doğrudan kritik alarm: Alarm yorgunluğu oluşturabilir.
- “Doğrulanmamış potansiyel risk” durumu: Alternatif sensör/manuel ölçüm ister,
  ciddi semptom varsa doğrulamayı beklemeden eskale eder.

**Önerilen karar:** Üçüncü yaklaşım.

Biyoloji ekibi sensör mühendisliği yapmaz; ancak her göstergenin biyolojik olarak
makul aralığını, ölçüm koşullarını ve alternatif doğrulama yöntemini tanımlar.

**Biyoloji ekibinin çıktısı:** `VERI_KALITESI_GEREKSINIMLERI`.

---

## 9. Korelasyon, olası neden ve teşhis ayrımı

OSDR veya zaman serisi iki olayın birlikte değiştiğini gösterebilir. Bu, birinin
diğerinin kesin nedeni olduğunu kanıtlamaz.

Örnek:

```text
CO₂ arttı + baş ağrısı başladı
```

Sistemin söyleyebileceği:

> Zaman ve konum ilişkisi CO₂'yi olası açıklamalardan biri yapıyor.

Sistemin söylememesi gereken:

> Kesin CO₂ zehirlenmesi yaşıyorsun.

### Kritik karar 9.1 — Derin analiz AI'ı hangi dil seviyesini kullanacak?

Çıktılar şu sınıflardan biri olmalıdır:

- **Gözlem:** Ölçülen ve doğrulanan veri.
- **İlişki:** Zaman, konum veya örüntü birlikteliği.
- **Olasılık:** Bulgularla uyumlu olası açıklama.
- **Dışlanmamış alternatif:** Eksik veri nedeniyle elenemeyen neden.
- **Teşhis:** Bu prototipin varsayılan yetkisi dışında.

Her analiz şunları göstermelidir:

- Hangi verilere dayandığı
- Hangi verilerin eksik olduğu
- Alternatif açıklamalar
- Kanıt seviyesi
- Güven değil, belirsizlik ifadesi
- Ne zaman insan uzmanına aktarılacağı

**Biyoloji ekibinin çıktısı:** Her senaryo için `OLASI_NEDENLER` ve
`AYIRT_EDICI_EK_OLCUMLER` listesi.

---

## 10. Kırmızı bayraklar ve tıbbi sınır

Bazı semptomlar, çevresel veya giyilebilir ölçüm normal görünse bile hızlı
eskalasyon gerektirebilir. Bu listenin gerçek kullanımı hekim/uzay tıbbı uzmanı
doğrulaması gerektirir.

Araştırılması gereken genel kırmızı bayrak sınıfları:

- Bilinç kaybı veya yeni bilinç bulanıklığı
- Ciddi nefes darlığı
- Şiddetli göğüs ağrısı
- Yeni nörolojik bulgu
- Ani/ciddi görme değişikliği
- Kontrol edilemeyen kanama
- Hızla kötüleşen durum
- Birden fazla kişide eş zamanlı belirti

### Kritik karar 10.1 — AI sonucu beklenmeden hangi durumlar eskale edilir?

Bu, hızlı katmanın temel güvenlik listesidir. Derin AI'ın yanıt süresi veya başarısı
bu akışı geciktirmemelidir.

### Kritik karar 10.2 — “İlk eylem” ile “tedavi” sınırı nedir?

Ürün şunları ayırmalıdır:

- Ölçümü tekrar etme
- Aktiviteyi durdurma/güvenli pozisyona geçme
- Görev için onaylı kontrol listesini açma
- Ekip arkadaşına/yer ekibine bildirim
- Uzman değerlendirmesi isteme
- İlaç, doz veya invaziv müdahale önerme

Son kategori, uzman doğrulaması ve görev protokolü olmadan üretken AI'a
bırakılmamalıdır.

**Biyoloji ekibinin çıktısı:** Kaynağı, onay durumu ve kullanım koşulu bulunan
`KIRMIZI_BAYRAK_VE_EYLEM_KUTUPHANESI`.

---

## 11. İki katmanlı karar mimarisinde biyolojinin rolü

### Katman 1 — Hızlı ve deterministik güvenlik motoru

Görevleri:

- Veri kalitesini kontrol etmek
- Mutlak güvenlik kurallarını değerlendirmek
- Kişisel sapmayı ve devam süresini ölçmek
- Kırmızı bayrakları yakalamak
- Önceden doğrulanmış ilk eylemi seçmek
- Gerekirse uzman/ekip bildirimi oluşturmak

Biyoloji ekibi bu katman için şunları sağlar:

- Kural koşulları
- Süre ve yeniden değerlendirme pencereleri
- Gerekli destekleyici ölçümler
- Kırmızı bayraklar
- Onaylı eylem metinleri

### Katman 2 — Derin ve açıklayıcı analiz

Görevleri:

- Zaman serilerini ve farklı sistemleri birleştirmek
- Olası nedenleri ve alternatifleri sıralamak
- İlgili NASA/OSDR çalışmasını getirmek
- Eksik veriyi belirtmek
- Basit dille açıklama üretmek

Biyoloji ekibi bu katman için şunları sağlar:

- Mekanizma haritası
- Olası nedenler
- Ayırıcı ölçümler
- Kaynak ve kanıt sınıfı
- Yapılmaması gereken çıkarımlar

### Kritik karar 11.1 — AI kuralları değiştirebilir mi?

**Önerilen karar:** Hayır. AI yeni hipotez önerebilir; ancak doğrulanmış güvenlik
kuralını, eşik değerini veya ilk eylemi çalışma anında değiştirememelidir.

---

## 12. Biyoloji ekibinin gerçekten tartışması gereken senaryo soruları

Her seçilmiş senaryo için yalnızca aşağıdaki karar soruları cevaplanmalıdır:

1. Bu olayın fizyolojik mekanizması nedir?
2. Görev sırasında hangi ölçülebilir gösterge bu olayı temsil eder?
3. Ana gösterge tek başına ne kadar özgüldür?
4. En önemli alternatif açıklamalar nelerdir?
5. Olasılıkları ayırmak için hangi ek ölçümler gerekir?
6. Hangi görev/aktivite bağlamı yorumu değiştirir?
7. Tek değer mi, devam süresi mi, değişim hızı mı önemlidir?
8. Hangi veri kalitesi koşulu sağlanmalıdır?
9. Hangi semptomlar dikkat seviyesini yükseltir?
10. Hangi kırmızı bayrak AI analizini beklemeden eskalasyon gerektirir?
11. İlk güvenli eylem nedir?
12. Ne zaman yeniden ölçüm yapılmalıdır?
13. Hangi durumda olay kapanır, hangi durumda seviye yükselir?
14. Kullanılan kanıt insan mı, analog mu, hücre mi, hayvan mı?
15. Bu senaryoda sistemin söylememesi gereken şey nedir?

Bir soru algoritmanın girdisini, kararını, çıktısını veya güvenlik sınırını
değiştirmiyorsa hackathon öncesi kritik tartışma değildir.

---

## 13. Biyoloji ekibinin teslim edeceği somut artefaktlar

### 13.1 Gösterge sözlüğü

Her değişken için:

```yaml
id: resting_heart_rate
display_name: Dinlenme kalp hızı
unit: bpm
body_system: cardiovascular
measurement_type: continuous
measurement_context: rest
affected_by: []
supporting_measurements: []
confounders: []
data_quality_requirements: []
evidence_sources: []
evidence_level: A-F
medical_review_status: pending
```

### 13.2 Senaryo kartı

```yaml
scenario_id: cabin_co2_headache
time_scale: acute
primary_signal: cabin_co2
symptoms: [headache, dizziness]
supporting_signals: [respiration_rate, heart_rate, spo2]
alternative_explanations: []
red_flags: []
immediate_actions: []
reassessment_interval: TBD
evidence_sources: []
limitations: []
```

### 13.3 Kural karar tablosu

| Kural ID | Girdiler | Bağlam | Süre | Veri kalitesi | Çıktı | İlk eylem | Kaynak | Onay |
|---|---|---|---|---|---|---|---|---|

### 13.4 Kanıt defteri

| İddia | Kaynak | Veri tipi | Örneklem | Kanıt sınıfı | Üründe kullanım | Sınırlama |
|---|---|---|---|---|---|---|

### 13.5 Test vakaları

Her senaryo için en az:

- Normal vaka
- Hafif sapma
- Kalıcı sapma
- Kritik/kırmızı bayrak
- Kötü sensör verisi
- Çelişkili iki sensör
- Semptom var, sensör normal
- Sensör anormal, semptom yok
- Müdahale sonrası iyileşme
- Müdahale sonrası kötüleşme

Her vaka için beklenen dikkat seviyesi ve açıklama önceden yazılmalıdır.

---

## 14. Şimdi karar verilmesi gerekenler / sonra çalışılacaklar

### P0 — Prototipi bloke eden kararlar

1. Çalışan üç ana senaryo hangileri?
2. Her senaryonun veri girişleri nelerdir?
3. Hangi veriler gerçek, hangileri sentetik olacak?
4. Hangi göstergeler sürekli, periyodik veya araştırma verisidir?
5. Her senaryonun normal/dikkat/acil mantığı nedir?
6. Kırmızı bayraklar nelerdir?
7. İlk güvenli eylemler nelerdir?
8. Veri kötü olduğunda sistem ne yapar?
9. Her kural hangi kaynağa ve kanıt sınıfına dayanır?
10. Sistem hangi teşhis/tedavi iddialarını yapmayacaktır?

### P1 — İlk prototipten sonra

- Yeni sağlık alanları eklemek
- Daha gelişmiş kişisel başlangıç modeli
- Omics ve laboratuvar eğilimlerini derin analiz katmanına bağlamak
- Ortam ve görev profillerini ayrıntılandırmak
- OSDR çalışmalarını otomatik indekslemek
- Uzman onay iş akışı

### P2 — Şimdilik kapsam dışı

- Tüm hastalıkları teşhis eden genel model
- Ay ve Mars için kanıtsız kesin normal değer tabloları
- Omics verisinden gerçek zamanlı acil teşhis
- AI'ın kendi tıbbi eşiklerini üretmesi
- Uzman onayı olmadan ilaç/doz tavsiyesi
- Hayvan veya organoid bulgusunu doğrudan insan klinik kuralı yapmak

---

## 15. Kritik karar toplantısı gündemi

Toplantı sonunda her madde için `karar`, `gerekçe`, `kaynak`, `sorumlu` ve
`açık soru` yazılmalıdır.

1. Üç demo senaryosunu seçin.
2. Her senaryo için fizyolojik mekanizmayı tek paragrafta tanımlayın.
3. Ölçülebilir girdileri kesinleştirin.
4. Ana alternatif nedenleri seçin; bütün olasılıkları listelemeyin.
5. Destekleyici ve ayırıcı ölçümleri seçin.
6. Kırmızı bayrakları belirleyin.
7. İlk eylem ve yeniden değerlendirme akışını belirleyin.
8. OSDR/NASA kaynaklarını kanıt sınıfına ayırın.
9. Sayısal eşikler için “kaynaklı / demo / bilinmiyor” etiketi verin.
10. Sistem iddiasını ve bilimsel sınırlarını yazılı olarak onaylayın.

### Karar kaydı şablonu

```markdown
## Karar: [başlık]

- Tarih:
- Katılımcılar:
- Karar:
- Değerlendirilen seçenekler:
- Seçim gerekçesi:
- Kullanılan kaynaklar:
- Kanıt seviyesi:
- Yazılım üzerindeki etkisi:
- Bilinen sınırlamalar:
- Yeniden değerlendirme koşulu:
- Sorumlu:
```

---

## 16. Başarı ölçütü

Biyoloji/fizyoloji çalışması şu cümleyi kaynaklı şekilde tamamlayabiliyorsa ürün
ekibine kullanılabilir bir çıktı sağlamış demektir:

> **Şu ölçümler**, **şu bağlamda**, **şu süre/eğilimle** ve **şu semptomlarla**
> birlikte görülürse sistem **şu dikkat seviyesini** üretmeli; **şu güvenli ilk
> eylemi** göstermeli ve **şu koşulda uzman desteğine** geçmelidir. Bu kararın
> kanıt seviyesi **şudur**, sınırlaması ise **budur**.

Eğer araştırma bu cümledeki bir alanı değiştirmiyorsa şu aşamada kritik değildir.

---

## 17. Başlangıç için resmî kaynaklar

- [NASA Space Apps 2026 — Health Monitoring Software](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
- [NASA — Five Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/)
- [NASA — Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/)
- [NASA — Spaceflight Standard Measures](https://www.nasa.gov/reference/standard-measures/)
- [NASA — Open Science Data Repository](https://science.nasa.gov/biological-physical/data/osdr/)
- [NASA OSDR Data Search](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study)
- [NASA — Human Spaceflight Standards / NASA-STD-3001](https://www.nasa.gov/ochmo/human-spaceflight-and-aviation-standards/)
- [NASA Human Research Roadmap — Risks](https://humanresearchroadmap.nasa.gov/Risks/default.aspx)

NASA-STD-3001'in programa ve görev profiline göre uygulanıp uyarlanması gerektiği
unutulmamalıdır. Bu proje, standardın veya görev özelindeki uçuş tıbbı prosedürlerinin
yerine geçtiğini iddia etmemelidir.
