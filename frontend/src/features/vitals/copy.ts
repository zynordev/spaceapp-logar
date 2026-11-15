// Turkish copy and level dictionaries, carried over from the old panel
// (src/spaceapp_logar/web/app.js). Colour is never the only signal: every
// level has an icon and a label too.
import type { Attention } from '../../lib/store';

export interface LevelInfo {
  label: string;
  icon: string;
  cls: string;
  rank: number;
  desc: string;
}

// rank: UNKNOWN is above NORMAL on purpose (bad data is not good health).
export const ATTENTION: Record<Attention, LevelInfo> = {
  NORMAL: { label: 'Normal', icon: '✓', cls: 'normal', rank: 1, desc: 'Etkin bir dikkat kuralı yok.' },
  UNKNOWN: { label: 'Bilinmiyor', icon: '?', cls: 'unknown', rank: 2, desc: 'Güvenilir değerlendirme için yeterli veri yok. Bu "normal" anlamına gelmez.' },
  WATCH: { label: 'İzle', icon: '!', cls: 'watch', rank: 3, desc: 'Bir ölçüm izlenmeli; acil olmayan bir yeniden kontrol gerekebilir.' },
  ALERT: { label: 'Uyarı', icon: '▲', cls: 'alert', rank: 4, desc: 'Eylem kartındaki adımlar kısa sürede uygulanmalı; görev prosedürü önceliklidir.' },
  CRITICAL: { label: 'Kritik', icon: '✖', cls: 'critical', rank: 5, desc: 'Acil prosedür hemen açılmalı ve ekip sağlık sorumlusu bilgilendirilmelidir.' },
};

export function attInfo(att: string | null | undefined): LevelInfo {
  return (att && (ATTENTION as Record<string, LevelInfo>)[att]) || ATTENTION.UNKNOWN;
}

export const QUALITY: Record<string, { label: string; icon: string; cls: string }> = {
  VALID: { label: 'Geçerli', icon: '✓', cls: 'valid' },
  SUSPECT: { label: 'Şüpheli', icon: '!', cls: 'suspect' },
  MISSING: { label: 'Eksik', icon: '∅', cls: 'missing' },
  FAULT: { label: 'Arıza', icon: '✖', cls: 'fault' },
};

export const ALERT_STATUS: Record<string, { label: string; icon: string; cls: string }> = {
  OPEN: { label: 'Açık', icon: '●', cls: 'open' },
  ACKNOWLEDGED: { label: 'Görüldü', icon: '✓', cls: 'ack' },
  RESOLVED: { label: 'Çözüldü', icon: '✓✓', cls: 'res' },
};

const COMPARISON: Record<string, string> = {
  '<': '<', '>': '>', '<=': '≤', '>=': '≥', '==': '=', LT: '<', GT: '>', LTE: '≤', GTE: '≥',
  'jump>': 'sıçrama >',
};
export const cmpSymbol = (c: string | null | undefined) => (c ? COMPARISON[c] ?? c : '');
/** Comparisons that describe a level on the metric's own axis (drawable as a line). */
export const LEVEL_COMPARISONS = new Set(['<', '>', '<=', '>=', 'LT', 'GT', 'LTE', 'GTE']);

export const TIME_SCALE: Record<string, string> = {
  acute: 'Akut',
  subacute: 'Alt akut',
  chronic: 'Kronik',
};

export const ACTIVITY: Record<string, string> = {
  REST: 'Dinlenme',
  LIGHT: 'Hafif aktivite',
  EXERCISE: 'Egzersiz',
  SLEEP: 'Uyku',
};

export const BASELINE: Record<string, { label: string; cls: string; note: string }> = {
  ESTABLISHED: {
    label: 'Kişisel başlangıç: kararlı',
    cls: 'established',
    note: 'Kural, bu kişinin yeterli örnekle oluşturulmuş başlangıç değerini kullandı.',
  },
  ESTIMATED_RESEARCH: {
    label: 'Kişisel başlangıç: tahmini',
    cls: 'estimated',
    note: 'Örnek sayısı yetersiz; kural genel referansı kullanır, kişisel değer yalnızca bilgi içindir.',
  },
};

/** Fallback rule titles when the status call has not answered yet. */
export const RULE_TITLES: Record<string, string> = {
  ENV_CO2_NOMINAL_V1: 'Kabin CO₂ nominal sınırı',
  ENV_CABIN_ATMOSPHERE_V1: 'Kabin O₂ kısmi basıncı',
  ENV_RADIATION_V1: 'Radyasyon doz hızı ve kümülatif doz',
  BEHAV_SLEEP_V1: 'Uyku borcu ve yorgunluk',
  SENS_MOTION_SICKNESS_V1: 'Hareket hastalığı örüntüsü',
  SANS_VISION_SYMPTOM_V1: 'Görme değişikliği (SANS izlemi)',
  VITAL_SPO2_SUSTAINED_V1: 'Süreli SpO₂ düşüklüğü',
  VITAL_TEMP_TREND_V1: 'Vücut sıcaklığı eğilimi',
  MULTI_CARDIO_RESP_V1: 'Dinlenme kalp + solunum + belirti',
  RED_FLAG_SYMPTOM_V1: 'Kırmızı bayrak belirtisi',
  DATA_HR_JUMP_V1: 'Kalp hızı sensör kalitesi',
};

