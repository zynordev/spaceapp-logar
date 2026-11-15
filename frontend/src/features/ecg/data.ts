// Loads the recorded ECG excerpt (PhysioNet MIT-BIH NSR 16265) shipped in
// public/ecg/. Static asset, not a backend endpoint: fetched once per page.

export const ECG_URL = `${import.meta.env.BASE_URL}ecg/nsrdb-16265.json`;
export const ECG_ATTRIBUTION_URL = `${import.meta.env.BASE_URL}ecg/ATTRIBUTION.md`;

export interface EcgRecord {
  source: string;
  record: string;
  database: string;
  version: string;
  license: string;
  license_url: string;
  citation: string;
  url: string;
  signal_name: string;
  fs: number;
  units: 'mV';
  start_seconds: number;
  duration_seconds: number;
  samples: number[];
}

function isRecord(v: unknown): v is EcgRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.record === 'string' &&
    typeof r.fs === 'number' &&
    Number.isFinite(r.fs) &&
    r.fs > 0 &&
    r.units === 'mV' &&
    Array.isArray(r.samples) &&
    r.samples.length > 1 &&
    r.samples.every((s) => typeof s === 'number' && Number.isFinite(s))
  );
}

let cache: Promise<EcgRecord> | null = null;

export function loadEcg(): Promise<EcgRecord> {
  if (!cache) {
    cache = fetch(ECG_URL, { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // A missing file may come back as an HTML page: JSON.parse rejects it.
        const body: unknown = await res.json();
        if (!isRecord(body)) throw new Error('Geçersiz EKG dosyası');
        return body;
      })
      .catch((e: unknown) => {
        cache = null; // allow a retry
        throw e;
      });
  }
  return cache;
}
