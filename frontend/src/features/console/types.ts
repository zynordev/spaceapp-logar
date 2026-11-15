// Response shapes the console reads (subset of the backend schemas;
// docs/CONTRACT_PARALLEL_BUILD.md section E, GET /v1/alerts, GET /v1/crew/{id}/status).
import type { Attention } from '../../lib/store';

export type Recipient = 'FLIGHT_SURGEON' | 'LIFE_SUPPORT' | 'RADIATION' | 'MISSION_CONTROL';

export interface RecipientStatus {
  recipient: Recipient;
  label_tr: string;
  pending_items: number;
  last_ack_at: string | null;
  last_packet_id: string | null;
}

export interface SyncStatusRead {
  mission_id: string;
  generated_at: string;
  link_delay_seconds: number | null;
  recipients: RecipientStatus[];
  pending_escalations: number;
}

export type PacketItemKind = 'ALERT' | 'RULE_EVALUATION' | 'CHECK_IN' | 'LAB_RESULT' | 'RED_FLAG' | 'TREND' | 'ESCALATION';

export interface PacketItem {
  kind: PacketItemKind;
  id: string;
  occurred_at: string;
  summary_tr: string;
}

export interface SyncPacketRead {
  packet_id: string;
  mission_id: string;
  recipient: Recipient;
  generated_at: string;
  since: string | null;
  until: string;
  item_count: number;
  items: PacketItem[];
  sha256: string;
  signature: string | null;
  signature_alg: 'HMAC-SHA256' | null;
}

export interface SyncAckRead {
  id: string;
  mission_id: string;
  recipient: Recipient;
  packet_id: string;
  sha256: string;
  until: string;
  acked_at: string;
  acked_by: string;
}

export interface EscalationRead {
  id: string;
  mission_id: string;
  alert_id: string;
  crew_member_id: string | null;
  priority: 'ALERT' | 'CRITICAL';
  status: 'PENDING' | 'ACKED';
  created_at: string;
  acked_at: string | null;
  summary_tr: string;
  packet_sha256: string;
}

export interface AlertRead {
  id: string;
  mission_id: string;
  target_id: string;
  rule_id: string;
  status: string;
  health_attention: Attention | string;
  opened_at: string;
  resolved_at: string | null;
  explanation: string | null;
}

export interface CrewStatusLite {
  crew_member_id: string;
  generated_at: string;
  overall_attention: Attention | string;
}

export interface MissionLite {
  mission_id: string;
  crew_member_ids: string[];
  environment_target_ids: string[];
}

export const KIND_LABEL: Record<PacketItemKind, string> = {
  ALERT: 'Alarm',
  RULE_EVALUATION: 'Rule evaluation',
  CHECK_IN: 'Subjective report',
  LAB_RESULT: 'Lab result',
  RED_FLAG: 'Red flag report',
  TREND: 'Hourly summary',
  ESCALATION: 'Flight surgeon notification',
};

export const ALERT_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Closed',
};
