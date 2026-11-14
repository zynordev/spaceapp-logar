# NASA OSDR gerçek laboratuvar verisi

Bu klasördeki CSV dosyaları NASA Open Science Data Repository'den 14 Kasım
2026'da indirilmiştir. İçerik değiştirilmemiştir. Demo, internet bağlantısı
olmadan da çalışsın diye repoda tutulur.

| Dosya | Dataset | İçerik |
|---|---|---|
| `LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv` | [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) | Inspiration4 tam kan sayımı; analit, değer, referans aralığı, **birim**, zaman noktası |
| `LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv` | OSD-569 | Aynı verinin geniş tablo hali (karşılaştırma için) |
| `LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv` | [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | Inspiration4 kapsamlı metabolik panel; birimli uzun tablo |
| `LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv` | OSD-575 | Aynı verinin geniş tablo hali |

İndirme adresi biçimi:
`https://osdr.nasa.gov/geode-py/ws/studies/<OSD-ID>/download?source=datamanager&file=<dosya>`

## İçe aktarma

```bash
uv run python -m spaceapp_logar.services.osdr_import
```

Panelden "Gerçek OSDR lab verisi" butonu da aynı işi yapar
(`POST /v1/demo/osdr-labs/import`). Veriler `osdr-inspiration4` görevine,
`C001`–`C004` kimlikleriyle, `source_type=OSDR` olarak yazılır. Sentetik demo
görevleriyle karışmaz. Tekrar çalıştırmak kopya oluşturmaz ve hiçbir şeyi
silmez.

## Notlar

- **Birim doğrulaması:** Orijinal (SUBMITTED) dosyada CBC hemoglobin birimi
  `g/dL`'dir. Dönüştürülmüş tablodaki `hemoglobin_value_percent` adı yanıltıcı
  bir etikettir ([MVP_INDICATORS.md](../../docs/MVP_INDICATORS.md)'deki açık
  soru böylece kapanır).
- **Tarihler:** OSDR yalnızca göreli gün etiketleri verir (`L-92` = fırlatmadan
  92 gün önce, `R+45` = dönüşten 45 gün sonra). Takvim tarihi, Inspiration4
  fırlatma (16 Eylül 2021) ve dönüş (18 Eylül 2021) günlerinden, saat 12:00 UTC
  varsayılarak üretilir. Saat bilgisi yaklaşıktır.
- **İçe aktarılan analitler:** WBC, trombosit, hemoglobin, glukoz, kreatinin,
  sodyum, potasyum, ALT, AST. Cinsiyet sütunu içe aktarılmaz.
- Veriler uçuş öncesi ve sonrası örneklerdir; Inspiration4'te uçuş içi kan örneği
  yoktur.
