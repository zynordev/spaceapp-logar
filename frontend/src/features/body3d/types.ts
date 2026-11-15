// Contract C — GET /v1/crew/{crew_member_id}/body-map (docs/CONTRACT_PARALLEL_BUILD.md).
import type { Attention } from '../../lib/store';

export type { Attention };

/** Fixed region keys shared by the backend and the 3D / 2D models. */
export const REGION_KEYS = [
  'head',
  'eyes',
  'inner_ear',
  'heart',
  'lungs',
  'torso',
  'musculoskeletal',
  'skin',
  'cabin',
] as const;

export type RegionKey = (typeof REGION_KEYS)[number];

export type Coverage = 'RULE' | 'DATA_ONLY' | 'GAP';

export interface BodyRuleRead {
  rule_id: string;
  title: string;
  health_attention: Attention;
  data_quality: string;
  explanation: string;
}

export interface BodyLatestValue {
  metric: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  observed_at: string | null;
}

export interface BodyRegionRead {
  region: RegionKey;
  label_tr: string;
  description_tr: string;
  attention: Attention;
  coverage: Coverage;
  rules: BodyRuleRead[];
  metrics: string[];
  latest_values: BodyLatestValue[];
  open_alert_ids: string[];
}

export interface BodyMapRead {
  mission_id: string;
  crew_member_id: string;
  generated_at: string;
  overall_attention: Attention;
  regions: BodyRegionRead[];
}

export function isRegionKey(v: unknown): v is RegionKey {
  return typeof v === 'string' && (REGION_KEYS as readonly string[]).includes(v);
}

/** Per-region state the 3D and 2D views render (always all 9 keys). */
export type RegionStates = Record<RegionKey, { attention: Attention; alerts: number }>;
