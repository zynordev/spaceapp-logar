// Local, in-memory fixtures for `?mock=1`: lets the activity and routine
// sections be previewed before backend tracks B and D are merged.
// Nothing here is sent anywhere; reload resets it.
import type {
  ActivityCurrentRead, ActivityRead, ActivityState, RoutineCatalogItem, RoutineDueRead,
  RoutineKind, RoutineScheduleRead, RoutineState,
} from './types';

const MISSION = 'MOCK-MISSION';
const CREW = 'MOCK-CREW';
const iso = (ms: number) => new Date(ms).toISOString();
let seq = 0;
const uid = () => `mock-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// ---- Activities ----------------------------------------------------------
let activity: ActivityRead | null = (() => {
  // Start with an already-expired declaration so the EXPIRED state is visible.
  const started = Date.now() - 50 * 60000;
  return {
    id: uid(), mission_id: MISSION, crew_member_id: CREW, activity_state: 'EXERCISE',
    started_at: iso(started), expected_end_at: iso(started + 45 * 60000), ended_at: null,
    source_type: 'MANUAL', source_id: 'dashboard-user', created_at: iso(started),
  };
})();

export const mockActivity = {
  current(now = Date.now()): ActivityCurrentRead {
    if (!activity || activity.ended_at) {
      return { state: 'NONE', activity: null, remaining_seconds: null, message_tr: 'Açık aktivite beyanı yok (önizleme verisi).' };
    }
    const remaining = Math.round((Date.parse(activity.expected_end_at) - now) / 1000);
    if (remaining <= 0) {
      return { state: 'EXPIRED', activity, remaining_seconds: 0, message_tr: 'Beyan edilen süre doldu — aktivite bağlamı bilinmiyor.' };
    }
    return { state: 'ACTIVE', activity, remaining_seconds: remaining, message_tr: 'Beyan edilen aktivite sürüyor (önizleme verisi).' };
  },
  start(state: ActivityState, minutes: number): ActivityRead {
    const now = Date.now();
    activity = {
      id: uid(), mission_id: MISSION, crew_member_id: CREW, activity_state: state,
      started_at: iso(now), expected_end_at: iso(now + minutes * 60000), ended_at: null,
      source_type: 'MANUAL', source_id: 'dashboard-user', created_at: iso(now),
    };
    return activity;
  },
  end(): ActivityRead | null {
    if (activity && !activity.ended_at) activity = { ...activity, ended_at: iso(Date.now()) };
    return activity;
  },
};

// ---- Routines --------------------------------------------------------------
export const ROUTINE_CATALOG_FALLBACK: RoutineCatalogItem[] = [
  { kind: 'HYDRATION', title_tr: 'Su içme', description_tr: 'Düzenli sıvı alımı hatırlatması.', category: 'DAILY', default_interval_minutes: 120, evidence: 'DEMO' },
  { kind: 'EXERCISE', title_tr: 'Egzersiz seansı', description_tr: 'Planlı egzersiz bloğu.', category: 'DAILY', default_interval_minutes: 1440, evidence: 'DEMO' },
  { kind: 'SLEEP_WINDOW', title_tr: 'Uyku penceresi', description_tr: 'Planlı uyku dönemine geçiş.', category: 'DAILY', default_interval_minutes: 1440, evidence: 'DEMO' },
  { kind: 'CHECK_IN', title_tr: 'Öznel durum kaydı', description_tr: 'Belirti formunu doldurma.', category: 'DAILY', default_interval_minutes: 240, evidence: 'DEMO' },
  { kind: 'BODY_MASS_WEEKLY', title_tr: 'Haftalık vücut kütlesi', description_tr: 'Haftalık kütle ölçümü.', category: 'PERIODIC_TEST', default_interval_minutes: 10080, evidence: 'DEMO' },
  { kind: 'GRIP_STRENGTH_WEEKLY', title_tr: 'Haftalık kavrama kuvveti', description_tr: 'Haftalık el kavrama testi.', category: 'PERIODIC_TEST', default_interval_minutes: 10080, evidence: 'DEMO' },
  { kind: 'MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY', title_tr: 'Kas-iskelet değerlendirmesi', description_tr: 'İki haftada bir değerlendirme.', category: 'PERIODIC_TEST', default_interval_minutes: 20160, evidence: 'DEMO' },
];

interface MockRoutine { schedule: RoutineScheduleRead; last: number | null; streak: number; best: number }
let routines: MockRoutine[] = [];

function dueOf(r: MockRoutine, now: number): RoutineDueRead {
  const interval = r.schedule.interval_minutes * 60000;
  const base = r.last ?? Date.parse(r.schedule.anchor_at);
  const next = r.last === null ? base : base + interval;
  let state: RoutineState = 'UPCOMING';
  if (now >= next + interval / 4) state = 'OVERDUE';
  else if (now >= next) state = 'DUE';
  return {
    schedule: r.schedule, state, next_due_at: iso(next),
    last_completed_at: r.last === null ? null : iso(r.last),
    current_streak: r.streak, best_streak: r.best,
  };
}

const ORDER: Record<RoutineState, number> = { OVERDUE: 0, DUE: 1, UPCOMING: 2 };

export const mockRoutines = {
  due(now = Date.now()): RoutineDueRead[] {
    return routines.map((r) => dueOf(r, now))
      .sort((a, b) => ORDER[a.state] - ORDER[b.state] || Date.parse(a.next_due_at) - Date.parse(b.next_due_at));
  },
  defaults(): RoutineScheduleRead[] {
    const now = Date.now();
    const offsets: Partial<Record<RoutineKind, number>> = {
      HYDRATION: -70, CHECK_IN: -10, EXERCISE: 180, SLEEP_WINDOW: 600,
      BODY_MASS_WEEKLY: 60 * 24 * 2, GRIP_STRENGTH_WEEKLY: -60 * 24 * 3, MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY: 60 * 24 * 9,
    };
    for (const c of ROUTINE_CATALOG_FALLBACK) {
      if (routines.some((r) => r.schedule.kind === c.kind)) continue;
      routines.push({
        schedule: {
          id: uid(), mission_id: MISSION, crew_member_id: CREW, kind: c.kind, title_tr: c.title_tr,
          interval_minutes: c.default_interval_minutes, anchor_at: iso(now + (offsets[c.kind] ?? 0) * 60000),
          active: true, created_at: iso(now),
        },
        last: null, streak: c.kind === 'HYDRATION' ? 2 : 0, best: c.kind === 'HYDRATION' ? 5 : 0,
      });
    }
    return routines.map((r) => r.schedule);
  },
  complete(id: string): RoutineDueRead | null {
    const r = routines.find((x) => x.schedule.id === id);
    if (!r) return null;
    r.last = Date.now();
    r.streak += 1;
    r.best = Math.max(r.best, r.streak);
    return dueOf(r, Date.now());
  },
};
