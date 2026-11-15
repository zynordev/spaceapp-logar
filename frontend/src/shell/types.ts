// Response shapes the shell reads (subset of the backend schemas).
import type { Attention, AuthUser, Role } from '../lib/store';

export interface MissionRead {
  mission_id: string;
  scenario_id: string | null;
  last_observed_at: string;
  crew_member_ids: string[];
  environment_target_ids: string[];
}

export interface AuthConfigRead {
  auth_required: boolean;
  auth_configured: boolean;
}

export type AuthMeRead = AuthUser;

export interface TokenRead {
  access_token: string;
  token_type: string;
  expires_at: string;
  role: Role;
  user_id: string;
}

export interface ActivityCurrentRead {
  state: 'ACTIVE' | 'EXPIRED' | 'NONE';
  remaining_seconds: number | null;
  message_tr: string;
  activity: { activity_state: string } | null;
}

export interface CrewStatusRead {
  mission_id: string;
  crew_member_id: string;
  environment_target_id: string | null;
  generated_at: string;
  overall_attention: Attention;
  rules: { rule_id: string; title: string; health_attention: Attention; validation_status?: string }[];
  limitations: string[];
  current_activity?: ActivityCurrentRead | null;
}
