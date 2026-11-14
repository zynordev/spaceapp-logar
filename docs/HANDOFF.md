# Backend Devir Notu

Devir tarihi: 14 Kasım 2026

Bu belge projeyi devralacak geliştiricinin mevcut durumu yeniden keşfetmeden
güvenle devam etmesi içindir. Devir anında çalışma ağacı temizdir, yerel `main`
uzaktaki `b704e59` commit'inin üzerindedir ve tam test paketi **86/86** geçmiştir.

## İlk yapılacak Git işlemi

Halil bu devir commit'lerini GitHub'a gönderdikten sonra devralan kişi yazma
sırasını alıp şunları çalıştırmalıdır:

```bash
git status --short
git switch main
git fetch origin
git pull --ff-only origin main
uv sync --locked
uv run pytest
```

Ekip aynı `main` dalını kullandığı için [Git çalışma düzenindeki](GIT_WORKFLOW.md)
`MAIN BENDE` / `MAIN SERBEST` sırası zorunludur. Force-push yapılmaz.

## Çalışan backend kapsamı

- FastAPI, Pydantic, SQLAlchemy, Alembic ve SQLite altyapısı hazırdır.
- `GET /health` servis durumunu döndürür.
- `POST /v1/observations` doğrulanmış kabin CO2 gözlemini ve aynı transaction'da
  üretilen açıklanabilir değerlendirmeyi saklar.
- CO2 motoru son 60 dakikayı dakika bölmelerine ayırır; veri yeterliliği,
  kesintisiz boşluk ve kalite bayraklarını hesaba katar.
- `POST /v1/check-ins` beş ayrı öznel alanı `0–4` aralığında değişmeden saklar.
- `GET /v1/crew/{crew_member_id}/status` son CO2 değerlendirmesini, varsa onaylı
  eylem kartını ve son öznel kontrolü birlikte döndürür.
- `WATCH` durumunda yalnızca onaylı `ENV_CO2_WATCH_CARD_V1` seçilir.
- Ham kanıt kimlikleri, kural sonucu ve gösterilen kart kimliği/sürümü denetim
  için veritabanında saklanır.

## Veritabanı durumu

Dört Alembic migration'ı sıralı ve test edilmiştir:

1. `20261114_0001_create_observations.py`
2. `20261114_0002_create_rule_evaluations.py`
3. `20261114_0003_create_subjective_check_ins.py`
4. `20261114_0004_add_action_card_to_rule_evaluations.py`

Yeni migration veri silmemeli ve mevcut SQLite veritabanıyla geriye uyumlu
olmalıdır. Destrüktif migration için Halil'in açık onayı gerekir.

## Son eklenen çalışma

`piebio`, `b704e59` commit'inde biyoloji rehberindeki CO2 senaryolarını hem kural
hem API seviyesinde testlere dönüştürdü. Kapsanan başlıca durumlar:

- normal, sınırda ve kalıcı yüksek CO2;
- tek geçici sıçrama;
- hatalı, şüpheli, imkânsız ve pencere dışı veri;
- iyileşme ve kötüleşme;
- sensör normalken ağır öznel bulguların mevcut kurala göre yalnız bağlam kalması.

Son madde bilinçli bir sınırlamadır. Öznel bulgunun alarm seviyesini değiştirmesi
yeni bir tıbbi kuraldır ve kullanıcı onayı olmadan uygulanmamalıdır.

## Yarım kalan kod

Devir anında yarım kalan uygulama, migration veya başarısız test yoktur. Açık
ürün kararı Onay Kapısı E olan uçtan uca demo hikâyesidir.

## Devralan geliştirici için önerilen sıra

### 1. Sentetik CO2 demo akışı

İlk güvenli backend işi, mevcut ve onaylı davranışı kullanan tekrarlanabilir bir
demo çalıştırıcısıdır. Yeni eşik veya tıbbi içerik eklemeden şu akışı göstermeli:

```text
NORMAL -> kalıcı yüksek CO2/WATCH + eylem kartı -> NORMAL'e dönüş
```

Kabul ölçütleri:

- tüm üretilen kayıtlar `source_type=SYNTHETIC` ve belirgin bir `scenario_id`
  taşır;
- çalıştırıcı mevcut HTTP API'yi kullanır ve üretim endpoint'i eklemez;
- her aşamada değerlendirme, veri kalitesi ve kart kimliği okunabilir biçimde
  gösterilir;
- tekrar çalıştırma mevcut veriyi silmez;
- test paketi geçmeye devam eder ve kullanım README'de belgelenir.

### 2. Otomatik test kontrolü

Demo akışından sonra GitHub'a her push'ta `uv sync --locked` ve `uv run pytest`
çalıştıran küçük bir CI iş akışı eklenebilir. Bu, aynı `main` kullanımındaki
hatalı push riskini azaltır; GitHub ayarı veya harici durum değişikliği
gerekiyorsa önce Halil bilgilendirilmelidir.

### 3. Yeni sağlık göstergeleri

Kalp hızı, SpO2 veya başka bir göstergeye geçmeden önce biyoloji ekibinden birim,
zaman penceresi, kişisel başlangıç yaklaşımı, veri kalitesi davranışı ve eylem
kartı onayı alınmalıdır. Kaynaksız klinik eşik veya teşhis dili eklenmemelidir.

## Değiştirilemeyecek ürün sınırları

- Sistem teşhis veya tedavi üreten bir yapay zekâ olarak sunulmaz; açıklanabilir
  karar-destek aracıdır.
- Öznel girişler şu anda alarm tetiklemez.
- CO2 `WATCH`, görev-özel `CRITICAL` eşiği değildir.
- Sentetik, OSDR ve diğer kaynak türleri açıkça etiketlenir.
- Yeni tıbbi eşik, teşhis iddiası veya eylem kartı kullanıcı onayı gerektirir.
- Push/deploy işlemini Halil yapar; Codex açık talep olmadan yapmaz.

## Başlıca kaynak dosyalar

- API ve uygulama durumu: [API_DATA_MODEL.md](API_DATA_MODEL.md)
- Kural sınırları: [ALARM_RULES.md](ALARM_RULES.md)
- Onaylı CO2 kartı: [CO2_ACTION_CARD_PROPOSAL.md](CO2_ACTION_CARD_PROPOSAL.md)
- Biyoloji karar rehberi: [biyo.md](biyo.md)
- Araştırma aşamaları: [RESEARCH_PLAN.md](RESEARCH_PLAN.md)
- Aktif görevler: [WORK_BOARD.md](WORK_BOARD.md)
