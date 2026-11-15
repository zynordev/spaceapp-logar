/** Light-time for display: "0 s", "1.3 s", "12.5 min", "1 h 2 min". */
export function fmtDelay(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, seconds);
  const num = (v: number, d: number) => v.toLocaleString('en-US', { maximumFractionDigits: d });
  if (s < 60) return `${num(s, s < 10 ? 1 : 0)} s`;
  if (s < 3600) {
    const m = s / 60;
    return `${num(m, m < 10 ? 1 : 0)} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
