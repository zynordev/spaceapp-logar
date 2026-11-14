# Açıklanabilir Alarm Kuralları

Son güncelleme: 14 Kasım 2026

Durum: **Onaylandı (Onay Kapısı C tamamlandı)**

Bu belge teşhis algoritması tanımlamaz. Ölçümün ne zaman yeniden kontrol edilmesi,
izlenmesi veya önceden doğrulanmış görev prosedürüne yönlendirilmesi gerektiğini
belirleyen sade ve açıklanabilir karar mantığını tanımlar.

## Önerilen yaklaşım: hibrit kural motoru

Yalnızca sabit eşik kullanmak kişisel ve görev bağlamını kaçırır. Yalnızca kişisel
başlangıç değerini kullanmak ise mutlak güvenlik sınırlarını kaçırabilir. Bu nedenle
üç bilgi birlikte değerlendirilir:

1. **Kaynaklı mutlak sınır:** NASA standardı veya görev tarafından onaylanmış
   güvenlik sınırı.
2. **Kişisel değişim:** Astronotun uçuş öncesi/erken görev başlangıç değerinden
   sapma ve zaman içindeki eğilim.
3. **Bağlam:** Aktivite, uyku, EVA, görev günü ve kabin çevresi.

Bu üç katman deterministik kurallardır. LLM, teşhis modeli veya serbest metin
tedavi üretimi kullanılmaz.

## İki ayrı durum çıktısı

Sensör sorunu ile sağlık durumunu aynı durum makinesinde göstermek yanlış güven
üretebilir. Sistem iki ayrı sonuç döndürür.

### Veri kalitesi

| Durum | Anlamı |
|---|---|
| `VALID` | Ölçüm beklenen biçim, zaman ve kalite koşullarını karşılıyor |
| `SUSPECT` | Ölçüm kullanılabilir olabilir; tekrar ölçüm veya başka sensörle doğrulama gerekli |
| `MISSING` | Beklenen zaman penceresinde veri yok |
| `FAULT` | Sensör/iletim hatası veya fiziksel olarak geçersiz veri |

### Sağlık dikkati

| Durum | Anlamı |
|---|---|
| `UNKNOWN` | Güvenilir değerlendirme için yeterli veri yok |
| `NORMAL` | Etkin bir dikkat kuralı yok |
| `WATCH` | Eğilim izlenmeli; acil olmayan yeniden kontrol gerekebilir |
| `ALERT` | Astronotun kısa sürede doğrulanmış eylem kartını uygulaması gerekir |
| `CRITICAL` | Yalnızca görevce doğrulanmış acil prosedürün derhal açıldığı durum |

`FAULT` durumundaki tek bir sensör, astronotu otomatik olarak `NORMAL` veya
`CRITICAL` yapmaz. İlgili sağlık sonucu yeterli başka veri yoksa `UNKNOWN` olur.

## Basit değerlendirme sırası

Her yeni ölçüm için motor şu sırayı izler:

1. Alan, birim, zaman damgası ve veri kaynağını doğrula.
2. Sensör kalite bayrağını ve fiziksel olarak mümkün değer aralığını kontrol et.
3. Birimi standart birime dönüştür.
4. Gerekli zaman penceresi ve kişisel başlangıç farkını hesapla.
5. İlgili mutlak, kişisel ve çoklu-gösterge kurallarını çalıştır.
6. Tek ölçümlük gürültü için süre/tekrar şartını uygula.
7. Durumun sürekli açılıp kapanmasını önlemek için geri dönüş şartını uygula.
8. Sonucu kural kimliği, sürümü, kanıtı ve eylem kartı kimliğiyle kaydet.

Bu sıra kodda küçük, bağımsız ve otomatik test edilebilir fonksiyonlar olarak
uygulanacaktır.

## İlk demo için aday kurallar

Sayısal vital eşikleri Flight Medicine veya başka yetkili klinik kaynakla
doğrulanmadan ürün gerçeği olarak kullanılmayacaktır.

