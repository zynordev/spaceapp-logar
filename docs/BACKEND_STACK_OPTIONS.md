# Backend Teknoloji Yığını Seçenekleri

Son güncelleme: 14 Kasım 2026

Durum: **Kullanıcı onayı bekliyor (Onay Kapısı B)**

Bu karar belgesi MVP backend'inin hangi araçlarla geliştirileceğini karşılaştırır.
Amaç en fazla teknoloji kullanmak değil; sağlık ve çevre ölçümlerini açık,
doğrulanabilir ve yarışma süresinde yetiştirilebilir bir yapıda işlemektir.

## Teknik ihtiyaçlar

Seçilecek yığın şunları kolaylaştırmalıdır:

- zaman damgalı vital, öznel durum ve çevre ölçümü almak;
- birim, veri türü ve izin verilen aralıkları girişte doğrulamak;
- kişisel başlangıç değeri ve görev bağlamına göre açıklanabilir kurallar çalıştırmak;
- alarmın hangi ölçüm ve kuralla üretildiğini kaydetmek;
- sentetik demo verisini gerçek OSDR verisinden ayırmak;
- otomatik API belgesi ve otomatik test üretmek;
- OSDR CSV/metadata dosyalarını dönüştürmek.

## Seçenek 1 — Python/FastAPI (önerilen)

| Katman | Seçim |
|---|---|
| Çalışma zamanı | Python 3.12 |
| Paket/proje yönetimi | uv |
| HTTP API | FastAPI |
| Giriş/çıkış doğrulama | Pydantic |
| Veri erişimi | SQLAlchemy |
| Şema göçleri | Alembic |
| MVP veritabanı | SQLite |
| Test | pytest + FastAPI TestClient/HTTPX |

### Güçlü yönleri

- Pydantic modelleri ölçüm alanlarını ve iç içe veri yapılarını açıkça doğrular.
- FastAPI aynı modellerden OpenAPI/JSON Schema ve etkileşimli API belgesi üretir.
- Python, OSDR tablo ve bilimsel veri işleme araçlarıyla aynı dilde çalışır.
- SQLAlchemy hem SQLite hem PostgreSQL desteklediği için demo sonrası veritabanı
  geçişi mümkündür.
- Kural motoru framework'ten bağımsız sade Python fonksiyonları olarak yazılabilir.

### Bedeli

- Frontend TypeScript olacaksa iki dil kullanılır.
- Python 3.14 yerine bağımlılık uyumluluğu daha öngörülebilir olan ve makinede
  hazır bulunan Python 3.12 proje sürümü olarak sabitlenir.

## Seçenek 2 — TypeScript/Fastify

| Katman | Seçim |
|---|---|
| Çalışma zamanı | Node.js + TypeScript |
| HTTP API | Fastify |
| Giriş/çıkış doğrulama | JSON Schema tabanlı doğrulama |
| Veri erişimi | Drizzle veya Prisma |
| MVP veritabanı | SQLite |
| Test | Node test runner veya Vitest |

### Güçlü yönleri

- Frontend de TypeScript ise ekip tek dil ve bazı ortak tipleri kullanabilir.
- Fastify istek doğrulama ve cevap serileştirme için şema tabanlı, hızlı bir yapı
  sağlar.

### Bedeli

- OSDR ve bilimsel veri işleme çalışmaları çoğunlukla ayrı Python araçları ister.
- JSON Schema, TypeScript tipi ve veritabanı şeması arasında uyumu korumak için
  ek disiplin gerekir.
- Şu anda ekipte frontend teknoloji kararı verilmediği için tek dil avantajı henüz
  kesin değildir.

## Seçenek 3 — Django + Django REST Framework

### Güçlü yönleri

- ORM, kullanıcı yönetimi, yönetim paneli ve olgun proje yapısı birlikte gelir.
- Çok sayıda yönetim ekranı ve rol gerektiğinde hızlı başlangıç sağlayabilir.

### Bedeli

- MVP'nin sensör alımı ve açıklanabilir kural motoru için ihtiyaç duyduğundan daha
  geniş bir çerçevedir.
- İlk yarışma demosunda kullanılmayacak kullanıcı/yönetim özellikleri dikkat ve
  kurulum maliyeti yaratır.

## Öneri

**Seçenek 1: Python 3.12 + uv + FastAPI + Pydantic + SQLAlchemy/Alembic +
SQLite + pytest** önerilir.

İlk sürüm tek bir backend uygulaması olacaktır. Mikroservis, mesaj kuyruğu, LLM,
Docker ve gerçek zamanlı akış altyapısı başlangıç bağımlılığı yapılmayacaktır.
Sensör verisi önce normal HTTP uçlarıyla alınacak; canlı ekran gerçekten ihtiyaç
duyarsa daha sonra WebSocket veya Server-Sent Events eklenecektir.

## Seçimden sonra ilk teknik dilim

Onaylanan yığınla yalnızca şu küçük iskelet kurulacaktır:

1. çalışan bir `/health` ucu;
2. proje yapılandırması ve bağımlılık kilidi;
3. tek bir otomatik API testi;
4. yerel çalıştırma komutları.

Sağlık ölçümü modeli ve alarm kuralları, bu iskelet doğrulandıktan sonra ayrı
onay kapılarında geliştirilecektir.

## Resmî teknik kaynaklar

- [FastAPI özellikleri](https://fastapi.tiangolo.com/features/)
- [Pydantic dokümantasyonu](https://docs.pydantic.dev/latest/)
- [SQLAlchemy veritabanı lehçeleri](https://docs.sqlalchemy.org/en/21/dialects/)
- [Fastify doğrulama ve serileştirme](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Django dokümantasyonu](https://docs.djangoproject.com/)

