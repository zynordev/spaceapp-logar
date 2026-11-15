// Response shapes used by the vitals track. Mirrors the backend schemas
// (src/spaceapp_logar/schemas/{status,alerts,action_cards,measurements}.py)
// and contract section F (trend). Only the fields this track reads.
import type { Attention } from '../../lib/store';
import type { EarthResponse } from '../profile/types';

export type DataQuality = 'VALID' | 'SUSPECT' | 'MISSING' | 'FAULT';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface ActionCardStep {
  key: string;
  text_tr: string;
  why_tr: string;
}

export interface CardReference {
  label: string;
  uri: string;
}

export interface ActionCard {
  card_id: string;
  version: number;
  attention: Attention;
  rule_id: string;
  title_key: string;
  reason_key: string;
  title_tr: string;
  reason_tr: string;
  step_keys: string[];
  steps: ActionCardStep[];
  footer_note_tr: string;
  requires_mission_procedure: boolean;
  allows_automatic_vehicle_command: boolean;
  validation_status: string;
  reassess_minutes: number | null;
  escalate_if_tr: string[];
  closes_when_tr: string;
  considerations_tr: string[];
  references: CardReference[];
}

export interface CompletedStep {
  step_key: string;
  crew_member_id: string;
  done_at: string;
}

export interface Situation {
  facts_tr: string[];
  alert_id: string | null;
  level_since: string | null;
  reassess_at: string | null;
  completed_steps: CompletedStep[];
  /** Mission-profile track: ground round trip vs the card's act-within window. */
  earth_response?: EarthResponse | null;
}

export interface BaselineUsed {
  value: number | null;
  classification: string;
  status_label: string;
  sample_count: number | null;
  profile_version: number | null;
}

export interface RuleStatus {
  rule_id: string;
  rule_version: number;
  title: string;
  metric: string;
  related_metrics: string[];
  target_id: string;
  time_scale: string;
  health_attention: Attention;
  data_quality: DataQuality;
  observed_value: number | null;
  unit: string;
  threshold: number;
  comparison: string;
  window_minutes: number;
  evaluated_at: string;
  explanation: string;
  source: string;
  source_uri: string;
  evidence_level: string;
  validation_status: string;
  action_card: ActionCard | null;
  situation: Situation | null;
  baseline: BaselineUsed | null;
}

export interface CrewStatus {
  mission_id: string;
  crew_member_id: string;
  environment_target_id: string | null;
  generated_at: string;
  overall_attention: Attention;
  rules: RuleStatus[];
  limitations: string[];
}

export interface AlertRead {
  id: string;
  mission_id: string;
  target_id: string;
  rule_id: string;
  status: AlertStatus;
  health_attention: Attention;
  opened_at: string;
  last_evaluated_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  manual_resolution: boolean;
  completed_step_keys: string[];
  explanation: string | null;
  action_card: ActionCard | null;
}

export interface MetricDef {
  metric: string;
  label: string;
  unit: string;
  target_type: 'CREW_MEMBER' | 'ENVIRONMENT';
  category: string;
}

export interface MeasurementPoint {
  observed_at: string;
  value: number;
  reported_quality: string;
  activity_state: string | null;
  activity_source?: string | null;
}

export interface MeasurementSeries {
  metric: string;
  unit: string;
  target_id: string;
  points: MeasurementPoint[];
}

export interface TrendBucket {
  start: string;
  end: string;
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
}

export interface MeasurementTrend {
  mission_id: string;
  target_id: string;
  metric: string;
  unit: string;
  bucket: 'hour' | 'day';
  since: string | null;
  until: string | null;
  buckets: TrendBucket[];
}
