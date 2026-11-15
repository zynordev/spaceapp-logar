// "Ne gerçek, ne simüle?" — one honest line per capability. Same table as
// docs/CAPABILITIES.md (keep both in sync).
export type CapState = 'works' | 'sim' | 'planned' | 'none';

export const CAP_STATE: Record<CapState, string> = {
  works: 'ÇALIŞIYOR',
  sim: 'SİMÜLE',
  planned: 'PLANLI',
  none: 'YOK',
};

export interface Capability {
  name: string;
  state: CapState;
  note: string;
}

export const CAPABILITIES: Capability[] = [
  { name: 'Kural motoru ve “Neden?” açıklaması', state: 'works', note: '11 kural gemide yerel çalışır. Yalnız kabin CO₂ eşiği NASA-STD-3001 kaynaklı (STANDART); diğerleri DEMO (kanıt sınıfı F).' },
  { name: 'Eylem kartları V2', state: 'works', note: 'Önceden yazılmış adımlar, nedenleri, “Yaptım”, yeniden değerlendirme sayacı. Teşhis, ilaç veya doz yok.' },
  { name: 'Vital ve kabin ölçümleri', state: 'sim', note: 'Demo senaryoları SENTETİK veri üretir. API ölçüm kabul eder (POST /v1/measurements), ama bağlı gerçek sensör yok.' },
  { name: 'Giyilebilir / kabin sensörü sürücüsü', state: 'none', note: 'Cihaz entegrasyonu yok; veri yalnız API ile gelir.' },
  { name: 'EKG şeridi', state: 'works', note: 'GERÇEK kayıt: PhysioNet MIT-BIH NSR 16265 tekrar oynatılır. Canlı değil, ritim yorumu yapılmaz, kalp hızı değeri bu kayıttan gelmez.' },
  { name: 'Laboratuvar değerleri', state: 'works', note: 'NASA OSDR içe aktarma (GERÇEK, ör. OSD-569) ve elle giriş (ELLE). Referans aralığı kaynağından gelir.' },
  { name: 'Uzay havası (güneş parçacık olayı)', state: 'works', note: 'NASA DONKI SEP olay zamanları (Mayıs 2024, depoda paketli dosya; canlı API değil). Doz değerleri SENTETİK.' },
  { name: 'Kırmızı bayrak bildirimi', state: 'works', note: 'Belirti bildirimi eşik beklemeden KRİTİK alarm ve acil kart açar.' },
  { name: 'Uçuş cerrahına otomatik yükseltme', state: 'works', note: 'Uyarı/Kritik alarm başına bir kez, kendiliğinden oluşur.' },
  { name: 'Yer ekibine paket + onay', state: 'works', note: 'Alıcıya göre paket (uçuş cerrahı, yaşam destek, radyasyon, görev kontrol); sha256 özeti, sunucu anahtarı varsa HMAC-SHA256 imza. Şifreleme yok.' },
  { name: 'Dünya bağlantısı ve ışık gecikmesi', state: 'sim', note: 'Gecikme yalnız yer konsolunda (#/yer) canlandırılır; gerçek uzay iletişimi / DTN yok.' },
  { name: 'Görev profili (ISS / Ay / Mars)', state: 'works', note: 'Tek yön gecikme ve yükseltme sorumlusu sunucudan gelir. Sunucuda uç nokta yoksa seçici devre dışı görünür.' },
  { name: 'Rol tabanlı oturum', state: 'works', note: 'İsteğe bağlı imzalı belirteç (Astronot / Ekip sağlık sorumlusu / Yer ekibi). Demo girişi yalnız sunucuda açıkça etkinse görünür.' },
  { name: 'Çevrimdışı çalışma', state: 'works', note: 'Gemide yerel sunucu + SQLite; Dünya’ya bağımlı değil. Arayüz bağlantı kesilince son bilinen veriyi etiketleyerek gösterir.' },
  { name: '3B vücut haritası', state: 'works', note: 'BodyParts3D modeli (CC BY 4.0). Bölge = kural grubu; anatomik bulgu veya teşhis değildir.' },
  { name: 'Trend ve HRV', state: 'works', note: 'Saatlik/günlük özet. HRV (RMSSD) yalnız veri: eşik ve kural yok.' },
  { name: 'Rutinler ve aktivite beyanı', state: 'works', note: 'Su, egzersiz, uyku penceresi, periyodik testler (DEMO aralıklar). İlaç rutini yok.' },
  { name: 'DEMO eşiklerin uzman doğrulaması', state: 'planned', note: 'Uçuş tıbbı uzmanı incelemesi bekliyor; o zamana kadar DEMO etiketi kalır.' },
  { name: 'Teşhis, ilaç veya doz önerisi', state: 'none', note: 'Bilinçli olarak kapsam dışı.' },
  { name: 'Araç / ekipman komutu', state: 'none', note: 'Yazılım hiçbir sistemi kendisi çalıştırmaz.' },
];
