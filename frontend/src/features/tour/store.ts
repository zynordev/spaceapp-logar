// Guided jury tour state. Kept tiny and import-light: the top-bar buttons
// import only this; the overlay (TourHost) is its own lazy chunk.
import { create } from 'zustand';
import { ApiError, api } from '../../lib/api';
import { useApp } from '../../lib/store';

export type TourId = 'co2' | 'redflag';

export const TOUR_SCENARIO: Record<TourId, { scenarioId: string; title: string }> = {
  co2: { scenarioId: 'co2-headache', title: 'CO₂ + baş ağrısı' },
  redflag: { scenarioId: 'chest-pain-red-flag', title: 'Kırmızı bayrak' },
};

interface DemoRunLite {
  mission_id: string;
  crew_member_id: string;
  environment_target_id: string;
  scenario_id: string;
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
    if (window.location.hash.startsWith('#/yer')) window.location.hash = '#/';
    try {
      const r = await api<DemoRunLite>(
        'POST',
        `/v1/demo/scenarios/${encodeURIComponent(TOUR_SCENARIO[id].scenarioId)}/run`,
        undefined,
        120_000,
      );
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
            ? 'Sunucuya ulaşılamıyor; senaryo çalıştırılamadı.'
            : e.forbidden
              ? 'Bu rol senaryo çalıştıramıyor.'
              : `Senaryo çalıştırılamadı (${e.message}).`
          : 'Senaryo çalıştırılamadı.';
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