| Kural | Girdi ve koşul | Önerilen sonuç | Açıklama |
|---|---|---|---|
| `DATA_HR_JUMP_V1` | Kalp hızında sensörün örnekleme süresine göre fiziksel olarak şüpheli ani sıçrama | `SUSPECT` + sağlık `UNKNOWN` | Sensörü yeniden yerleştir ve ölçümü tekrarla; sağlık alarmı gibi sunma |
| `ENV_CO2_NOMINAL_V1` | Bir saatlik ortalama kabin `ppCO2 > 3 mmHg` | `WATCH` | NASA nominal habitat sınırının aşıldığını açıkla; kritik eşik gibi sunma |
| `VITAL_SPO2_SUSTAINED_V1` | Görevce doğrulanmış eşiğin altında, belirli süre devam eden SpO₂ ve düşük aktivite | `ALERT` | Sayısal eşik ve süre henüz doğrulama bekliyor |
| `VITAL_TEMP_TREND_V1` | Kişisel başlangıçtan görevce doğrulanmış düzeyde ve sürede sıcaklık sapması | `WATCH` | Tek ölçüm yerine süreli kişisel değişim kullan |
| `MULTI_CARDIO_RESP_V1` | Dinlenmede birlikte yükselen kalp/solunum hızı ve eşlik eden öznel belirti | `ALERT` | Hastalık adı koymadan ölçümleri doğrula ve onaylı prosedüre yönlendir |

### CO₂ kuralının sınırı

NASA-STD-3001 Volume 2, nominal araç/habitat için bir saatlik ortalama `ppCO2`
değerinin `3 mmHg` değerini aşmamasını ister. Aynı standart, off-nominal CO₂
değerlerinin görevin süresi, beklenen performans ve tıbbi erişim gibi koşullara
göre program/proje seviyesinde belirlenmesi gerektiğini söyler. Bu yüzden
`3 mmHg` MVP'de `WATCH` sınırıdır; buradan kendiliğinden `CRITICAL` sınırı
uydurulmayacaktır.

## Alarm gürültüsünü azaltma

- `WATCH` ve `ALERT` kuralları, kural özel olarak aksini söylemedikçe tek örnekle
  açılmaz; süre veya tekrar şartı taşır.
- Alarm kapandıktan sonra yeniden açılması için geri dönüş payı uygulanır.
- Aynı kök nedenden gelen alarmlar tek olay altında gruplanır.
- Sesli alarm yalnızca derhal eylem gerektiren, görevce doğrulanmış olaylarda
  düşünülür; diğerleri görsel olarak gösterilir.

NASA Human Integration Design Handbook, çok sık düşük öncelikli alarmın ekipte
duyarsızlaşma oluşturabileceğini belirtir. Bu nedenle öncelik ve sıklık kararları
alarm tasarımının parçasıdır.

## Her alarmın kanıt kaydı

Bir alarm kaydı en az şu sorulara cevap vermelidir:

- Hangi kural ve sürüm çalıştı?
- Hangi ölçüm veya ölçümler tetikledi?
- Kullanılan değer, birim, eşik ve zaman penceresi neydi?
- Aktivite, uyku, konum ve kabin bağlamı neydi?
- Veri kalitesi nasıldı?
- Kuralın bilimsel/operasyonel kaynağı neydi?
- Hangi doğrulanmış eylem kartı gösterildi?

Bu bilgiler daha sonra API/veri modeli onayında kesin alanlara dönüştürülecektir.

## Onay kaydı

14 Kasım 2026 tarihinde proje sahibi:

- mutlak sınır + kişisel değişim + bağlamdan oluşan hibrit yaklaşımı;
- veri kalitesi ve sağlık dikkatinin ayrı durumlar olmasını;
- ilk uçtan uca demoda kabin CO₂ yükselmesi ve öznel ağrı (baş ağrısı) girdisi
  kullanılmasını onayladı.

İlk uygulanan kural `ENV_CO2_NOMINAL_V1` olacaktır. Diğer aday kurallar API/veri
modeli ve görev konfigürasyonu onaylandıktan sonra uygulanacaktır.

İlk teknik dilimde kural, önceden hesaplanmış bir saatlik ortalama `ppCO2`
değerini değerlendirir. Ham telemetriden zaman ağırlıklı ortalama ve pencere veri
kalitesi üretimi, API/veri modeli kararıyla birlikte ayrı uygulanacaktır.

## Resmî kaynaklar

- [NASA-STD-3001 Volume 1 — Crew Health](https://www.nasa.gov/reference/nasa-std-3001v1/)
- [NASA-STD-3001 Volume 2 Revision F](https://www.nasa.gov/wp-content/uploads/2025/05/nasa-std-3001-vol-2.pdf)
- [Crew health records and trend analysis](https://www.nasa.gov/reference/7-0-crew-health-records/)
- [NASA Human Integration Design Handbook](https://www.nasa.gov/wp-content/uploads/2023/03/human-integration-design-handbook-revision-1.pdf)
- [NASA health and medical care requirements](https://www.nasa.gov/reference/3-0-health-and-medical-care/)

