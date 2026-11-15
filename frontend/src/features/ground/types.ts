// Shapes from docs/CONTRACT_PARALLEL_BUILD.md section E and GET /v1/risk-coverage.

export type Recipient = 'FLIGHT_SURGEON' | 'LIFE_SUPPORT' | 'RADIATION' | 'MISSION_CONTROL';
export const RECIPIENTS: Recipient[] = ['FLIGHT_SURGEON', 'LIFE_SUPPORT', 'RADIATION', 'MISSION_CONTROL'];

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

export type PacketItemKind =
  | 'ALERT'
  | 'RULE_EVALUATION'
  | 'CHECK_IN'
  | 'LAB_RESULT'
  | 'RED_FLAG'
  | 'TREND'
  | 'ESCALATION';

export interface PacketItem {
  kind: PacketItemKind;
  id: string;
  occurred_at: string;
  summary_tr: string;
  data: Record<string, unknown>;
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

export interface SyncAckBody {
  mission_id: string;
  recipient: Recipient;
  packet_id: string;
  sha256: string;
  until: string;
}

export interface SyncAckRead extends SyncAckBody {
  id: string;
  acked_at: string;
  acked_by: string;
}

export type EscalationPriority = 'ALERT' | 'CRITICAL';
export type EscalationStatus = 'PENDING' | 'ACKED';

export interface EscalationRead {
  id: string;
  mission_id: string;
  alert_id: string;
  crew_member_id: string | null;
  priority: EscalationPriority;
  status: EscalationStatus;
  created_at: string;
  acked_at: string | null;
  summary_tr: string;
  packet_sha256: string;
}

export type Coverage = 'RULE' | 'DATA_ONLY' | 'GAP';

export interface CoveredRule {
  rule_id: string;
  title: string;
  validation_status: string;
}

export interface RiskRead {
  key: string;
  title_tr: string;
  coverage: Coverage;
  indicators_tr: string[];
  rules: CoveredRule[];
  note_tr: string;
}

export interface HazardRead {
  key: string;
  title_tr: string;
  risks: RiskRead[];
}

export interface CoverageRead {
  hazards: HazardRead[];
  summary: Record<string, number>;
  note_tr: string;
}
