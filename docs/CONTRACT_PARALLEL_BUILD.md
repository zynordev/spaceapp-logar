> Not (15 Kasım 2026): Bu belge paralel yapının sözleşmesiydi ve tarihsel kayıttır; **kod esastır**. Güncel uçlar için `docs/API_DATA_MODEL.md` ve `/docs` kullanılmalıdır.

# SpaceApp Logar — API contract for the parallel build (15 Nov 2026)

Single source of truth for the 6 backend tracks (they MUST implement exactly
this) and the 5 frontend tracks (they code against it before the backend is
merged). If you must deviate, write `CONTRACT-DEVIATION:` with the reason in
your status file; the main session decides. All times are ISO-8601 UTC with
`Z`. All bodies use `extra="forbid"`. Ids are UUID strings unless noted.
`Identifier` = existing 1–100 char id type (`schemas/observations.py`).
Every `/v1` route except the ones marked "no token" runs through
`current_user` (main.py `AUTHENTICATED`). Errors use the existing body:
`{"detail": ..., "code": ..., "request_id": ...}` (see `observability.py`).

Attention levels (existing): `NORMAL | UNKNOWN | WATCH | ALERT | CRITICAL`.

## Existing endpoints (already on main — read the code for exact shapes)
POST /v1/auth/token (no token) -> TokenRead {access_token, token_type, expires_at, role, user_id}
GET  /v1/alerts?mission_id&limit -> AlertRead[]
POST /v1/alerts/{alert_id}/acknowledge | /resolve | /steps -> AlertRead
POST /v1/check-ins -> SubjectiveCheckInRead
GET  /v1/risk-coverage -> CoverageRead
POST /v1/demo/osdr-labs/import -> OsdrImportRead
GET  /v1/demo/scenarios ; POST /v1/demo/scenarios/{scenario_id}/run -> DemoRunRead
POST/GET /v1/environment-contexts ; GET /v1/environment-contexts/current
GET  /v1/baselines ; POST/GET /v1/baseline-profiles ; POST .../{id}/activate|release
POST /v1/lab-results -> LabResultRead ; GET /v1/crew/{crew_member_id}/lab-results -> LabPanelRead
POST /v1/measurements ; POST /v1/measurements/batch ; GET /v1/measurements?mission_id&target_id&metric&limit -> MeasurementSeriesRead
GET  /v1/metrics ; GET /v1/missions
POST /v1/observations (CO2)
GET  /v1/red-flags/catalog ; POST /v1/red-flags
GET  /v1/crew/{crew_member_id}/status?mission_id&environment_target_id -> CrewStatusRead
GET  /health

## A — Auth
GET /v1/auth/config (no token)
  200 {auth_required: bool, auth_configured: bool}
GET /v1/auth/me
  200 {user_id: str, role: "ASTRONAUT"|"CREW_MEDICAL_OFFICER"|"GROUND"|null, anonymous: bool}
  (flag off + no token -> {user_id:"demo-anonymous", role:null, anonymous:true}; flag on + no token -> 401)

## B — Activity declarations (migration 20261115_0015)
ActivityState: REST | LIGHT | EXERCISE | SLEEP
POST /v1/activities
  body {mission_id, crew_member_id?: Identifier (required only without token),
        activity_state, planned_minutes: int 5..240, started_at?: datetime (default now),
        source_type: "MANUAL"|"SYNTHETIC" = "MANUAL", source_id: str = "dashboard-user", scenario_id?: str}
  201 ActivityRead ; an open declaration of the same crew member is ended at started_at.
POST /v1/activities/{activity_id}/end   body {ended_at?: datetime}  -> 200 ActivityRead (409 if already ended)
GET  /v1/activities/current?mission_id&crew_member_id&at?   -> 200 ActivityCurrentRead
ActivityRead {id, mission_id, crew_member_id, activity_state, started_at,
              expected_end_at, ended_at: datetime|null, source_type, source_id, created_at}
ActivityCurrentRead {state: "ACTIVE"|"EXPIRED"|"NONE", activity: ActivityRead|null,
              remaining_seconds: int|null, message_tr: str}
  EXPIRED = latest declaration passed expected_end_at without end -> context unknown
  (message_tr e.g. "Beyan edilen süre doldu — aktivite bağlamı bilinmiyor.")
CrewStatusRead gains `current_activity: ActivityCurrentRead | null`.
Observation/MeasurementPoint gains `activity_source: "SENSOR"|"DECLARED"|null`.

## C — Body map (no migration)
Region keys (FIXED — the 3D model uses the same keys):
  head, eyes, inner_ear, heart, lungs, torso, musculoskeletal, skin, cabin
