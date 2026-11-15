# Sentetik Doğrulama (kural motoru)

> **SENTETİK VERİ — klinik doğrulama değildir; eşikler DEMO (kanıt sınıfı F).**
> Bu belge, kural motorunun *sentetik* senaryolarda tasarlandığı gibi davrandığını
> gösterir. Gerçek hasta/astronot verisiyle bir performans (duyarlılık, özgüllük)
> iddiası **yoktur**; sonuçlar yalnızca bu üretici ve bu eşiklere özgüdür.
> Sistem tanı koymaz, ilaç/doz önermez.

Bu dosya `uv run python scripts/validate_rules.py --n 15 --write docs/VALIDATION.md`
ile üretilir; aynı tohumlarla aynı sonucu verir. Çalışma süresi çok işlemli
(`--workers`) yaklaşık 2 dakikadır; N, bu süre sınırı için seçilmiştir.

## Yöntem

- Mevcut demo senaryo kurucuları (`services/demo_scenarios.py`) ve kural motoru
  (`services/rule_engine.py`), geçici bir SQLite veritabanında (alembic head) çalıştırılır.
- Aile başına **N = 15** sentetik pencere; her pencere ayrı bir tohumla üretilir
  (`20261115 + 1000·aile_sırası + i`); saat sabittir (`2026-11-15T12:00:00+00:00`).
- Olay aileleri mevcut senaryoları kullanır (`co2-headache`, `spo2-drop`,
  `fever-trend`, `sensor-fault`, `chest-pain-red-flag`) ve bir ek senaryo
  (dinlenmede kalp+solunum artışı). Tohum yalnızca ölçüm gürültüsünü değiştirir;
  olayın şekli sabittir — bu yüzden yüksek yakalama oranları *beklenendir*.
- Normal pencereler (240 dk; üç türe eşit bölünür): düz taban çizgisi, egzersiz ve
  uyku evreli, kısa SpO2 sensör arızaları ve veri boşlukları içeren gürültülü
  sensör. Taban değerleri tohuma göre rastgeledir.
- **Pencere ≠ gün.** Bir "pencere" 1,5–4 saatlik sentetik kayıttır (24 saatlik gün
  değil). Tabloda "1000 pencere başına" verilir; "gün" olarak okunmamalıdır.
- **Yakalama**: ilgili kuralın pencere içinde en az bir kez ≥ WATCH vermesi.
  **Yanlış alarm**: normal pencerede herhangi bir kuralın ALERT/CRITICAL vermesi.
- **Saf eşik tabanı**: aynı ham veride tek örnek üzerinden `KH>100`,
  `SpO2<92`, `sıcaklık>38`; veri kalitesini ve
  aktivite bağlamını yok sayar. CO2, kalp+solunum ve kırmızı bayrak için bu
  tabanın ölçtüğü bir kanal yoktur; bu hücreler "ölçmez" yazılır.

## Sonuçlar

### Olay yakalama (≥ WATCH, N = 15 / aile)

| Aile | Kural motoru | Saf eşik tabanı |
|---|---|---|
| CO2 + baş ağrısı | 100% (15/15; %95 GA 80–100%) | — (bu kanalı ölçmez) |
| SpO2 düşüşü | 100% (15/15; %95 GA 80–100%) | 100% (15/15; %95 GA 80–100%) |
| Ateş eğilimi | 100% (15/15; %95 GA 80–100%) | 100% (15/15; %95 GA 80–100%) |
| Dinlenmede kalp+solunum artışı | 100% (15/15; %95 GA 80–100%) | — (bu kanalı ölçmez) |
| Kırmızı bayrak (göğüs ağrısı) | 100% (15/15; %95 GA 80–100%) | — (bu kanalı ölçmez) |

### Yanlış alarm (normal pencereler, N = 15)

| Yöntem | ALERT/CRITICAL pencere | 1000 pencere başına |
|---|---|---|
| Kural motoru | 0% (0/15; %95 GA 0–20%) | 0 |
| Saf eşik tabanı | 67% (10/15; %95 GA 42–85%) | 667 |

### Sensör arızası (N = 15)

| Ölçüt | Kural motoru | Saf eşik tabanı |
|---|---|---|
| Sağlık alarmı (ALERT/CRITICAL) üretilen pencere | 0% (0/15; %95 GA 0–20%) | 100% (15/15; %95 GA 80–100%) |
| SpO2 kuralı pencere sonunda BİLİNMİYOR | 100% (15/15; %95 GA 80–100%) | — |

## Sınırlar (abartı yok)

- Veriyi ve olayları biz ürettik; eşikler de bizim DEMO eşiklerimizdir. Bu bir
  döngüsel testtir: "tasarım amacına uyuyor mu" sorusunu yanıtlar, "klinik olarak
  doğru mu" sorusunu **yanıtlamaz**.
- Zor/belirsiz vakalar (yavaş sürüklenen taban, çoklu eşzamanlı olay, gerçek
  sensör gürültüsü) kapsanmaz. Gerçek duyarlılık/özgüllük bilinmiyor.
- Yalnızca NASA-STD-3001 kaynaklı kabin CO2 kuralı resmi bir kaynağa dayanır;
  diğer tüm eşikler DEMO'dur.
- Saf eşik tabanı kasıtlı olarak basittir; iyi bir klinik taban değildir.
