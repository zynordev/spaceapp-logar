// Local fixture for `?mock=1` so the ground panel can be previewed before the
// sync API (contract section E) is merged. Shapes follow the contract exactly.
// `&mock409=1` makes the ack return 409, `&mock403=1` returns 403.
import { ApiError } from '../../lib/api';
import type {
  CoverageRead,
  EscalationRead,
  PacketItem,
  Recipient,
  SyncAckBody,
  SyncAckRead,
  SyncPacketRead,
  SyncStatusRead,
} from './types';
import { RECIPIENTS } from './types';

function param(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export function isMock(): boolean {
  return param('mock') === '1';
}

export const MOCK_MISSION_ID = 'mock-mars-transit';

const LABELS: Record<Recipient, string> = {
  FLIGHT_SURGEON: 'Uçuş cerrahı',
  LIFE_SUPPORT: 'Yaşam destek',
  RADIATION: 'Radyasyon',
  MISSION_CONTROL: 'Görev kontrol',
};

/** Deterministic 64-hex pseudo hash (fixture only — not a real SHA-256). */
function fakeHash(seed: string): string {
  let out = '';
  let h = 2166136261;
  for (let round = 0; out.length < 64; round++) {
    for (const c of `${seed}:${round}`) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

interface MockState {
  started: number;
  pending: Record<Recipient, number>;
  lastAck: Record<Recipient, string | null>;
  lastPacket: Record<Recipient, string | null>;
  escalations: EscalationRead[];
  packets: Map<string, { recipient: Recipient; sha256: string }>;
}

let state: MockState | null = null;

function s(): MockState {
  if (state) return state;
  const escalations: EscalationRead[] = [
    {
      id: 'esc-0001',
      mission_id: MOCK_MISSION_ID,
      alert_id: 'alert-red-flag-0001',
      crew_member_id: 'crew-ayse',
      priority: 'CRITICAL',
      status: 'PENDING',
      created_at: minutesAgo(7),
      acked_at: null,
      summary_tr: 'Kırmızı bayrak: göğüs ağrısı bildirildi — Kritik. Görev prosedürü ve uçuş cerrahı yönlendirmesi gerekir.',
      packet_sha256: fakeHash('esc-0001'),
    },
    {
      id: 'esc-0002',
      mission_id: MOCK_MISSION_ID,
      alert_id: 'alert-spo2-0002',
      crew_member_id: 'crew-mert',
      priority: 'ALERT',
      status: 'PENDING',
      created_at: minutesAgo(23),
      acked_at: null,
      summary_tr: 'SpO₂ 10 dakikadır kişisel başlangıcın altında (%91) — Uyarı.',
      packet_sha256: fakeHash('esc-0002'),
    },
    {
      id: 'esc-0003',
      mission_id: MOCK_MISSION_ID,
      alert_id: 'alert-co2-0003',
      crew_member_id: null,
      priority: 'ALERT',
      status: 'ACKED',
      created_at: minutesAgo(190),
      acked_at: minutesAgo(150),
      summary_tr: 'Laboratuvar modülünde kabin CO₂ nominal sınırın üzerinde — Uyarı.',
      packet_sha256: fakeHash('esc-0003'),
    },
  ];
  state = {
    started: Date.now(),
    pending: { FLIGHT_SURGEON: 9, LIFE_SUPPORT: 4, RADIATION: 2, MISSION_CONTROL: 6 },
    lastAck: {
      FLIGHT_SURGEON: minutesAgo(150),
      LIFE_SUPPORT: minutesAgo(62),
      RADIATION: null,
      MISSION_CONTROL: minutesAgo(305),
    },
    lastPacket: { FLIGHT_SURGEON: 'pkt-prev-fs', LIFE_SUPPORT: 'pkt-prev-ls', RADIATION: null, MISSION_CONTROL: 'pkt-prev-mc' },
    escalations,
    packets: new Map(),
  };
  return state;
}

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export async function mockStatus(): Promise<SyncStatusRead> {
  await delay(120);
  const st = s();
  return {
    mission_id: MOCK_MISSION_ID,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    link_delay_seconds: param('nodelay') === '1' ? null : 750,
    recipients: RECIPIENTS.map((r) => ({
      recipient: r,
      label_tr: LABELS[r],
      pending_items: st.pending[r],
      last_ack_at: st.lastAck[r],
      last_packet_id: st.lastPacket[r],
    })),
    pending_escalations: st.escalations.filter((e) => e.status === 'PENDING').length,
  };
}

export async function mockEscalations(): Promise<EscalationRead[]> {
  await delay(120);
  return s().escalations.map((e) => ({ ...e }));
}

const ITEM_TEMPLATES: Record<Recipient, Omit<PacketItem, 'id' | 'occurred_at'>[]> = {
  FLIGHT_SURGEON: [
    { kind: 'ESCALATION', summary_tr: 'Öncelikli bildirim: göğüs ağrısı (Kritik)', data: { priority: 'CRITICAL' } },
    { kind: 'RED_FLAG', summary_tr: 'Kırmızı bayrak: göğüs ağrısı', data: { symptom: 'CHEST_PAIN' } },
    { kind: 'ESCALATION', summary_tr: 'Öncelikli bildirim: SpO₂ düşüşü (Uyarı)', data: { priority: 'ALERT' } },
    { kind: 'ALERT', summary_tr: 'SpO₂ sürekli düşük — Uyarı', data: { rule_id: 'VITAL_SPO2_SUSTAINED_V1' } },
    { kind: 'RULE_EVALUATION', summary_tr: 'Vücut sıcaklığı eğilimi — Normal', data: { rule_id: 'VITAL_TEMP_TREND_V1' } },
    { kind: 'CHECK_IN', summary_tr: 'Öznel bildirim: yorgunluk 3/5, uyku 5,5 sa', data: {} },
    { kind: 'LAB_RESULT', summary_tr: 'WBC 6,1 ×10⁹/L (bilgi amaçlı)', data: { analyte: 'WBC' } },
    { kind: 'TREND', summary_tr: 'Dinlenme kalp hızı 24 sa ortalaması 68 bpm', data: { metric: 'HEART_RATE' } },
    { kind: 'RULE_EVALUATION', summary_tr: 'Uyku ve yorgunluk — İzle', data: { rule_id: 'BEHAV_SLEEP_V1' } },
  ],
  LIFE_SUPPORT: [
    { kind: 'ALERT', summary_tr: 'Kabin CO₂ nominal sınırın üzerinde (lab modülü)', data: { rule_id: 'ENV_CO2_NOMINAL_V1' } },
    { kind: 'RULE_EVALUATION', summary_tr: 'Kabin O₂ kısmi basıncı — Normal', data: { rule_id: 'ENV_CABIN_ATMOSPHERE_V1' } },
    { kind: 'TREND', summary_tr: 'Kabin CO₂ saatlik ortalama 3,1 mmHg', data: { metric: 'CO2' } },
    { kind: 'TREND', summary_tr: 'Kabin basıncı 101,2 kPa sabit', data: { metric: 'CABIN_PRESSURE' } },
  ],
  RADIATION: [
    { kind: 'RULE_EVALUATION', summary_tr: 'Doz hızı modül başlangıcında — Normal', data: { rule_id: 'ENV_RADIATION_V1' } },
    { kind: 'TREND', summary_tr: 'Kümülatif doz günlük artış 0,46 mGy', data: { metric: 'RADIATION_DOSE_RATE' } },
  ],
  MISSION_CONTROL: [
    { kind: 'ESCALATION', summary_tr: 'Öncelikli bildirim kopyası: göğüs ağrısı (Kritik)', data: {} },
    { kind: 'ALERT', summary_tr: 'SpO₂ sürekli düşük — Uyarı', data: {} },
    { kind: 'ALERT', summary_tr: 'Kabin CO₂ nominal sınırın üzerinde', data: {} },
    { kind: 'RULE_EVALUATION', summary_tr: 'Genel durum: 1 Kritik, 1 Uyarı', data: {} },
    { kind: 'TREND', summary_tr: 'Ekip check-in uyumu %83', data: {} },
    { kind: 'CHECK_IN', summary_tr: 'Günlük öznel bildirim özeti', data: {} },
  ],
};

export async function mockPacket(recipient: Recipient): Promise<SyncPacketRead> {
  await delay(400);
  const st = s();
  const n = st.pending[recipient];
  const templates = ITEM_TEMPLATES[recipient];
  const items: PacketItem[] = Array.from({ length: n }, (_, i) => ({
    ...templates[i % templates.length],
    id: `item-${recipient.toLowerCase()}-${i + 1}`,
    occurred_at: minutesAgo(5 + i * 11),
  }));
  const packetId = `pkt-${recipient.toLowerCase()}-${Date.now().toString(36)}`;
  const sha256 = fakeHash(`${packetId}:${n}`);
  st.packets.set(packetId, { recipient, sha256 });
  const signed = recipient !== 'RADIATION';
  return {
    packet_id: packetId,
    mission_id: MOCK_MISSION_ID,
    recipient,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    since: st.lastAck[recipient],
    until: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    item_count: items.length,
    items,
    sha256,
    signature: signed ? fakeHash(`sig:${sha256}`) : null,
    signature_alg: signed ? 'HMAC-SHA256' : null,
  };
}

export async function mockAck(body: SyncAckBody): Promise<SyncAckRead> {
  await delay(500);
  const st = s();
  if (param('mock403') === '1') throw new ApiError('Yalnız yer ekibi onaylayabilir', 403, 'FORBIDDEN');
  const known = st.packets.get(body.packet_id);
  if (param('mock409') === '1' || !known || known.sha256 !== body.sha256) {
    throw new ApiError('Paket özeti eşleşmiyor', 409, 'CONFLICT');
  }
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  st.pending[body.recipient] = 0;
  st.lastAck[body.recipient] = now;
  st.lastPacket[body.recipient] = body.packet_id;
  if (body.recipient === 'FLIGHT_SURGEON') {
    for (const e of st.escalations) {
      if (e.status === 'PENDING') {
        e.status = 'ACKED';
        e.acked_at = now;
      }
    }
  }
  return { ...body, id: `ack-${Date.now().toString(36)}`, acked_at: now, acked_by: 'demo-ground' };
}

/** Compact copy of GET /v1/risk-coverage, used only if the live call fails in mock mode. */
export const MOCK_COVERAGE: CoverageRead = (() => {
  const r = (
    key: string,
    title_tr: string,
    coverage: 'RULE' | 'DATA_ONLY' | 'GAP',
    indicators_tr: string[],
    rules: [string, string][],
    note_tr: string,
  ) => ({
    key,
    title_tr,
    coverage,
    indicators_tr,
    rules: rules.map(([rule_id, title]) => ({ rule_id, title, validation_status: 'DEMO_PENDING_REVIEW' })),
    note_tr,
  });
  const hazards = [
    {
      key: 'RADIATION',
      title_tr: 'Uzay radyasyonu',
      risks: [
        r('acute_radiation', 'Ani yüksek maruziyet (güneş parçacık olayı)', 'RULE', ['Radyasyon doz hızı'], [['ENV_RADIATION_V1', 'Radyasyon doz hızı ve kümülatif doz']], 'Modülün kendi başlangıcına göre ani artış.'),
        r('cumulative_radiation', 'Kümülatif doz', 'RULE', ['Radyasyon doz hızı (zamana göre toplam)'], [['ENV_RADIATION_V1', 'Radyasyon doz hızı ve kümülatif doz']], 'Uzun dönem risk tahmini yapılmaz.'),
      ],
    },
    {
      key: 'ISOLATION',
      title_tr: 'İzolasyon ve kapalı kalma',
      risks: [
        r('sleep_circadian', 'Uyku kaybı ve sirkadiyen bozulma', 'RULE', ['Uyku süresi', 'Yorgunluk (öznel)'], [['BEHAV_SLEEP_V1', 'Uyku ve yorgunluk']], 'Uyku kalitesi ölçülmüyor.'),
        r('behavioral_health', 'Davranışsal sağlık ve ruh hali', 'RULE', ['Ruh hali sıkıntısı (öznel)'], [['BEHAV_SLEEP_V1', 'Uyku ve yorgunluk']], 'Ayrı bir ruh hali kuralı yok.'),
        r('team_performance', 'Ekip uyumu ve performans', 'GAP', [], [], 'Ölçülmüyor.'),
      ],
    },
    {
      key: 'DISTANCE',
      title_tr: "Dünya'dan uzaklık",
      risks: [
        r('in_mission_emergency', 'Görev sırasında acil tıbbi durumlar', 'RULE', ['Kırmızı bayrak belirtileri'], [['RED_FLAG_SYMPTOM_V1', 'Kırmızı bayrak belirtisi']], 'Teşhis yok.'),
        r('infection_immune', 'Bağışıklık değişimi ve enfeksiyon', 'RULE', ['Vücut sıcaklığı', 'WBC (laboratuvar)'], [['VITAL_TEMP_TREND_V1', 'Sıcaklık eğilimi']], 'Laboratuvar yalnızca bilgi.'),
        r('limited_medical_care', 'Sınırlı tıbbi imkân ve iletişim gecikmesi', 'GAP', [], [], 'Ortam bağlamı işi sürüyor.'),
      ],
    },
    {
      key: 'GRAVITY',
      title_tr: 'Değişen yerçekimi alanları',
      risks: [
        r('space_motion_sickness', 'Uzay hareket hastalığı', 'RULE', ['Bulantı', 'Baş dönmesi'], [['SENS_MOTION_SICKNESS_V1', 'Hareket hastalığı']], 'Belirti örüntüsü.'),
        r('sans', 'SANS (nöro-oküler sendrom)', 'RULE', ['Görme değişikliği (öznel)'], [['SANS_VISION_SYMPTOM_V1', 'Görme belirtisi']], 'Göz muayenesi verisi yok.'),
        r('cardiovascular_orthostatic', 'Kalp-damar uyumu', 'DATA_ONLY', ['Kalp hızı', 'Tansiyon'], [], 'Doğrulanmış eşik gerekiyor.'),
        r('fluid_shift', 'Sıvı kayması', 'DATA_ONLY', ['Burun tıkanıklığı (öznel)'], [], 'Kural yok.'),
        r('spine_back_pain', 'Omurga uzaması ve sırt ağrısı', 'DATA_ONLY', ['Sırt ağrısı (öznel)'], [], 'Kural yok.'),
        r('muscle_aerobic', 'Kas kaybı ve aerobik kapasite', 'GAP', [], [], 'Ölçülmüyor.'),
        r('bone_kidney', 'Kemik kaybı ve böbrek taşı', 'GAP', [], [], 'Ölçülmüyor.'),
      ],
    },
    {
      key: 'HOSTILE_ENVIRONMENT',
      title_tr: 'Kapalı ve düşmanca ortam',
      risks: [
        r('cabin_co2', 'Kabin CO₂ birikimi', 'RULE', ['Kabin CO₂'], [['ENV_CO2_NOMINAL_V1', 'CO₂ nominal sınır']], 'NASA-STD-3001 nominal sınırı.'),
        r('hypoxia', 'Düşük oksijen (hipoksi)', 'RULE', ['Kabin O₂', 'SpO₂'], [['VITAL_SPO2_SUSTAINED_V1', 'SpO₂ sürekli düşük']], 'Birlikte izlenir.'),
        r('decompression', 'Dekompresyon hastalığı', 'DATA_ONLY', ['Kabin basıncı'], [], 'EVA bağlamı yok.'),
        r('celestial_dust', 'Ay/Mars tozu maruziyeti', 'GAP', [], [], 'Toz sensörü yok.'),
        r('noise_hearing', 'Gürültü ve işitme kaybı', 'GAP', [], [], 'Gürültü ölçümü yok.'),
      ],
    },
    {
      key: 'DATA',
      title_tr: 'Kesitler arası: veri güvenilirliği',
      risks: [
        r('sensor_reliability', 'Sensör hatası ile sağlık sorununu ayırmak', 'RULE', ['Kaynak kalite bayrağı'], [['DATA_HR_JUMP_V1', 'Kalp hızı sıçraması']], "Kötü veri genel durumu 'Bilinmiyor' yapar."),
      ],
    },
  ];
  const summary = { RULE: 0, DATA_ONLY: 0, GAP: 0 } as Record<string, number>;
  for (const h of hazards) for (const k of h.risks) summary[k.coverage] += 1;
  return { hazards, summary, note_tr: 'Yerel örnek veri (?mock=1) — canlı /v1/risk-coverage yanıtı alınamadı.' };
})();
