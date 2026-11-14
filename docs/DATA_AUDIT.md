# Challenge ve Açık Veri Ön İncelemesi

Son güncelleme: 14 Kasım 2026

Bu belge araştırmanın ilk çıktısıdır. Sayılar OSDR kataloğunun zamanla değişmesi
nedeniyle tarih ile birlikte okunmalıdır.

## 1. Challenge'ın istediği ürün

[Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=details)
görevi, sağlık göstergelerini toplayan ve astronotun kendi sağlık durumunu
değerlendirip harekete geçmesini sağlayan görsel bir araç istemektedir.

Challenge metninde özellikle belirtilen noktalar:

- Örnek göstergeler: tansiyon, kalp hızı, kan şekeri, vücut sıcaklığı, günlük uyku
  ve ruh hali.
- Klavye, fare, kamera, görüntü veya başka bir giriş biçimi kullanılabilir.
- Araç ölçümün neden gerekli olduğunu, ne zaman dikkat gerektirdiğini ve kritik
  durumu önlemek için hangi adımların atılabileceğini anlatmalıdır.
- Uzay aracı, uzay istasyonu, rover veya başka bir gezegen/uydu üssü gibi farklı
  ortamlar desteklenebilir.
- Hatırlatmalar, zaman grafikleri, renk kodları ve basit açıklamalar önerilir.

Sonuç: backend önceliklidir fakat görsel sunum challenge'ın açık bir parçasıdır.
AI kullanımı zorunlu değildir.

## 2. NASA risk çerçevesi

