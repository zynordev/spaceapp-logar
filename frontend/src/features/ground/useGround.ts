// Data hooks: live through the shared `usePolling`, or the local fixture in `?mock=1`.
import { useEffect, useState } from 'react';
import { ApiError, usePolling, type Polled } from '../../lib/api';
import { useApp } from '../../lib/store';

/**
 * Poll `path` live, or call `mockFn` when it is given (mock mode). Both hooks
 * are always called so the hook order never changes.
 */
export function useSource<T>(
  path: string | null,
  mockFn: (() => Promise<T>) | null,
  intervalMs: number,
): Polled<T> {
  const live = usePolling<T>(mockFn ? null : path, intervalMs);
  const dataVersion = useApp((s) => s.dataVersion);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!mockFn) return;
    let alive = true;
    const run = async () => {
      setLoading(true);
      try {
        const d = await mockFn();
        if (alive) { setData(d); setError(null); }
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e : new ApiError(String(e), 0));
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    const id = setInterval(() => { if (!document.hidden) run(); }, intervalMs);
    return () => { alive = false; clearInterval(id); };
    // mockFn identity is stable per caller (module function or memoised).
  }, [mockFn, intervalMs, dataVersion, tick]);

  if (!mockFn) return live;
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

/** Human-readable error line for a failed ground call. */
export function errorText(e: ApiError | null, endpoint: string): string | null {
  if (!e) return null;
  if (e.status === 404) return `Not on the server yet (${endpoint}). Add ?mock=1 to the address to preview.`;
  if (e.status === 0) return 'Cannot reach the server — showing the last known data.';
  if (e.status === 401) return 'Sign-in required — please sign in.';
  if (e.status === 403) return 'You do not have permission to view this information.';
  return serverMessage(e);
}

/**
 * Message for an unexpected status. Error bodies use the nested shape
 * `{"error": {"code", "message"}}` (observability.py) which the shared client
 * does not read, so `e.message` may just be "HTTP n": don't repeat the status.
 * Known statuses (401/403/404/409) are mapped to our own Turkish copy instead.
 */
export function serverMessage(e: ApiError): string {
  const msg = e.message;
  return !msg || msg.startsWith('HTTP ') ? `Server error (HTTP ${e.status})` : `${msg} (HTTP ${e.status})`;
}
