// Turkish copy and level dictionaries, carried over from the old panel
// (src/spaceapp_logar/web/app.js). Colour is never the only signal: every
// level has an icon and a label too.
import type { Attention } from '../../lib/store';
import type { IconName } from '../../ui';

export interface LevelInfo {
  label: string;
  icon: IconName;
  cls: string;
  rank: number;
  desc: string;
}

// rank: UNKNOWN is above NORMAL on purpose (bad data is not good health).
export const ATTENTION: Record<Attention, LevelInfo> = {
  NORMAL: { label: 'Normal', icon: 'check', cls: 'normal', rank: 1, desc: 'No active attention rule.' },
  UNKNOWN: { label: 'Unknown', icon: 'question', cls: 'unknown', rank: 2, desc: 'Not enough reliable data to evaluate. This does not mean "normal".' },
  WATCH: { label: 'Watch', icon: 'eye', cls: 'watch', rank: 3, desc: 'A measurement should be watched; a non-urgent re-check may be needed.' },
  ALERT: { label: 'Warning', icon: 'alert', cls: 'alert', rank: 4, desc: 'Steps on the action card should be carried out soon; the mission procedure takes priority.' },
  CRITICAL: { label: 'Critical', icon: 'critical', cls: 'critical', rank: 5, desc: 'An emergency procedure must be opened now and the crew health officer informed.' },
};

export function attInfo(att: string | null | undefined): LevelInfo {
  return (att && (ATTENTION as Record<string, LevelInfo>)[att]) || ATTENTION.UNKNOWN;
}

export const QUALITY: Record<string, { label: string; icon: IconName; cls: string }> = {
  VALID: { label: 'Valid', icon: 'check', cls: 'valid' },
  SUSPECT: { label: 'Suspect', icon: 'warning', cls: 'suspect' },
  MISSING: { label: 'Eksik', icon: 'question', cls: 'missing' },
  FAULT: { label: 'Fault', icon: 'x', cls: 'fault' },
};

export const ALERT_STATUS: Record<string, { label: string; icon: IconName; cls: string }> = {
  OPEN: { label: 'Open', icon: 'dot', cls: 'open' },
  ACKNOWLEDGED: { label: 'Acknowledged', icon: 'eye', cls: 'ack' },
  RESOLVED: { label: 'Resolved', icon: 'check', cls: 'res' },
};

const COMPARISON: Record<string, string> = {
  '<': '<', '>': '>', '<=': '≤', '>=': '≥', '==': '=', LT: '<', GT: '>', LTE: '≤', GTE: '≥',
  'jump>': 'jump >',
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
  LIGHT: 'Light activity',
  EXERCISE: 'Egzersiz',
  SLEEP: 'Uyku',
};

export const BASELINE: Record<string, { label: string; cls: string; note: string }> = {
  ESTABLISHED: {
    label: 'Personal baseline: stable',
    cls: 'established',
    note: 'The rule used this person\'s baseline, built from enough samples.',
  },
  ESTIMATED_RESEARCH: {
    label: 'Personal baseline: estimated',
    cls: 'estimated',
    note: 'Too few samples; the rule uses the general reference and the personal value is for information only.',
  },
};

/** Fallback rule titles when the status call has not answered yet. */
export const RULE_TITLES: Record<string, string> = {
  ENV_CO2_NOMINAL_V1: 'Cabin CO₂ nominal limit',
  ENV_CABIN_ATMOSPHERE_V1: 'Cabin O₂ partial pressure',
  ENV_RADIATION_V1: 'Radiation dose rate and cumulative dose',
  BEHAV_SLEEP_V1: 'Uyku borcu ve yorgunluk',
  SENS_MOTION_SICKNESS_V1: 'Motion sickness pattern',
  SANS_VISION_SYMPTOM_V1: 'Vision change (SANS monitoring)',
  VITAL_SPO2_SUSTAINED_V1: 'Sustained low SpO₂',
  VITAL_TEMP_TREND_V1: 'Body temperature trend',
  MULTI_CARDIO_RESP_V1: 'Dinlenme kalp + solunum + belirti',
  RED_FLAG_SYMPTOM_V1: 'Red flag symptom',
  DATA_HR_JUMP_V1: 'Heart rate sensor quality',
};

