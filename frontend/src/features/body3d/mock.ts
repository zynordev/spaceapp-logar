// Local demo fixture built from contract C. Used with `?mock=1`, when the
// backend has no body-map endpoint yet (404), or when the user asks for it.
// Clearly labelled as DEMO in the UI — never mixed with live data.
import type { BodyMapRead, BodyRegionRead } from './types';

function ago(minutes: number, now: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

export function buildMockBodyMap(crewId: string | null, missionId: string | null): BodyMapRead {
  const now = Date.now();
  const regions: BodyRegionRead[] = [
    {
      region: 'head',
      label_tr: 'Baş / Beyin',
      description_tr: 'Uyku süresi ve bilişsel durum. Uyku verisi var, ancak bu demo kayıtta son gece eksik.',
      attention: 'UNKNOWN',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'BEHAV_SLEEP_V1',
          title: 'Uyku süresi',
          health_attention: 'UNKNOWN',
          data_quality: 'MISSING',
          explanation: 'Son 24 saatte uyku kaydı yok; değerlendirme yapılamadı.',
        },
      ],
      metrics: ['SLEEP_DURATION'],
      latest_values: [
        { metric: 'SLEEP_DURATION', label: 'Uyku süresi', value: 6.1, unit: 'saat', observed_at: ago(26 * 60, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'eyes',
      label_tr: 'Gözler',
      description_tr: 'Görme bulanıklığı gibi belirtiler (uzay uçuşuna bağlı göz sendromu, SANS).',
      attention: 'WATCH',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'SANS_VISION_SYMPTOM_V1',
          title: 'Görme belirtisi bildirimi',
          health_attention: 'WATCH',
          data_quality: 'VALID',
          explanation: 'Check-in formunda "yakını görmekte zorlanma" bildirildi. Bir sonraki göz testinde kontrol edin.',
        },
      ],
      metrics: ['VISION_SYMPTOM'],
      latest_values: [
        { metric: 'VISION_SYMPTOM', label: 'Görme belirtisi', value: 'Hafif', unit: null, observed_at: ago(95, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'inner_ear',
      label_tr: 'İç kulak / Denge',
      description_tr: 'Hareket hastalığı ve baş dönmesi.',
      attention: 'NORMAL',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'SENS_MOTION_SICKNESS_V1',
          title: 'Hareket hastalığı',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'Son check-in\'de bulantı veya baş dönmesi bildirilmedi.',
        },
      ],
      metrics: ['MOTION_SICKNESS'],
      latest_values: [
        { metric: 'MOTION_SICKNESS', label: 'Bulantı skoru', value: 0, unit: '/10', observed_at: ago(95, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'heart',
      label_tr: 'Kalp',
      description_tr: 'Nabız ve kalp-solunum birlikte değerlendiriliyor.',
      attention: 'ALERT',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'MULTI_CARDIO_RESP_V1',
          title: 'Nabız + solunum birlikte yüksek',
          health_attention: 'ALERT',
          data_quality: 'VALID',
          explanation: 'Dinlenme beyanı varken nabız 10 dakikadır 118/dk ve solunum hızı 24/dk. Eylem kartını açın.',
        },
        {
          rule_id: 'DATA_HR_JUMP_V1',
          title: 'Nabız ölçüm sıçraması',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'Ani, fizyolojik olmayan sıçrama görülmedi; sensör verisi tutarlı.',
        },
      ],
      metrics: ['HEART_RATE', 'HRV_RMSSD'],
      latest_values: [
        { metric: 'HEART_RATE', label: 'Nabız', value: 118, unit: '/dk', observed_at: ago(1, now) },
        { metric: 'HRV_RMSSD', label: 'Kalp hızı değişkenliği', value: 21, unit: 'ms', observed_at: ago(4, now) },
      ],
      open_alert_ids: ['8d7e6c1a-0000-4000-8000-000000000001'],
    },
    {
      region: 'lungs',
      label_tr: 'Akciğerler',
      description_tr: 'Kandaki oksijen (SpO₂) ve solunum hızı.',
      attention: 'WATCH',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'VITAL_SPO2_SUSTAINED_V1',
          title: 'Kan oksijeni düşüklüğü',
          health_attention: 'WATCH',
          data_quality: 'VALID',
          explanation: 'SpO₂ 5 dakikadır %93 — eşiğin hemen altında. Sensörün parmağa oturduğunu kontrol edin.',
        },
      ],
      metrics: ['SPO2', 'RESPIRATION_RATE'],
      latest_values: [
        { metric: 'SPO2', label: 'Kan oksijeni', value: 93, unit: '%', observed_at: ago(1, now) },
        { metric: 'RESPIRATION_RATE', label: 'Solunum hızı', value: 24, unit: '/dk', observed_at: ago(1, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'torso',
      label_tr: 'Gövde / Karın',
      description_tr: 'Sindirim, sıvı dengesi ve karın belirtileri.',
      attention: 'UNKNOWN',
      coverage: 'GAP',
      rules: [],
      metrics: [],
      latest_values: [],
      open_alert_ids: [],
    },
    {
      region: 'musculoskeletal',
      label_tr: 'Kas-iskelet',
      description_tr: 'Kemik kaybı ve kas gücü. Haftalık kavrama gücü ve vücut kütlesi ölçümleri.',
      attention: 'UNKNOWN',
      coverage: 'DATA_ONLY',
      rules: [],
      metrics: ['BODY_MASS', 'GRIP_STRENGTH'],
      latest_values: [
        { metric: 'BODY_MASS', label: 'Vücut kütlesi', value: 71.4, unit: 'kg', observed_at: ago(3 * 24 * 60, now) },
        { metric: 'GRIP_STRENGTH', label: 'Kavrama gücü', value: 38, unit: 'kg', observed_at: ago(3 * 24 * 60, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'skin',
      label_tr: 'Deri / Vücut ısısı',
      description_tr: 'Vücut sıcaklığı eğilimi.',
      attention: 'NORMAL',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'VITAL_TEMP_TREND_V1',
          title: 'Vücut sıcaklığı eğilimi',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'Sıcaklık 36,8 °C ve son 6 saatte artış eğilimi yok.',
        },
      ],
      metrics: ['BODY_TEMPERATURE'],
      latest_values: [
        { metric: 'BODY_TEMPERATURE', label: 'Vücut sıcaklığı', value: 36.8, unit: '°C', observed_at: ago(6, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'cabin',
      label_tr: 'Kabin ortamı',
      description_tr: 'Yaşam alanı havası: CO₂, O₂, basınç ve radyasyon.',
      attention: 'CRITICAL',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'ENV_CO2_NOMINAL_V1',
          title: 'Kabin CO₂ seviyesi',
          health_attention: 'CRITICAL',
          data_quality: 'VALID',
          explanation: 'CO₂ 15 dakikadır 8,2 mmHg — kritik eşiğin üstünde. Havalandırmayı kontrol edin, yer ekibine bildirin.',
        },
        {
          rule_id: 'ENV_CABIN_ATMOSPHERE_V1',
          title: 'Kabin basıncı ve O₂',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'Basınç 101,2 kPa, O₂ %20,9 — beklenen aralıkta.',
        },
        {
          rule_id: 'ENV_RADIATION_V1',
          title: 'Radyasyon doz hızı',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'Doz hızı olağan arka plan seviyesinde.',
        },
      ],
      metrics: ['CO2_PARTIAL_PRESSURE', 'CABIN_PRESSURE', 'O2_PERCENT', 'RADIATION_DOSE_RATE'],
      latest_values: [
        { metric: 'CO2_PARTIAL_PRESSURE', label: 'CO₂', value: 8.2, unit: 'mmHg', observed_at: ago(0.5, now) },
        { metric: 'CABIN_PRESSURE', label: 'Kabin basıncı', value: 101.2, unit: 'kPa', observed_at: ago(2, now) },
        { metric: 'O2_PERCENT', label: 'O₂', value: 20.9, unit: '%', observed_at: ago(2, now) },
        { metric: 'RADIATION_DOSE_RATE', label: 'Radyasyon', value: 0.34, unit: 'mGy/gün', observed_at: ago(30, now) },
      ],
      open_alert_ids: ['8d7e6c1a-0000-4000-8000-000000000002', '8d7e6c1a-0000-4000-8000-000000000003'],
    },
  ];
  return {
    mission_id: missionId ?? 'demo-mission',
    crew_member_id: crewId ?? 'demo-crew',
    generated_at: new Date(now).toISOString(),
    overall_attention: 'CRITICAL',
    regions,
  };
}
