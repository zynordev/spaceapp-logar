// Turkish labels and formatting helpers for the ground panel (pure functions).
import type { Coverage, EscalationPriority, PacketItemKind, Recipient } from './types';

/** "12 dk 30 sn", "45 sn", "1 sa 2 dk". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} sn`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
  return sec > 0 ? `${m} dk ${sec} sn` : `${m} dk`;
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** Mission times are shown in UTC, the shared clock of crew and ground. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return `${DATE_FMT.format(new Date(t))} UTC`;
}

export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.round((now - t) / 1000);
  if (diff < 0) return 'gelecekte';
  if (diff < 60) return 'just now';
  return `${formatDuration(diff - (diff % 60))} ago`;
}

export function shortHash(hash: string | null | undefined, n = 12): string {
  if (!hash) return '—';
  return hash.length > n ? `${hash.slice(0, n)}…` : hash;
}

import type { IconName } from '../../ui';

export interface RecipientInfo {
  label: string;
  routed: string;
  icon: IconName;
}

export const RECIPIENT_INFO: Record<Recipient, RecipientInfo> = {
  FLIGHT_SURGEON: {
    label: 'Flight surgeon',
    routed: 'Health alerts, red flags, subjective reports, lab results and priority notifications',
    icon: 'plus',
  },
  LIFE_SUPPORT: {
    label: 'Life support (ECLSS)',
    routed: 'Cabin CO₂, O₂ and pressure assessments and environmental alerts',
    icon: 'wind',
  },
  RADIATION: {
    label: 'Radyasyon ekibi',
    routed: 'Dose-rate events and cumulative dose trend',
    icon: 'radiation',
  },
  MISSION_CONTROL: {
    label: 'Mission control',
    routed: 'Overall status summary and a copy of the alerts sent to all teams',
    icon: 'satellite',
  },
};

export function recipientLabel(r: string): string {
  return (RECIPIENT_INFO as Record<string, RecipientInfo | undefined>)[r]?.label ?? r;
}

export const KIND_LABEL: Record<PacketItemKind, string> = {
  ALERT: 'Warning',
  RULE_EVALUATION: 'Rule evaluation',
  CHECK_IN: 'Subjective report',
  LAB_RESULT: 'Laboratuvar',
  RED_FLAG: 'Red flag',
  TREND: 'Trend',
  ESCALATION: 'Priority notification',
};

export function kindLabel(k: string): string {
  return (KIND_LABEL as Record<string, string | undefined>)[k] ?? k;
}

export const PRIORITY_INFO: Record<EscalationPriority, { label: string; icon: IconName }> = {
  CRITICAL: { label: 'Critical', icon: 'critical' },
  ALERT: { label: 'Warning', icon: 'alert' },
};

export const COVERAGE_INFO: Record<Coverage, { label: string; icon: IconName; legend: string }> = {
  RULE: {
    label: 'Rule in place',
    icon: 'check',
    legend: 'Decision support rule active (not a diagnosis).',
  },
  DATA_ONLY: {
    label: 'Sadece veri',
    icon: 'eye',
    legend: 'Data is collected and shown; no validated threshold or rule.',
  },
  GAP: {
    label: 'Gap',
    icon: 'circle',
    legend: 'GAP = not yet monitored in this prototype.',
  },
};

export function coverageOf(c: string): Coverage {
  return c === 'RULE' || c === 'DATA_ONLY' ? c : 'GAP';
}

/** Filename-safe slug for downloads. */
export function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
}
