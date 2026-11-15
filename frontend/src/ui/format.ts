// Turkish formatting helpers shared by all panels.
import type { Role } from '../lib/store';

const TR = 'en-GB';

export const ROLE_LABEL: Record<Role, string> = {
  ASTRONAUT: 'Astronaut',
  CREW_MEDICAL_OFFICER: 'Crew medical officer',
  GROUND: 'Ground team',
};

export function roleLabel(role: Role | null | undefined): string {
  return role ? ROLE_LABEL[role] ?? role : 'No role';
}

function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "15 Kas 14:05" (add seconds with withSeconds). "—" for empty/invalid. */
export function formatDateTime(v: string | number | Date | null | undefined, withSeconds = false): string {
  const d = toDate(v);
  if (!d) return '—';
  return d.toLocaleString(TR, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

export function formatTime(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  return d ? d.toLocaleTimeString(TR, { hour: '2-digit', minute: '2-digit' }) : '—';
}

/** "3 min ago", "in 2 h", "just now". */
export function formatRelative(v: string | number | Date | null | undefined, now = Date.now()): string {
  const d = toDate(v);
  if (!d) return '—';
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return diff < 0 ? 'just now' : 'now';
  const units: [number, string][] = [
    [86_400_000, 'day'],
    [3_600_000, 'h'],
    [60_000, 'min'],
  ];
  for (const [ms, unit] of units) {
    if (abs >= ms) {
      const n = Math.round(abs / ms);
      return diff < 0 ? `${n} ${unit} ago` : `in ${n} ${unit}`;
    }
  }
  return 'now';
}

/** Seconds -> "1 h 5 min" / "4 min" / "30 s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  if (m) return `${m} min`;
  return `${s} s`;
}

/** Locale number with up to `digits` decimals; "—" for null/NaN. */
export function formatNumber(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString(TR, { maximumFractionDigits: digits });
}
