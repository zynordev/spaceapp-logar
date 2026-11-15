// Data for the body map: polls contract C every 5 s through the shared
// client, and falls back to a neutral body or the local demo fixture.
import { useMemo, useState } from 'react';
import { qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { CHIP_ORDER, REGION_META } from './meta';
import { buildMockBodyMap } from './mock';
import { isRegionKey, type Attention, type BodyMapRead, type BodyRegionRead, type RegionKey, type RegionStates } from './types';

export type BodyMapMode = 'live' | 'demo' | 'neutral';

export interface BodyMapView {
  mode: BodyMapMode;
  /** Why we are not live (Turkish, shown in a note). */
  note: string | null;
  regions: Record<RegionKey, BodyRegionRead>;
  states: RegionStates;
  overall: Attention;
  generatedAt: string | null;
  /** Live data could not be refreshed; showing last known values. */
  stale: boolean;
  loading: boolean;
  demoForced: boolean;
  setDemoForced: (v: boolean) => void;
  reload: () => void;
}

function urlWantsMock(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('mock') === '1';
  } catch {
    return false;
  }
}

function emptyRegion(key: RegionKey): BodyRegionRead {
  const m = REGION_META[key];
  return {
    region: key,
    label_tr: m.label,
    description_tr: m.description,
    attention: 'UNKNOWN',
    coverage: 'GAP',
    rules: [],
    metrics: [],
    latest_values: [],
    open_alert_ids: [],
  };
}

function normalise(map: BodyMapRead | null): Record<RegionKey, BodyRegionRead> {
  const out = {} as Record<RegionKey, BodyRegionRead>;
  for (const key of CHIP_ORDER) out[key] = emptyRegion(key);
  if (!map || !Array.isArray(map.regions)) return out;
  for (const r of map.regions) {
    if (!r || !isRegionKey(r.region)) continue; // unknown keys are ignored
    out[r.region] = {
      ...emptyRegion(r.region),
      ...r,
      label_tr: r.label_tr || REGION_META[r.region].label,
      rules: Array.isArray(r.rules) ? r.rules : [],
      metrics: Array.isArray(r.metrics) ? r.metrics : [],
      latest_values: Array.isArray(r.latest_values) ? r.latest_values : [],
      open_alert_ids: Array.isArray(r.open_alert_ids) ? r.open_alert_ids : [],
    };
  }
  return out;
}

export function useBodyMap(): BodyMapView {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const environmentTargetId = useApp((s) => s.environmentTargetId);
  const [demoForced, setDemoForced] = useState<boolean>(urlWantsMock);

  const path =
    !demoForced && missionId && crewId
      ? `/v1/crew/${encodeURIComponent(crewId)}/body-map${qs({
          mission_id: missionId,
          environment_target_id: environmentTargetId,
        })}`
      : null;
  const polled = usePolling<BodyMapRead>(path, 5000);

  const endpointMissing = !!polled.error?.notFound && !polled.data;
  const useDemo = demoForced || endpointMissing;

  // Rebuild the fixture only when the demo is (re)entered or the selection changes.
  const mock = useMemo(
    () => (useDemo ? buildMockBodyMap(crewId, missionId) : null),
    [useDemo, crewId, missionId],
  );

  const source: BodyMapRead | null = useDemo ? mock : polled.data;
  const regions = useMemo(() => normalise(source), [source]);
  const states = useMemo(() => {
    const s = {} as RegionStates;
    for (const key of CHIP_ORDER) {
      s[key] = { attention: regions[key].attention, alerts: regions[key].open_alert_ids.length };
    }
    return s;
  }, [regions]);

  let mode: BodyMapMode;
  let note: string | null = null;
  if (useDemo) {
    mode = 'demo';
    note = demoForced
      ? 'DEMO VERİSİ — örnek değerler gösteriliyor, gerçek ölçüm değildir.'
      : 'Sunucu vücut haritası verisi vermedi (404). DEMO VERİSİ gösteriliyor — gerçek ölçüm değildir.';
  } else if (!missionId || !crewId) {
    mode = 'neutral';
    note = 'Görev ve mürettebat seçilmedi — bölgeler nötr (bilinmiyor) gösteriliyor.';
  } else if (polled.data) {
    mode = 'live';
    if (polled.error) {
      note = polled.error.network
        ? 'Sunucuya ulaşılamıyor — son bilinen değerler gösteriliyor.'
        : `Güncellenemedi (${polled.error.message}) — son bilinen değerler gösteriliyor.`;
    }
  } else {
    mode = 'neutral';
    note = polled.error
      ? polled.error.network
        ? 'Sunucuya ulaşılamıyor — bölgeler nötr (bilinmiyor) gösteriliyor.'
        : `Vücut haritası alınamadı: ${polled.error.message}`
      : 'Vücut haritası yükleniyor…';
  }

  return {
    mode,
    note,
    regions,
    states,
    overall: source?.overall_attention ?? 'UNKNOWN',
    generatedAt: source?.generated_at ?? null,
    stale: mode === 'live' && !!polled.error,
    loading: polled.loading,
    demoForced,
    setDemoForced,
    reload: polled.reload,
  };
}
