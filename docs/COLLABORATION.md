# Birlikte Çalışma Biçimi

Son güncelleme: 14 Kasım 2026

Bu proje tamamen otomatik “vibe coding” şeklinde ilerlemeyecektir. Amaç, her
kararın ekip tarafından anlaşılması ve önemli ürün kararlarında proje sahibinin
onayının alınmasıdır.

## Çalışma döngüsü

Her adımda şu sıra izlenir:

1. Codex yapılacak işi, nedenini ve beklenen çıktıyı açıklar.
2. Önce salt-okunur araştırma ve mevcut durum incelemesi yapılır.
3. Ürün veya mimari kararı gerekiyorsa seçenekler ve sonuçları sunulur.
4. Onay kapısı olan karar kullanıcıyla birlikte verilir.
5. Değişiklik küçük ve incelenebilir bir parça olarak uygulanır.
6. Test veya belge doğrulaması yapılır.
7. Sonuç, değişen dosyalar ve açık kalan sorular bildirilir.
8. Mantıksal olarak tamamlanan parçalar ayrı commit'lerde tutulur.

## Roller

### Codex'in sorumlulukları

- NASA/OSDR kaynaklarını ve veri dosyalarını incelemek
- Bulguları kaynaklarıyla birlikte belgelemek
- Alternatifleri ve teknik ödünleşimleri açıklamak
- Veri sözlüğü, olay modeli ve backend taslaklarını hazırlamak
- Uygulama kodu ve otomatik testleri yazmak
- Sentetik ve gerçek verinin karışmamasını sağlamak
- Her değişiklikten önce ve sonra kısa durum bilgisi vermek

### Proje sahibinin sorumlulukları

- Ürün hikâyesini ve demo senaryosunu seçmek
- MVP'de hangi göstergelerin kullanıcıya gösterileceğini onaylamak
- Yerel etkinlik, sunum süresi ve takım kısıtlarını paylaşmak
- Astronota gösterilecek dilin tonunu ve sadelik seviyesini değerlendirmek
- Tıbbi eylem kartlarının yalnızca demo/prototip olduğunu kabul edip kapsamı
  onaylamak
- Hazırlanan ekran akışı ve demo senaryosunu kendi cümleleriyle anlatabilmek

## Onay kapıları

Aşağıdaki kararlar kullanıcı onayı olmadan kesinleştirilmez:

| Kapı | Karar | Codex'in hazırlayacağı | Kullanıcının yapacağı |
|---|---|---|---|
| A | MVP sağlık göstergeleri | Kaynaklı kısa liste ve veri uygunluğu | 8–12 göstergeyi seçmek |
| B | Backend teknoloji yığını | 2–3 seçenek ve ödünleşimler | Yığını onaylamak |
| C | Alarm kuralları | Kaynak, bağlam ve örnek senaryolar | Demo için kullanılacak kuralları onaylamak |
| D | API ve veri modeli | Şema örnekleri ve akış diyagramı | Alan adlarını ve kapsamı gözden geçirmek |
| E | Demo hikâyesi | Senaryo, test verisi ve beklenen çıktı | Sunumu prova etmek ve geri bildirim vermek |

## Mevcut çalışma varsayımı

MVP'nin ana akışı:

1. 7/24 vital ve çevre ölçümleri alınır.
2. Veri kalitesi kontrol edilir.
3. Kişisel başlangıç değeri ve görev bağlamına göre risk durumu hesaplanır.
4. Açıklanabilir alarm ve doğrulanmış eylem kartı gösterilir.
5. OSDR laboratuvar verileri periyodik sağlık trendi ve bilimsel dayanak olarak
   kullanılır.

Bu varsayım proje sahibinin geri bildirimiyle değiştirilebilir.

## Güncel durum

- Challenge ve kaynak doğrulaması tamamlandı.
- OSDR veri envanterinin MVP için gerekli ilk incelemesi tamamlandı; ayrıntılı
  veri doğrulaması geliştirme boyunca sürecek.
- MVP sağlık ve çevre göstergeleri onaylandı (Onay Kapısı A tamamlandı).
- Python/FastAPI backend teknoloji yığını onaylandı (Onay Kapısı B tamamlandı).
- Hibrit ve açıklanabilir alarm yaklaşımı onaylandı (Onay Kapısı C tamamlandı).
- Sıradaki ortak karar: API ve veri modeli (Onay Kapısı D).
