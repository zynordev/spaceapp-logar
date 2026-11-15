// Static presentation data for the body map: colours, Turkish labels, glyphs,
// plain-language explanations. Server text (label_tr, description_tr) wins
// when present; these are fallbacks for the neutral / offline state.
import type { IconName } from '../../ui';
import type { Attention, Coverage, RegionKey } from './types';

export const ATTENTION_RANK: Record<Attention, number> = {
  NORMAL: 0,
  UNKNOWN: 1,
  WATCH: 2,
  ALERT: 3,
  CRITICAL: 4,
};

export interface AttentionMeta {
  /** Turkish label shown next to the colour (colour is never the only signal). */
  label: string;
  /** Short, font-safe glyph (text fallback only; UI renders `icon`). */
  glyph: string;
  /** Shared SVG icon for the level. */
  icon: IconName;
  /** One-line meaning for a non-doctor. */
  hint: string;
  /** Hex used by three.js (CSS uses the matching variable). */
  hex: string;
  cssVar: string;
}

export const ATTENTION: Record<Attention, AttentionMeta> = {
  NORMAL: {
    label: 'Normal',
    glyph: '✓',
    icon: 'check',
    hint: 'No rules flag a problem.',
    hex: '#22c55e',
    cssVar: 'var(--att-normal, #22c55e)',
  },
  UNKNOWN: {
    label: 'Unknown',
    glyph: '?',
    icon: 'question',
    hint: 'Not enough data or rules — do not assume "normal".',
    hex: '#94a3b8',
    cssVar: 'var(--att-unknown, #94a3b8)',
  },
  WATCH: {
    label: 'Watching',
    glyph: '!',
    icon: 'eye',
    hint: 'Pay attention and follow the trend.',
    hex: '#eab308',
    cssVar: 'var(--att-watch, #eab308)',
  },
  ALERT: {
    label: 'Warning',
    glyph: '!!',
    icon: 'alert',
    hint: 'Open the action card and follow the steps.',
    hex: '#ef4b4b',
    cssVar: 'var(--att-alert, #ef4b4b)',
  },
  CRITICAL: {
    label: 'Critical',
    glyph: '!!!',
    icon: 'critical',
    hint: 'Act now and call the health officer.',
    hex: '#ef4444',
    cssVar: 'var(--att-critical, #ef4444)',
  },
};

export interface RegionMeta {
  label: string;
  short: string;
  description: string;
  /** Point the camera focuses on (world units, feet at y=0, facing +z). */
  focus: [number, number, number];
  /** Camera distance when focused. */
  distance: number;
  /** Anchor for the 3D marker label. */
  marker: [number, number, number];
}

export const REGION_META: Record<RegionKey, RegionMeta> = {
  head: {
    label: 'Head / Brain',
    short: 'Head',
    description: 'Symptoms such as sleep, cognitive state and headache.',
    focus: [0, 1.62, 0],
    distance: 1.05,
    marker: [-0.2, 1.74, 0],
  },
  eyes: {
    label: 'Eyes',
    short: 'Eye',
    description: 'Vision changes (spaceflight-associated eye syndrome, SANS).',
    focus: [0, 1.625, 0.09],
    distance: 0.8,
    marker: [0.2, 1.67, 0.12],
  },
  inner_ear: {
    label: 'Inner ear / Balance',
    short: 'Balance',
    description: 'Motion sickness, dizziness and balance.',
    focus: [0.1, 1.615, 0],
    distance: 0.8,
    marker: [0.26, 1.58, 0],
  },
  heart: {
    label: 'Heart',
    short: 'Heart',
    description: 'Pulse and cardiovascular symptoms.',
    focus: [0.03, 1.27, 0.04],
    distance: 1.1,
    marker: [0.32, 1.3, 0.1],
  },
  lungs: {
    label: 'Lungs',
    short: 'Lung',
    description: 'Breathing rate and blood oxygen (SpO₂).',
    focus: [0, 1.29, 0],
    distance: 1.2,
    marker: [-0.34, 1.36, 0.06],
  },
  torso: {
    label: 'Torso / Abdomen',
    short: 'Torso',
    description: 'Digestion, nutrition, fluid balance and abdominal symptoms.',
    focus: [0, 1.05, 0.02],
    distance: 1.25,
    marker: [-0.3, 1.04, 0.08],
  },
  musculoskeletal: {
    label: 'Musculoskeletal',
    short: 'Musculoskeletal',
    description: 'Bone loss, muscle strength, spine and joints.',
    focus: [0, 0.7, 0],
    distance: 2.0,
    marker: [0.24, 0.55, 0],
  },
  skin: {
    label: 'Skin / Body temperature',
    short: 'Skin',
    description: 'Body temperature, skin irritation and wounds.',
    focus: [0, 1.05, 0],
    distance: 2.4,
    marker: [-0.42, 0.82, 0],
  },
  cabin: {
    label: 'Cabin environment',
    short: 'Cabin',
    description: 'Living space: CO₂, O₂, pressure and radiation.',
    focus: [0, 1.0, 0],
    distance: 4.7,
    marker: [0.62, 1.9, 0],
  },
};

export const COVERAGE_TEXT: Record<Coverage, { label: string; text: string }> = {
  RULE: {
    label: 'Monitored by rule',
    text: 'This region is assessed automatically: measurements are checked against thresholds with explainable rules.',
  },
  DATA_ONLY: {
    label: 'Data only',
    text: 'Data is collected but there is no automatic rule. A specialist (health officer or ground team) should interpret the values.',
  },
  GAP: {
    label: 'Coverage gap',
    text: 'There is no data or rule for this region yet. Status unknown — this does not mean there is no problem.',
  },
};

export const QUALITY_TEXT: Record<string, string> = {
  VALID: 'Data valid',
  SUSPECT: 'Data suspect',
  MISSING: 'Data missing',
  FAULT: 'Sensor fault',
};

/** Region order for chips, 2D drawing and screen readers (top to bottom). */
export const CHIP_ORDER: RegionKey[] = [
  'head',
  'eyes',
  'inner_ear',
  'heart',
  'lungs',
  'torso',
  'musculoskeletal',
  'skin',
  'cabin',
];
