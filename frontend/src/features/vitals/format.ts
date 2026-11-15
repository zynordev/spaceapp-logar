const TR = 'tr-TR';

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function fmtNum(v: number | null | undefined, max = 2): string {
  if (!isNum(v)) return '—';
  return v.toLocaleString(TR, { maximumFractionDigits: max });
}

/** Number of decimals that keeps the value readable for its magnitude. */
export function autoDecimals(v: number): number {
  const a = Math.abs(v);
  if (a >= 100) return 0;
  if (a >= 10) return 1;
  return 2;
}

export function fmtAuto(v: number | null | undefined): string {
  return isNum(v) ? fmtNum(v, autoDecimals(v)) : '—';
}

export function fmtDateTime(iso: string | number | null | undefined, withSeconds = false): string {
  const t = typeof iso === 'number' ? iso : toMs(iso);
  if (t == null) return '—';
  const o: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  if (withSeconds) o.second = '2-digit';
  if (new Date(t).getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return new Date(t).toLocaleString(TR, o);
}

export function fmtClock(iso: string | number | null | undefined): string {
  const t = typeof iso === 'number' ? iso : toMs(iso);
  return t == null ? '—' : new Date(t).toLocaleTimeString(TR, { hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString(TR, { day: '2-digit', month: 'short' });
}

export function relTime(iso: string | number | null | undefined, now = Date.now()): string {
  const t = typeof iso === 'number' ? iso : toMs(iso);
  if (t == null) return '';
  const s = Math.round((now - t) / 1000);
  if (s < -60) return 'gelecekte';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  if (totalMin < 60) return `${totalMin} dk`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

/** Only http(s) links are rendered as links; anything else stays text. */
export function safeUrl(u: string | null | undefined): string | null {
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null;
}
