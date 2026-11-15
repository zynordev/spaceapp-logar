// Guided jury tour state. Kept tiny and import-light: the top-bar buttons
// import only this; the overlay (TourHost) is its own lazy chunk.
import { create } from 'zustand';
import { ApiError, api } from '../../lib/api';
import { useApp } from '../../lib/store';

export type TourId = 'co2' | 'redflag';

export const TOUR_SCENARIO: Record<TourId, { scenarioId: string; title: string }> = {
  co2: { scenarioId: 'co2-headache', title: 'CO₂ + headache' },
  redflag: { scenarioId: 'chest-pain-red-flag', title: 'Red flag' },
};

interface DemoRunLite {
  mission_id: string;
  crew_member_id: string;
  environment_target_id: string;
  scenario_id: string;
}

interface MissionLite {
  mission_id: string;
  scenario_id: string | null;
  last_observed_at: string | null;
  crew_member_ids: string[];
  environment_target_ids: string[];
}

/**
 * Prefer a mission the server already seeded for this scenario (the live demo
 * seeds them at boot): running a scenario again is slow on small hosts.
 * Falls back to running the scenario when none exists.
 */
async function findSeededMission(scenarioId: string): Promise<DemoRunLite | null> {
  try {
    const missions = await api<MissionLite[]>('GET', '/v1/missions');
    const match = missions
      .filter((m) => m.scenario_id === scenarioId && m.crew_member_ids.length > 0)
      .sort((a, b) => (b.last_observed_at ?? '').localeCompare(a.last_observed_at ?? ''))[0];
    if (!match) return null;
    return {
      mission_id: match.mission_id,
      crew_member_id: match.crew_member_ids.includes('crew-01') ? 'crew-01' : match.crew_member_ids[0],
      environment_target_id: match.environment_target_ids[0] ?? '',
      scenario_id: scenarioId,
    };
  } catch {
    return null;
  }
}

export interface TourState {
  tour: TourId | null;
  step: number;
  phase: 'idle' | 'preparing' | 'running' | 'error';
  error: string | null;
  missionId: string | null;
  auto: boolean;
  start: (id: TourId) => Promise<void>;
  stop: () => void;
  go: (step: number) => void;
  setAuto: (v: boolean) => void;
}

let runSeq = 0;

export const useTour = create<TourState>((set, get) => ({
  tour: null,
  step: 0,
  phase: 'idle',
  error: null,
  missionId: null,
  auto: false,

  start: async (id) => {
    const seq = ++runSeq;
    set({ tour: id, step: 0, phase: 'preparing', error: null, missionId: null });
    // The tour begins on the ship screen.
    if (/^#\/(ground|yer)/.test(window.location.hash)) window.location.hash = '#/';
    try {
      const scenarioId = TOUR_SCENARIO[id].scenarioId;
      const r =
        (await findSeededMission(scenarioId)) ??
        (await api<DemoRunLite>(
          'POST',
          `/v1/demo/scenarios/${encodeURIComponent(scenarioId)}/run`,
          undefined,
          120_000,
        ));
      if (seq !== runSeq || get().tour !== id) return; // stopped or restarted meanwhile
      useApp.getState().setSelection({
        missionId: r.mission_id,
        crewId: r.crew_member_id,
        environmentTargetId: r.environment_target_id,
      });
      set({ phase: 'running', missionId: r.mission_id, step: 0 });
    } catch (e) {
      if (seq !== runSeq) return;
      const msg =
        e instanceof ApiError
          ? e.network
            ? 'Cannot reach the server; the scenario could not run.'
            : e.forbidden
              ? 'This role cannot run scenarios.'
              : `The scenario could not run (${e.message}).`
          : 'The scenario could not run.';
      set({ phase: 'error', error: msg });
    }
  },
  stop: () => {
    runSeq++;
    set({ tour: null, step: 0, phase: 'idle', error: null, missionId: null });
  },
  go: (step) => set({ step }),
  setAuto: (v) => set({ auto: v }),
}));
