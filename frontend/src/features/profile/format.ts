/** Light-time for display: "0 sn", "1,3 sn", "12,5 dk", "1 sa 2 dk". */
export function fmtDelay(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, seconds);
  const num = (v: number, d: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: d });
  if (s < 60) return `${num(s, s < 10 ? 1 : 0)} sn`;
  if (s < 3600) {
    const m = s / 60;
    return `${num(m, m < 10 ? 1 : 0)} dk`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}
