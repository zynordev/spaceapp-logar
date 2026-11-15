// Shared API client (owned by the UI-shell track). Every feature calls the
// backend ONLY through `api()` / `usePolling()` so auth, errors and offline
// handling stay in one place. Endpoint shapes: see the contract (CONTRACT.md).
import { useEffect, useRef, useState } from 'react';
import { useApp } from './store';

export class ApiError extends Error {
  status: number;
  code: string | null;
  detail: unknown;
  constructor(message: string, status: number, code: string | null = null, detail: unknown = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
  /** Endpoint not on this server yet (parallel build) or resource missing. */
  get notFound() { return this.status === 404; }
  get forbidden() { return this.status === 403; }
  get network() { return this.status === 0; }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(params: Query): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  timeoutMs = 10000,
): Promise<T> {
  const { token, setOffline, setToken, setLoginRequired, bumpData } = useApp.getState();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    setOffline(true);
    throw new ApiError('Sunucuya ulaşılamıyor', 0);
  } finally {
    clearTimeout(timer);
  }
  setOffline(false);

  if (!res.ok) {
    let payload: any = null;
    try { payload = await res.json(); } catch { /* non-JSON error */ }
    if (res.status === 401) {
      if (token) setToken(null);
      setLoginRequired(true);
    }
    const detail = payload?.detail ?? null;
    const message = typeof detail === 'string' ? detail : detail?.message ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status, payload?.code ?? null, detail);
  }
  if (method === 'POST') bumpData();
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Polled<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetch `path` now, every `intervalMs` while the tab is visible, and whenever
 * a write bumps `dataVersion`. Pass `null` to pause (e.g. no mission selected).
 * Keeps the last good data on error (offline-first: show last known values).
 */
export function usePolling<T>(path: string | null, intervalMs = 5000): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const dataVersion = useApp((s) => s.dataVersion);
  const token = useApp((s) => s.token);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current !== path) { setData(null); setError(null); last.current = path; }
    if (!path) return;
    let alive = true;
    const run = async () => {
      setLoading(true);
      try {
        const d = await api<T>('GET', path);
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
  }, [path, intervalMs, dataVersion, token, tick]);

  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
