// Data hooks for the vitals track. All network access goes through the shared
// `usePolling` / `api` client (src/lib/api.ts).
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { ATTENTION, FALLBACK_METRICS } from './copy';
import type { AlertRead, CrewStatus, MeasurementSeries, MetricDef, RuleStatus } from './types';

export function useSelection() {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const environmentTargetId = useApp((s) => s.environmentTargetId);
  return { missionId, crewId, environmentTargetId };
}

export function useCrewStatus() {
  const { missionId, crewId, environmentTargetId } = useSelection();
  const path = missionId && crewId
    ? `/v1/crew/${encodeURIComponent(crewId)}/status${qs({ mission_id: missionId, environment_target_id: environmentTargetId })}`
    : null;
  return usePolling<CrewStatus>(path, 5000);
}

export function useAlerts() {
  const { missionId } = useSelection();
  return usePolling<AlertRead[]>(missionId ? `/v1/alerts${qs({ mission_id: missionId, limit: 100 })}` : null, 5000);
}

export function useMetrics(): MetricDef[] {
  const { data } = usePolling<MetricDef[]>('/v1/metrics', 60000);
  return data && data.length ? data : (FALLBACK_METRICS as unknown as MetricDef[]);
}

export function targetFor(metric: MetricDef, crewId: string | null, envId: string | null): string | null {
  return metric.target_type === 'ENVIRONMENT' || metric.category === 'environment' ? envId : crewId;
}

export function useSeries(metric: MetricDef | null, limit: number, intervalMs: number) {
  const { missionId, crewId, environmentTargetId } = useSelection();
  const target = metric ? targetFor(metric, crewId, environmentTargetId) : null;
  const path = metric && missionId && target
    ? `/v1/measurements${qs({ mission_id: missionId, target_id: target, metric: metric.metric, limit })}`
    : null;
  return usePolling<MeasurementSeries>(path, intervalMs);
}

export const rank = (r: { health_attention: string }) =>
  (ATTENTION as Record<string, { rank: number }>)[r.health_attention]?.rank ?? ATTENTION.UNKNOWN.rank;

export function worst<T extends { health_attention: string }>(list: T[]): T | null {
  let best: T | null = null;
  for (const r of list) if (!best || rank(r) > rank(best)) best = r;
  return best;
}

/** Rules whose primary metric is `m`; falls back to rules that use it as a related metric. */
export function rulesForMetric(rules: RuleStatus[], m: string): RuleStatus[] {
  const primary = rules.filter((r) => r.metric === m);
  return primary.length ? primary : rules.filter((r) => r.related_metrics?.includes(m));
}

/** Track-local UI state shared by the two panels (alert → chart linking). */
interface VitalsUi {
  metric: string | null;
  ruleId: string | null;
  activeAlertId: string | null;
  select: (metric: string | null, ruleId?: string | null) => void;
  setActiveAlert: (id: string | null) => void;
}

export const useVitalsUi = create<VitalsUi>((set) => ({
  metric: null,
  ruleId: null,
  activeAlertId: null,
  select: (metric, ruleId = null) => set({ metric, ruleId }),
  setActiveAlert: (id) => set({ activeAlertId: id }),
}));

/** Re-render every `ms` (live countdowns, relative times). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
