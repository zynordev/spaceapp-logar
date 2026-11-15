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

const DATE_FMT = new Intl.DateTimeFormat('tr-TR', {
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
  if (diff < 60) return 'az önce';
  return `${formatDuration(diff - (diff % 60))} önce`;
}

export function shortHash(hash: string | null | undefined, n = 12): string {
  if (!hash) return '—';
  return hash.length > n ? `${hash.slice(0, n)}…` : hash;
}

export interface RecipientInfo {
  label: string;
  routed: string;
  icon: string;
}

export const RECIPIENT_INFO: Record<Recipient, RecipientInfo> = {
  FLIGHT_SURGEON: {
    label: 'Uçuş cerrahı',
    routed: 'Sağlık uyarıları, kırmızı bayraklar, öznel bildirimler, laboratuvar ve öncelikli bildirimler',
    icon: '✚',
  },
  LIFE_SUPPORT: {
    label: 'Yaşam destek (ECLSS)',
    routed: 'Kabin CO₂, O₂ ve basınç değerlendirmeleri ile ortam uyarıları',
    icon: '◎',
  },
  RADIATION: {
    label: 'Radyasyon ekibi',
    routed: 'Doz hızı olayları ve kümülatif doz eğilimi',
    icon: '☢︎',
  },
  MISSION_CONTROL: {
    label: 'Görev kontrol',
    routed: 'Genel durum özeti ve tüm ekiplere giden uyarıların kopyası',
    icon: '⌖',
  },
};

export function recipientLabel(r: string): string {
  return (RECIPIENT_INFO as Record<string, RecipientInfo | undefined>)[r]?.label ?? r;
}

export const KIND_LABEL: Record<PacketItemKind, string> = {
  ALERT: 'Uyarı',
  RULE_EVALUATION: 'Kural değerlendirmesi',
  CHECK_IN: 'Öznel bildirim',
  LAB_RESULT: 'Laboratuvar',
  RED_FLAG: 'Kırmızı bayrak',
  TREND: 'Eğilim',
  ESCALATION: 'Öncelikli bildirim',
};

export function kindLabel(k: string): string {
  return (KIND_LABEL as Record<string, string | undefined>)[k] ?? k;
}

export const PRIORITY_INFO: Record<EscalationPriority, { label: string; icon: string }> = {
  CRITICAL: { label: 'Kritik', icon: '⬣' },
  ALERT: { label: 'Uyarı', icon: '▲' },
};

export const COVERAGE_INFO: Record<Coverage, { label: string; icon: string; legend: string }> = {
  RULE: {
    label: 'Kural var',
    icon: '◆',
    legend: 'Karar destek kuralı çalışıyor (teşhis değildir).',
  },
  DATA_ONLY: {
    label: 'Sadece veri',
    icon: '◇',
    legend: 'Veri toplanıyor ve gösteriliyor; doğrulanmış eşik/kural yok.',
  },
  GAP: {
    label: 'Boşluk',
    icon: '○',
    legend: 'GAP = bu prototipte henüz izlenmiyor.',
  },
};

export function coverageOf(c: string): Coverage {
  return c === 'RULE' || c === 'DATA_ONLY' ? c : 'GAP';
}

/** Filename-safe slug for downloads. */
export function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
}