[NASA Human Research Program](https://www.nasa.gov/hrp/hazards/) beş temel
tehlike tanımlar:

1. Uzay radyasyonu
2. İzolasyon ve kapalı kalma
3. Dünya'dan uzaklık
4. Değişen yerçekimi alanları
5. Kapalı/tehlikeli yaşam ortamı

Bu proje konum adlarını doğrudan sağlık aralığına çevirmek yerine bu maruziyetleri
bağlam değişkeni olarak kullanacaktır.

## 3. OSDR katalog büyüklüğü

14 Kasım 2026 tarihinde OSDR arama ve API sonuçları:

| Sorgu | Sonuç | Yorum |
|---|---:|---|
| Tüm OSDR çalışmaları | 645 | İnsan dışı organizmalar dahil |
| Organism = Homo sapiens | 116 | Hücre ve organoid çalışmaları dahil |
| Homo sapiens + Spaceflight Study | 36 | Hepsi astronottan alınmış örnek değil |
| Homo sapiens + Ground Study | 73 | Analog, radyasyon ve hücre çalışmaları dahil |

Yeniden üretilebilir sorgular:

- [Tüm OSDR çalışmaları](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study)
- [Homo sapiens API sorgusu](https://osdr.nasa.gov/osdr/data/search?ffield=organism&fvalue=Homo%20sapiens&from=0&size=500&type=cgene)
- [İnsan spaceflight çalışmaları API sorgusu](https://osdr.nasa.gov/osdr/data/search?ffield=organism&fvalue=Homo%20sapiens&ffield=Project%20Type&fvalue=Spaceflight%20Study&from=0&size=500&type=cgene)
- [İnsan ground çalışmaları API sorgusu](https://osdr.nasa.gov/osdr/data/search?ffield=organism&fvalue=Homo%20sapiens&ffield=Project%20Type&fvalue=Ground%20Study&from=0&size=500&type=cgene)
- [OSDR Biological Data API rehberi](https://github.com/nasa/OSDR_Tutorials/blob/main/source/pages/guides/biological_data_api.md)

Önemli sınırlama: katalogdaki “insan” etiketi gerçek bir astronot zaman serisi
anlamına gelmez. İnsan hücreleri, organoidler, doku çipleri ve Dünya tabanlı
analog çalışmalar da bu etiketi taşır.

## 4. Doğrudan astronot verisi içeren çekirdek adaylar

`OSDR örnek kaydı` sütunu katılımcı sayısı değildir; OSDR metadata içindeki örnek
kayıtlarının sayısıdır. Aynı kişiye ait farklı zaman noktaları veya assay kayıtları
ayrı sayılabilir.

| Dataset | Katılımcı / görev | OSDR örnek kaydı | İçerik | MVP değeri |
|---|---|---:|---|---|
| [OSD-53](https://osdr.nasa.gov/bio/repo/data/studies/OSD-53) | 6 astronot, kısa uçuş | 13 | Uçuştan 10 gün önce ve dönüşten 2–3 saat sonra tam kan; 234 stres geni | Uçuş öncesi/sonrası değişim örneği |
| [OSD-316](https://osdr.nasa.gov/bio/repo/data/studies/OSD-316) | 5 kozmonot, uzun ISS görevi | 33 | Uçuş öncesi, uçuş içi ve dönüş sonrası IgM repertuvarı | Kişisel ve zamansal bağışıklık farkları |
| [OSD-359](https://osdr.nasa.gov/bio/repo/data/studies/OSD-359) | 5 kozmonot, 169–199 gün | 15 | Uçuş öncesi ve dönüş sonrası nefes kondensatı proteomiği | İnvaziv olmayan periyodik ölçüm fikri |
| [OSD-481](https://osdr.nasa.gov/bio/repo/data/studies/OSD-481) | 3 astronot | 6 | Plazma eksozom RNA profili | Sınırlı longitudinal örnek |
| [OSD-483](https://osdr.nasa.gov/bio/repo/data/studies/OSD-483) | 14 astronot | 42 | Uçuştan önce, dönüş günü ve üç gün sonra plazma küçük-RNA | En geniş doğrudan astronot gruplarından biri |
| [OSD-530](https://osdr.nasa.gov/bio/repo/data/studies/OSD-530) | 6 astronot, ISS'de 120+ gün | 64 | Uçuş öncesi, uçuş içi ve sonrası plazma cfRNA | Uzun görevde longitudinal değişim |
| [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) | 4 Inspiration4 astronotu | 81 | Tam kan, CBC, RNA, WGS; yedi uçuş öncesi/sonrası zaman noktası | CBC ve laboratuvar trendleri |
| [OSD-570](https://osdr.nasa.gov/bio/repo/data/studies/OSD-570) | 4 Inspiration4 astronotu | 24 | PBMC, tek hücre RNA/ATAC ve immün repertuvar | Bağışıklık değişimi |
| [OSD-571](https://osdr.nasa.gov/bio/repo/data/studies/OSD-571) | 4 Inspiration4 astronotu | 117 | Plazma proteomik, metabolomik, cfDNA/cfRNA | Çok modlu laboratuvar verisi |
| [OSD-574](https://osdr.nasa.gov/bio/repo/data/studies/OSD-574) | 4 Inspiration4 astronotu | 105 | Cilt biyopsisi ve cilt mikrobiyomu | Demo için ikincil öncelik |
| [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | 4 Inspiration4 astronotu | 28 serum örneği | Metabolik, bağışıklık ve kardiyovasküler paneller | İlk MVP için en kullanılabilir tabular veri |

Metadata sayıları OSDR'nin açık `meta/{id}` API uç noktalarından doğrulanmıştır.
Inspiration4 ailesinin tamamı NASA'nın
[I4 Mission Datasets](https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/)
sayfasında listelenmektedir.

## 5. OSD-575 dosya incelemesi

OSD-575'in indirilebilir dönüştürülmüş tablolarında:

| Panel | Örnek satırı | Analyte alanı | Not |
|---|---:|---:|---|
| Comprehensive Metabolic Panel | 28 | 19 | Değer ve klinik referans alt/üst sınırları |
| Eve immune panel | 28 | 71 | Konsantrasyon ve normalize yüzde |
| Eve cardiovascular panel | 28 | 9 | Konsantrasyon ve normalize yüzde |
| Alamar immune panel | 27 | 203 | NPQ ve normalize yüzde |

Toplam 302 panel-analyte alanı vardır; paneller arasında aynı biyobelirteç tekrar
edebileceği için bu sayı “302 benzersiz biyobelirteç” olarak yorumlanmamalıdır.
Örneklem yalnızca dört kişidir ve teşhis modeli eğitmek için yeterli değildir.

MVP açısından değerli CMP alanları arasında glukoz, sodyum, potasyum, klorür,
kreatinin, BUN, kalsiyum, albumin, bilirubin ve karaciğer enzimleri bulunur.

## 6. Mars analogu

[OSD-140 / Mars500](https://data.nasa.gov/dataset/dynamic-nature-of-epigenetic-patterns-observed-during-the-mars-520-d-mission-simulation)
altı kişilik 520 günlük izolasyon deneyinde 36 kan hücresi DNA metilasyon örneği ile
ruh hali ve biyokimyasal profilleme içerir.

Bu veri gerçek Mars yüzeyi verisi değildir. İzolasyon ve uzun görev süresi için
analog olarak kullanılabilir; Mars'a özgü klinik normal aralık üretmek için
kullanılamaz.

## 7. Sürekli veri boşluğu

İlk katalog taramasında kamuya açık, büyük örneklemli ve doğrudan astronotlardan
alınmış 7/24 kalp hızı, tansiyon, SpO2, sıcaklık ve uyku zaman serisini tek yerde
birleştiren bir OSDR çalışması bulunmamıştır.

[Spaceflight Standard Measures](https://www.nasa.gov/reference/standard-measures/)
aktivite/ışık sensörü, uyku raporları, biliş, bağışıklık, biyokimya, denge ve güç
ölçümlerini tanımlar; ancak bütün bireysel ham veriler doğrudan kamuya açık bir
eğitim veri seti değildir. Astronot çalışmalarında işlenmiş veriler açık olabilirken
ham genetik verilerin kontrollü erişimde olduğu
[OSDR FAQ](https://science.nasa.gov/reference/osdr-faq/) içinde belirtilir.

Sonuç: demo için sensör akışı sentetik olarak üretilecek, gerçek OSDR tabloları ise
laboratuvar trendleri ve bilimsel senaryo doğrulaması için kullanılacaktır. Sentetik
veri açıkça etiketlenecek ve gerçek NASA ölçümü gibi sunulmayacaktır.

## 8. Çevre verisi

OSDR Environmental Data Application; ISS ve uzay biyolojisi payload'ları için
sıcaklık, nem, oksijen, karbondioksit ve radyasyon verileri sağlar. Bu telemetri
sağlık olaylarıyla ortak zaman modeline alınabilir.

Kaynak: [OSDR FAQ — Environmental Data Application](https://science.nasa.gov/reference/osdr-faq/)

## 9. İlk uygunluk kararı

| İhtiyaç | Uygun kaynak | Karar |
|---|---|---|
| 7/24 vital sensör demosu | OSDR'de yeterli doğrudan veri yok | Açıkça etiketlenmiş sentetik zaman serisi |
| Laboratuvar trendi | OSD-575 ve OSD-569 | Gerçek tabular veriyi kullan |
| Uzun ISS görevi değişimi | OSD-316 ve OSD-530 | Zaman bağlamı ve kişiselleştirme kanıtı |
| Mars izolasyonu | OSD-140 | Yalnızca analog olarak kullan |
| Kabin çevresi | OSDR EDA | Sağlık sinyaliyle zaman eşleştir |
| Ay/Mars normal aralığı | Doğrudan insan verisi yok | Aralık uydurma; belirsizlik ve analog etiketi kullan |

## 10. Sıradaki araştırma işi

1. OSD-569 ve OSD-575 dosyalarındaki ölçüm adlarını ortak bir sözlüğe dönüştürmek.
2. Sürekli MVP göstergelerinin uzayda ölçülebilirliğini kaynak bazında doğrulamak.
3. NASA tehlikeleri ile ölçüm adayları arasında kanıt tablosu oluşturmak.
4. Her kaynak için lisans, erişim ve demo kullanım notunu tamamlamak.
5. İlk backend olay şeması için veri tiplerini ve kalite bayraklarını belirlemek.
