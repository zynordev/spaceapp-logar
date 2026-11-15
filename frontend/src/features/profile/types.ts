// Mission profile contract (backend track "profile"):
//   GET  /v1/missions/{mission_id}/profile -> MissionProfileRead
//   POST /v1/missions/{mission_id}/profile {profile} -> MissionProfileRead
// and the action card's live situation gains `earth_response`.

export type MissionProfile = 'ISS' | 'MOON' | 'MARS';
export type EscalationOwner = 'FLIGHT_SURGEON' | 'CREW_MEDICAL_OFFICER';

export interface MissionProfileRead {
  mission_id: string;
  profile: MissionProfile;
  label_tr: string;
  one_way_delay_seconds: { min: number; typical: number; max: number };
  round_trip_typical_seconds: number;
  escalation_owner: EscalationOwner;
  escalation_owner_label_tr: string;
  note_tr: string;
  source_note_tr: string;
}

export interface EarthResponse {
  profile: MissionProfile;
  round_trip_seconds: number;
  act_within_minutes: number | null;
  ground_can_respond_in_time: boolean;
  owner: EscalationOwner;
  owner_label_tr: string;
  note_tr: string;
}

/** Display reference only (same values as the contract); the server is the source. */
export const PROFILE_OPTIONS: { id: MissionProfile; label: string; delay: string; title: string }[] = [
  { id: 'ISS', label: 'ISS', delay: '≈0 sn', title: 'Alçak Dünya yörüngesi (TDRS uyduları üzerinden): tek yön ≈0–2 sn' },
  { id: 'MOON', label: 'Ay', delay: '1,3 sn', title: 'Ay: tek yön ≈1,2–1,4 sn' },
  { id: 'MARS', label: 'Mars', delay: '3–22 dk', title: 'Mars: tek yön ≈3–22 dk (yörünge konumuna göre), tipik ≈12,5 dk' },
];
