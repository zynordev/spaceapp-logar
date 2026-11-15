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
  FLIGHT_SURGEON: 'Flight surgeon',
  LIFE_SUPPORT: 'Life support',
  RADIATION: 'Radyasyon',
  MISSION_CONTROL: 'Mission control',
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
      summary_tr: 'Red flag: chest pain reported — Critical. Mission procedure and flight surgeon guidance are needed.',
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
      summary_tr: 'SpO₂ below personal baseline for 10 minutes (91%) — Warning.',
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
      summary_tr: 'Cabin CO₂ above the nominal limit in the lab module — Warning.',
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
    { kind: 'ESCALATION', summary_tr: 'Priority notification: chest pain (Critical)', data: { priority: 'CRITICAL' } },
    { kind: 'RED_FLAG', summary_tr: 'Red flag: chest pain', data: { symptom: 'CHEST_PAIN' } },
    { kind: 'ESCALATION', summary_tr: 'Priority notification: SpO₂ drop (Warning)', data: { priority: 'ALERT' } },
    { kind: 'ALERT', summary_tr: 'Sustained low SpO₂ — Warning', data: { rule_id: 'VITAL_SPO2_SUSTAINED_V1' } },
    { kind: 'RULE_EVALUATION', summary_tr: 'Body temperature trend — Normal', data: { rule_id: 'VITAL_TEMP_TREND_V1' } },
    { kind: 'CHECK_IN', summary_tr: 'Subjective report: fatigue 3/5, sleep 5.5 h', data: {} },
    { kind: 'LAB_RESULT', summary_tr: 'WBC 6.1 ×10⁹/L (for information only)', data: { analyte: 'WBC' } },
    { kind: 'TREND', summary_tr: 'Resting heart rate 24 h average 68 bpm', data: { metric: 'HEART_RATE' } },
    { kind: 'RULE_EVALUATION', summary_tr: 'Sleep and fatigue — Watch', data: { rule_id: 'BEHAV_SLEEP_V1' } },
  ],
  LIFE_SUPPORT: [
    { kind: 'ALERT', summary_tr: 'Cabin CO₂ above nominal limit (lab module)', data: { rule_id: 'ENV_CO2_NOMINAL_V1' } },
    { kind: 'RULE_EVALUATION', summary_tr: 'Cabin O₂ partial pressure — Normal', data: { rule_id: 'ENV_CABIN_ATMOSPHERE_V1' } },
    { kind: 'TREND', summary_tr: 'Kabin CO₂ saatlik ortalama 3,1 mmHg', data: { metric: 'CO2' } },
    { kind: 'TREND', summary_tr: 'Cabin pressure 101.2 kPa stable', data: { metric: 'CABIN_PRESSURE' } },
  ],
  RADIATION: [
    { kind: 'RULE_EVALUATION', summary_tr: 'Dose rate at module baseline — Normal', data: { rule_id: 'ENV_RADIATION_V1' } },
    { kind: 'TREND', summary_tr: 'Cumulative dose daily increase 0.46 mGy', data: { metric: 'RADIATION_DOSE_RATE' } },
  ],
  MISSION_CONTROL: [
    { kind: 'ESCALATION', summary_tr: 'Priority notification copy: chest pain (Critical)', data: {} },
    { kind: 'ALERT', summary_tr: 'Sustained low SpO₂ — Warning', data: {} },
    { kind: 'ALERT', summary_tr: 'Cabin CO₂ above nominal limit', data: {} },
    { kind: 'RULE_EVALUATION', summary_tr: 'Overall status: 1 Critical, 1 Warning', data: {} },
    { kind: 'TREND', summary_tr: 'Crew check-in compliance 83%', data: {} },
    { kind: 'CHECK_IN', summary_tr: 'Daily subjective report summary', data: {} },
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
  if (param('mock403') === '1') throw new ApiError('Only the ground team can acknowledge', 403, 'FORBIDDEN');
  const known = st.packets.get(body.packet_id);
  if (param('mock409') === '1' || !known || known.sha256 !== body.sha256) {
    throw new ApiError('Packet digest does not match', 409, 'CONFLICT');
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
        r('acute_radiation', 'Acute high exposure (solar particle event)', 'RULE', ['Radiation dose rate'], [['ENV_RADIATION_V1', 'Radiation dose rate and cumulative dose']], 'Sudden rise relative to the module baseline.'),
        r('cumulative_radiation', 'Cumulative dose', 'RULE', ['Radiation dose rate (total over time)'], [['ENV_RADIATION_V1', 'Radiation dose rate and cumulative dose']], 'No long-term risk prediction is made.'),
      ],
    },
    {
      key: 'ISOLATION',
      title_tr: 'Isolation and confinement',
      risks: [
        r('sleep_circadian', 'Sleep loss and circadian disruption', 'RULE', ['Sleep duration', 'Fatigue (subjective)'], [['BEHAV_SLEEP_V1', 'Uyku ve yorgunluk']], 'Sleep quality is not measured.'),
        r('behavioral_health', 'Behavioural health and mood', 'RULE', ['Mood distress (subjective)'], [['BEHAV_SLEEP_V1', 'Uyku ve yorgunluk']], 'No separate mood rule.'),
        r('team_performance', 'Crew cohesion and performance', 'GAP', [], [], 'Not measured.'),
      ],
    },
    {
      key: 'DISTANCE',
      title_tr: "Distance from Earth",
      risks: [
        r('in_mission_emergency', 'Emergency medical conditions during the mission', 'RULE', ['Red flag symptoms'], [['RED_FLAG_SYMPTOM_V1', 'Red flag symptom']], 'No diagnosis.'),
        r('infection_immune', 'Immune change and infection', 'RULE', ['Body temperature', 'WBC (laboratory)'], [['VITAL_TEMP_TREND_V1', 'Temperature trend']], 'Laboratory data is for information only.'),
        r('limited_medical_care', 'Limited medical capability and communication delay', 'GAP', [], [], 'Environment context work in progress.'),
      ],
    },
    {
      key: 'GRAVITY',
      title_tr: 'Changing gravity fields',
      risks: [
        r('space_motion_sickness', 'Space motion sickness', 'RULE', ['Nausea', 'Dizziness'], [['SENS_MOTION_SICKNESS_V1', 'Motion sickness']], 'Symptom pattern.'),
        r('sans', 'SANS (neuro-ocular syndrome)', 'RULE', ['Vision change (subjective)'], [['SANS_VISION_SYMPTOM_V1', 'Vision symptom']], 'No eye examination data.'),
        r('cardiovascular_orthostatic', 'Cardiovascular adaptation', 'DATA_ONLY', ['Heart rate', 'Blood pressure'], [], 'A validated threshold is needed.'),
        r('fluid_shift', 'Fluid shift', 'DATA_ONLY', ['Nasal congestion (subjective)'], [], 'No rule.'),
        r('spine_back_pain', 'Spinal elongation and back pain', 'DATA_ONLY', ['Back pain (subjective)'], [], 'No rule.'),
        r('muscle_aerobic', 'Muscle loss and aerobic capacity', 'GAP', [], [], 'Not measured.'),
        r('bone_kidney', 'Bone loss and kidney stones', 'GAP', [], [], 'Not measured.'),
      ],
    },
    {
      key: 'HOSTILE_ENVIRONMENT',
      title_tr: 'Confined and hostile environment',
      risks: [
        r('cabin_co2', 'Cabin CO₂ build-up', 'RULE', ['Cabin CO₂'], [['ENV_CO2_NOMINAL_V1', 'CO₂ nominal limit']], 'NASA-STD-3001 nominal limit.'),
        r('hypoxia', 'Low oxygen (hypoxia)', 'RULE', ['Cabin O₂', 'SpO₂'], [['VITAL_SPO2_SUSTAINED_V1', 'SpO₂ persistently low']], 'Monitored together.'),
        r('decompression', 'Decompression sickness', 'DATA_ONLY', ['Cabin pressure'], [], 'No EVA context.'),
        r('celestial_dust', 'Lunar/Martian dust exposure', 'GAP', [], [], 'No dust sensor.'),
        r('noise_hearing', 'Noise and hearing loss', 'GAP', [], [], 'No noise measurement.'),
      ],
    },
    {
      key: 'DATA',
      title_tr: 'Across sections: data reliability',
      risks: [
        r('sensor_reliability', 'Separating sensor fault from health problem', 'RULE', ['Source quality flag'], [['DATA_HR_JUMP_V1', 'Heart rate jump']], "Bad data makes the overall status 'Unknown'."),
      ],
    },
  ];
  const summary = { RULE: 0, DATA_ONLY: 0, GAP: 0 } as Record<string, number>;
  for (const h of hazards) for (const k of h.risks) summary[k.coverage] += 1;
  return { hazards, summary, note_tr: 'Local sample data (?mock=1) — live /v1/risk-coverage response could not be loaded.' };
})();