GET /v1/crew/{crew_member_id}/body-map?mission_id&environment_target_id?
  200 BodyMapRead {mission_id, crew_member_id, generated_at, overall_attention,
     regions: BodyRegionRead[]}
BodyRegionRead {region, label_tr, description_tr, attention,
     coverage: "RULE"|"DATA_ONLY"|"GAP",
     rules: [{rule_id, title, health_attention, data_quality, explanation}],
     metrics: [str], latest_values: [{metric, label, value, unit, observed_at}],
     open_alert_ids: [uuid]}
  Region attention = worst rule attention in that region (rank NORMAL<UNKNOWN<WATCH<ALERT<CRITICAL);
  region with no rules -> attention "UNKNOWN" and coverage DATA_ONLY/GAP.

## D — Routines (migration 20261115_0016)
RoutineKind: HYDRATION | EXERCISE | SLEEP_WINDOW | CHECK_IN | BODY_MASS_WEEKLY |
             GRIP_STRENGTH_WEEKLY | MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY   (no medication, ever)
GET  /v1/routines/catalog -> [{kind, title_tr, description_tr, category: "DAILY"|"PERIODIC_TEST",
                               default_interval_minutes, evidence: "DEMO"}]
POST /v1/routines  body {mission_id, crew_member_id, kind, interval_minutes?: int 30..20160, anchor_at?: datetime}
     -> 201 RoutineScheduleRead
POST /v1/routines/defaults body {mission_id, crew_member_id} -> 201 RoutineScheduleRead[] (idempotent per kind)
GET  /v1/routines/due?mission_id&crew_member_id&at? -> 200 RoutineDueRead[] (OVERDUE, DUE, UPCOMING order)
POST /v1/routines/{schedule_id}/complete body {crew_member_id?: (required only without token), completed_at?}
     -> 201 RoutineDueRead
RoutineScheduleRead {id, mission_id, crew_member_id, kind, title_tr, interval_minutes, anchor_at, active, created_at}
RoutineDueRead {schedule: RoutineScheduleRead, state: "UPCOMING"|"DUE"|"OVERDUE",
                next_due_at, last_completed_at: datetime|null,
                current_streak: int, best_streak: int}
  DUE = now within [next_due_at, next_due_at + interval/4); OVERDUE after that.

## E — Ground sync + escalation (migration 20261115_0017)
Recipient: FLIGHT_SURGEON | LIFE_SUPPORT | RADIATION | MISSION_CONTROL
GET  /v1/sync/status?mission_id -> SyncStatusRead {mission_id, generated_at,
       link_delay_seconds: int|null, recipients: [{recipient, label_tr,
       pending_items: int, last_ack_at: datetime|null, last_packet_id: uuid|null}],
       pending_escalations: int}
GET  /v1/sync/packet?mission_id&recipient&limit? -> SyncPacketRead {packet_id, mission_id,
       recipient, generated_at, since: datetime|null, until, item_count,
       items: [{kind: "ALERT"|"RULE_EVALUATION"|"CHECK_IN"|"LAB_RESULT"|"RED_FLAG"|"TREND"|"ESCALATION",
                id, occurred_at, summary_tr, data: object}],
       sha256, signature: str|null, signature_alg: "HMAC-SHA256"|null}
       (sha256 over canonical JSON of everything except sha256/signature fields)
POST /v1/sync/ack body {mission_id, recipient, packet_id, sha256, until} -> 200 SyncAckRead
       {id, mission_id, recipient, packet_id, sha256, until, acked_at, acked_by}
       409 if sha256 mismatches; with a token requires role GROUND (403 otherwise)
GET  /v1/sync/escalations?mission_id&status? -> EscalationRead[]
EscalationRead {id, mission_id, alert_id, crew_member_id|null, priority: "ALERT"|"CRITICAL",
       status: "PENDING"|"ACKED", created_at, acked_at|null, summary_tr, packet_sha256}
  Created automatically, once per alert, when an ALERT/CRITICAL alert opens (red flags included).

## F — Trend + HRV
GET /v1/measurements/trend?mission_id&target_id&metric&bucket=hour|day&since?&until?
  200 MeasurementTrendRead {mission_id, target_id, metric, unit, bucket, since, until,
       buckets: [{start, end, count, mean, min, max}]}   (max 1000 buckets; 422 otherwise)
New metric HRV_RMSSD (unit "ms", crew, category "vital"): data only, no rule/threshold;
risk coverage DATA_ONLY. Manual lab entry uses existing POST /v1/lab-results.