// "Bu ölçüm neden önemli?" — general information, no diagnosis/treatment language.
export const GENERIC_NEXT = ' Ne yapılacağı için eylem kartına ve görev prosedürüne bakın.';
export const METRIC_INFO: Record<string, { why: string; watch: string }> = {
  HEART_RATE: {
    why: 'Kalp hızı dinlenme, aktivite ve stres bağlamında kardiyovasküler yükü gösterir.',
    watch: 'Dinlenmedeyken kişisel başlangıç değerinden belirgin ve süreli sapma ya da eşlik eden belirtiler olduğunda.',
  },
  SPO2: {
    why: 'SpO₂, kandaki oksijen satürasyonunun parmak/kulak sensörüyle tahmin edilen yüzdesidir.',
    watch: 'Değer belirlenen eşiğin altında bir süre kaldığında; sensör hatası olasılığı için ölçüm tekrarlanmalıdır.',
  },
  RESPIRATION_RATE: {
    why: 'Solunum hızı, dakikadaki nefes sayısıdır ve fiziksel yük ile ortam koşullarına duyarlıdır.',
    watch: 'Dinlenmedeyken süreli yükselme, özellikle kalp hızı veya belirtilerle birlikte görüldüğünde.',
  },
  BODY_TEMPERATURE: {
    why: 'Vücut sıcaklığı, kişisel başlangıca göre süreli değişimi izlemek için kullanılır.',
    watch: 'Tek ölçüm yerine, kişisel başlangıçtan süreli sapma görüldüğünde.',
  },
  SYSTOLIC_BP: {
    why: 'Sistolik tansiyon, kalp atarken damarlardaki basıncı gösterir.',
    watch: 'Kişisel başlangıçtan süreli sapma ya da eşlik eden belirtiler olduğunda.',
  },
  DIASTOLIC_BP: {
    why: 'Diyastolik tansiyon, kalp dinlenirken damarlardaki basıncı gösterir.',
    watch: 'Kişisel başlangıçtan süreli sapma ya da eşlik eden belirtiler olduğunda.',
  },
  SLEEP_DURATION: {
    why: 'Uyku süresi, toparlanma ve performans bağlamında yorgunluk yükünü anlamaya yardım eder.',
    watch: 'Birkaç gece üst üste kişisel düzenin belirgin altında kalındığında.',
  },
  HRV_RMSSD: {
    why: 'Kalp hızı değişkenliği (RMSSD), ardışık kalp atımları arasındaki sürelerin değişimidir; toparlanma ve stres yükü hakkında bağlam verir.',
    watch: 'Bu sürümde HRV için kural veya eşik yoktur; yalnızca kişisel eğilim olarak izlenir.',
  },
  CABIN_CO2_PARTIAL_PRESSURE: {
    why: 'Kabin CO₂ kısmi basıncı, havalandırma ve yaşam destek sisteminin etkinliğini yansıtan çevre ölçümüdür.',
    watch: 'Saatlik ortalama nominal habitat sınırını aştığında ve baş ağrısı gibi öznel belirtiler eşlik ettiğinde.',
  },
  CABIN_O2_FRACTION: {
    why: 'Kabin O₂ oranı, solunan havadaki oksijen payını gösterir.',
    watch: 'Görev için tanımlı aralığın dışına çıktığında.',
  },
  CABIN_PRESSURE: {
    why: 'Kabin basıncı, habitatın yapısal ve solunum güvenliği için temel çevre ölçümüdür.',
    watch: 'Görev için tanımlı aralıktan sapma ya da beklenmeyen düşüş eğilimi görüldüğünde.',
  },
  RADIATION_DOSE_RATE: {
    why: 'Radyasyon doz hızı, ortamdaki iyonlaştırıcı radyasyon düzeyini ve birikimli maruziyeti izlemeye yarar.',
    watch: 'Doz hızı beklenen düzeyin üzerine çıktığında veya görev uyarıları verildiğinde.',
  },
};

/** Used before /v1/metrics answers (labels normally come from the API). */
export const FALLBACK_METRICS = [
  { metric: 'HEART_RATE', label: 'Kalp hızı', unit: 'bpm', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'SPO2', label: 'SpO₂', unit: '%', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'RESPIRATION_RATE', label: 'Solunum hızı', unit: 'breaths/min', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'BODY_TEMPERATURE', label: 'Vücut sıcaklığı', unit: '°C', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'SYSTOLIC_BP', label: 'Sistolik tansiyon', unit: 'mmHg', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'DIASTOLIC_BP', label: 'Diyastolik tansiyon', unit: 'mmHg', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'SLEEP_DURATION', label: 'Uyku süresi', unit: 'h', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'CABIN_CO2_PARTIAL_PRESSURE', label: 'Kabin CO₂', unit: 'mmHg', target_type: 'ENVIRONMENT', category: 'environment' },
  { metric: 'CABIN_O2_FRACTION', label: 'Kabin O₂', unit: '%', target_type: 'ENVIRONMENT', category: 'environment' },
  { metric: 'CABIN_PRESSURE', label: 'Kabin basıncı', unit: 'kPa', target_type: 'ENVIRONMENT', category: 'environment' },
  { metric: 'RADIATION_DOSE_RATE', label: 'Radyasyon doz hızı', unit: 'uSv/h', target_type: 'ENVIRONMENT', category: 'environment' },
] as const;

/** Display units: the API keeps ASCII units ("uSv/h"); show the proper symbol. */
export function displayUnit(unit: string | null | undefined): string {
  if (!unit) return '';
  if (unit === 'uSv/h') return 'µSv/h';
  if (unit === 'breaths/min') return '/dk';
  return unit;
}
