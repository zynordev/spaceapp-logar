// Response/request shapes used by the inputs feature. Mirrors the backend
// schemas (src/spaceapp_logar/schemas/*) and docs/CONTRACT_PARALLEL_BUILD.md.

export type SourceType = 'SENSOR' | 'MANUAL' | 'OSDR' | 'SYNTHETIC';

// ---- Check-in ------------------------------------------------------------
export type CheckInKey =
  | 'fatigue' | 'dizziness' | 'nausea' | 'pain' | 'mood_distress'
  | 'vision_change' | 'back_pain' | 'congestion';

export interface CheckInRead {
  id: string;
  mission_id: string;
  crew_member_id: string;
  fatigue: number;
  dizziness: number;
  nausea: number;
  pain: number;
  mood_distress: number;
  vision_change: number | null;
  back_pain: number | null;
  congestion: number | null;
  observed_at: string;
  source_type: SourceType;
  source_id: string;
  ingested_at: string;
}

export interface CrewStatusLite {
  mission_id: string;
  crew_member_id: string;
  latest_check_in: CheckInRead | null;
}

// ---- Activities (contract B) ----------------------------------------------
export type ActivityState = 'REST' | 'LIGHT' | 'EXERCISE' | 'SLEEP';

export interface ActivityRead {
  id: string;
  mission_id: string;
  crew_member_id: string;
  activity_state: ActivityState;
  started_at: string;
  expected_end_at: string;
  ended_at: string | null;
  source_type: SourceType;
  source_id: string;
  created_at: string;
}

export interface ActivityCurrentRead {
  state: 'ACTIVE' | 'EXPIRED' | 'NONE';
  activity: ActivityRead | null;
  remaining_seconds: number | null;
  message_tr: string;
}

// ---- Routines (contract D) ------------------------------------------------
export type RoutineKind =
  | 'HYDRATION' | 'EXERCISE' | 'SLEEP_WINDOW' | 'CHECK_IN'
  | 'BODY_MASS_WEEKLY' | 'GRIP_STRENGTH_WEEKLY' | 'MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY';

export type RoutineCategory = 'DAILY' | 'PERIODIC_TEST';

export interface RoutineCatalogItem {
  kind: RoutineKind;
  title_tr: string;
  description_tr: string;
  category: RoutineCategory;
  default_interval_minutes: number;
  evidence: 'DEMO';
}

export interface RoutineScheduleRead {
  id: string;
  mission_id: string;
  crew_member_id: string;
  kind: RoutineKind;
  title_tr: string;
  interval_minutes: number;
  anchor_at: string;
  active: boolean;
  created_at: string;
}

export type RoutineState = 'UPCOMING' | 'DUE' | 'OVERDUE';

export interface RoutineDueRead {
  schedule: RoutineScheduleRead;
  state: RoutineState;
  next_due_at: string;
  last_completed_at: string | null;
  current_streak: number;
  best_streak: number;
}

// ---- Labs ------------------------------------------------------------------
export type LabAnalyte =
  | 'GLUCOSE' | 'SODIUM' | 'POTASSIUM' | 'CREATININE' | 'WBC'
  | 'HEMOGLOBIN' | 'PLATELETS' | 'ALT' | 'AST';

export type LabUnit =
  | 'mg/dL' | 'mmol/L' | 'mEq/L' | 'umol/L' | '10^3/uL' | '10^9/L' | 'g/dL' | 'g/L' | 'U/L';

export type SamplePhase = 'PRE_FLIGHT' | 'IN_FLIGHT' | 'POST_FLIGHT';

export interface LabResultReadLite {
  id: string;
  analyte: LabAnalyte;
  value: number;
  unit: LabUnit;
  phase: SamplePhase;
  sampled_at: string;
}

export interface LabAnalyteSummary {
  analyte: LabAnalyte;
  unit: LabUnit;
  value: number;
  reference_low: number;
  reference_high: number;
  position_vs_reference: 'BELOW' | 'WITHIN' | 'ABOVE';
  phase: SamplePhase;
  sampled_at: string;
  source_type: SourceType;
  source_id: string;
  previous_value: number | null;
  previous_sampled_at: string | null;
  change_from_previous: number | null;
  baseline_value: number | null;
  baseline_sampled_at: string | null;
  change_from_baseline: number | null;
}

export interface LabPanelRead {
  mission_id: string;
  crew_member_id: string;
  generated_at: string;
  results: LabAnalyteSummary[];
  limitations: string[];
}

export interface OsdrImportRead {
  mission_id: string;
  imported: number;
  skipped_existing: number;
  skipped_unusable: number;
  crew_member_ids: string[];
}

// ---- Red flags -------------------------------------------------------------
export interface RedFlagOption {
  flag: string;
  label: string;
}

export interface RedFlagAccepted {
  report_id: string;
  mission_id: string;
  crew_member_id: string;
  flags: string[];
  observed_at: string;
  evaluation: { rule_id: string; title: string; health_attention: string; explanation?: string };
  alert_id: string | null;
}

// ---- Demo ------------------------------------------------------------------
export interface DemoScenarioRead {
  scenario_id: string;
  title: string;
  time_scale: string;
  description: string;
  duration_minutes: number;
  expected: string[];
}

export interface DemoRunRead {
  mission_id: string;
  crew_member_id: string;
  environment_target_id: string;
  scenario_id: string;
  observations_posted: number;
  check_ins_posted: number;
  lab_results_posted: number;
  summary: string[];
}