// "Bu ölçüm neden önemli?" — general information, no diagnosis/treatment language.
export const GENERIC_NEXT = ' For what to do next, see the action card and the mission procedure.';
export const METRIC_INFO: Record<string, { why: string; watch: string }> = {
  HEART_RATE: {
    why: 'Heart rate shows cardiovascular load in the context of rest, activity and stress.',
    watch: 'At rest, a clear and sustained deviation from the personal baseline, or accompanying symptoms.',
  },
  SPO2: {
    why: 'SpO₂ is the estimated percentage of oxygen saturation in the blood, measured with a finger or ear sensor.',
    watch: 'When the value stays below the set threshold for a while; repeat the measurement to rule out a sensor error.',
  },
  RESPIRATION_RATE: {
    why: 'Respiration rate is the number of breaths per minute and responds to physical load and environment.',
    watch: 'A sustained rise at rest, especially together with heart rate changes or symptoms.',
  },
  BODY_TEMPERATURE: {
    why: 'Body temperature is used to track sustained change from the personal baseline.',
    watch: 'Not from a single reading, but when a sustained deviation from the personal baseline appears.',
  },
  SYSTOLIC_BP: {
    why: 'Systolic blood pressure shows the pressure in the vessels while the heart beats.',
    watch: 'A sustained deviation from the personal baseline, or accompanying symptoms.',
  },
  DIASTOLIC_BP: {
    why: 'Diastolic blood pressure shows the pressure in the vessels while the heart rests.',
    watch: 'A sustained deviation from the personal baseline, or accompanying symptoms.',
  },
  SLEEP_DURATION: {
    why: 'Sleep duration helps interpret fatigue load in the context of recovery and performance.',
    watch: 'When several nights in a row fall clearly below the personal pattern.',
  },
  HRV_RMSSD: {
    why: 'Heart rate variability (RMSSD) is the variation in the intervals between successive heartbeats; it gives context on recovery and stress load.',
    watch: 'This version has no rule or threshold for HRV; it is tracked only as a personal trend.',
  },
  CABIN_CO2_PARTIAL_PRESSURE: {
    why: 'Cabin CO₂ partial pressure is an environment measure that reflects how well ventilation and life support work.',
    watch: 'When the hourly average exceeds the nominal habitat limit and subjective symptoms such as headache accompany it.',
  },
  CABIN_O2_FRACTION: {
    why: 'Cabin O₂ fraction shows the share of oxygen in the air being breathed.',
    watch: 'When it leaves the range defined for the mission.',
  },
  CABIN_PRESSURE: {
    why: 'Cabin pressure is a basic environment measure for the habitat\'s structural and breathing safety.',
    watch: 'When it deviates from the mission range or shows an unexpected downward trend.',
  },
  RADIATION_DOSE_RATE: {
    why: 'Radiation dose rate tracks the level of ionizing radiation in the environment and cumulative exposure.',
    watch: 'When the dose rate rises above the expected level or mission warnings are issued.',
  },
};

/** Used before /v1/metrics answers (labels normally come from the API). */
export const FALLBACK_METRICS = [
  { metric: 'HEART_RATE', label: 'Heart rate', unit: 'bpm', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'SPO2', label: 'SpO₂', unit: '%', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'RESPIRATION_RATE', label: 'Respiration rate', unit: 'breaths/min', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'BODY_TEMPERATURE', label: 'Body temperature', unit: '°C', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'SYSTOLIC_BP', label: 'Sistolik tansiyon', unit: 'mmHg', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'DIASTOLIC_BP', label: 'Diyastolik tansiyon', unit: 'mmHg', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'SLEEP_DURATION', label: 'Sleep duration', unit: 'h', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'CABIN_CO2_PARTIAL_PRESSURE', label: 'Kabin CO₂', unit: 'mmHg', target_type: 'ENVIRONMENT', category: 'environment' },
  { metric: 'CABIN_O2_FRACTION', label: 'Kabin O₂', unit: '%', target_type: 'ENVIRONMENT', category: 'environment' },
  { metric: 'CABIN_PRESSURE', label: 'Cabin pressure', unit: 'kPa', target_type: 'ENVIRONMENT', category: 'environment' },
  { metric: 'RADIATION_DOSE_RATE', label: 'Radiation dose rate', unit: 'uSv/h', target_type: 'ENVIRONMENT', category: 'environment' },
] as const;

/** Display units: the API keeps ASCII units ("uSv/h"); show the proper symbol. */
export function displayUnit(unit: string | null | undefined): string {
  if (!unit) return '';
  if (unit === 'uSv/h') return 'µSv/h';
  if (unit === 'breaths/min') return '/dk';
  return unit;
}
