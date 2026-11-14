# Ortak İş Panosu

Son güncelleme: 14 Kasım 2026

Bu dosyanın koordinatörü Halil'dir. Diğer ekip üyeleri yeni bir işe başlamadan
önce Halil'e işin adını ve dokunacağı ana dosyaları bildirir, ardından ekip
kanalında `MAIN BENDE` diyerek yazma sırasını alır. Ayrıntılı Git kuralları için
[Git ile ortak çalışma düzenine](GIT_WORKFLOW.md) bakın.

## Aktif işler

| İş | Sahip | Dosya/sınır | Durum |
|---|---|---|---|
| Sentetik CO2 demo çalıştırıcısı | Sonraki geliştirici | Mevcut API ve onaylı CO2 davranışı; yeni eşik yok | Planlandı |
| Push tabanlı test kontrolü | Sonraki geliştirici | CI yapılandırması; uygulama davranışı değişmez | Sonraki |

## Tamamlanan işler

| İş | Sahip | Birleşen commit | Doğrulama |
|---|---|---|---|
| Ortak `main` işbirliği düzeni | Codex | `5d2acf7` | Belge denetimi geçti |
| CO2 WATCH eylem kartı | piebio | `3ebb073`, `f1fc478` | 72 test geçti |
| CO2 biyoloji senaryo testleri | piebio | `b704e59` | Tam paket 86 test geçti |

## İş devri şablonu

Bir işi devrederken veya incelemeye açarken şu kısa bilgileri paylaşın:

```text
İş:
Commit:
Değişen ana dosyalar:
Çalıştırılan test:
Migration etkisi:
Açık soru veya risk:
```
