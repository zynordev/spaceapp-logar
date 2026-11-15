// Attention level semantics shared by every panel: colour + icon + Turkish
// label, always together. UNKNOWN is neutral slate (never green): missing data
// is not "normal".
import type { ReactNode } from 'react';
import type { Attention } from '../lib/store';
import { Icon, type IconName } from './icons';

export interface AttentionMeta {
  level: Attention;
  label: string;
  icon: IconName;
  rank: number;
  /** One-sentence plain-language meaning for non-doctor astronauts. */
  description: string;
}

export const ATTENTION: Record<Attention, AttentionMeta> = {
  NORMAL: {
    level: 'NORMAL',
    label: 'Normal',
    icon: 'check',
    rank: 1,
    description: 'Etkin bir dikkat kuralı yok.',
  },
  UNKNOWN: {
    level: 'UNKNOWN',
    label: 'Bilinmiyor',
    icon: 'question',
    rank: 2,
    description: 'Güvenilir değerlendirme için yeterli veri yok. Bu "normal" anlamına gelmez.',
  },
  WATCH: {
    level: 'WATCH',
    label: 'İzle',
    icon: 'eye',
    rank: 3,
    description: 'Bir ölçüm izlenmeli; acil olmayan bir yeniden kontrol gerekebilir.',
  },
  ALERT: {
    level: 'ALERT',
    label: 'Uyarı',
    icon: 'alert',
    rank: 4,
    description: 'Eylem kartındaki adımlar kısa sürede uygulanmalı; görev prosedürü önceliklidir.',
  },
  CRITICAL: {
    level: 'CRITICAL',
    label: 'Kritik',
    icon: 'critical',
    rank: 5,
    description: 'Acil prosedür hemen açılmalı ve ekip sağlık sorumlusu bilgilendirilmelidir.',
  },
};

export const ATTENTION_ORDER: Attention[] = ['CRITICAL', 'ALERT', 'WATCH', 'UNKNOWN', 'NORMAL'];

/** Coerce anything (null, unknown string) to a valid level; default UNKNOWN. */
export function toAttention(value: unknown): Attention {
  return typeof value === 'string' && value in ATTENTION ? (value as Attention) : 'UNKNOWN';
}

export function attentionMeta(value: unknown): AttentionMeta {
  return ATTENTION[toAttention(value)];
}

/** Worst level of a list (rank NORMAL < UNKNOWN < WATCH < ALERT < CRITICAL). Empty -> UNKNOWN. */
export function worstAttention(levels: Iterable<unknown>): Attention {
  let worst: Attention | null = null;
  for (const l of levels) {
    const a = toAttention(l);
    if (!worst || ATTENTION[a].rank > ATTENTION[worst].rank) worst = a;
  }
  return worst ?? 'UNKNOWN';
}

/** CSS class that sets --c / --c-bg / --c-fg for the level (see ui.css). */
export function attentionClass(value: unknown): string {
  return `att-${toAttention(value).toLowerCase()}`;
}

export interface AttentionBadgeProps {
  level: Attention | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  /** Override the visible text (the level label is still in the accessible name). */
  children?: ReactNode;
  /** Prefix for screen readers, e.g. "Genel durum". */
  srPrefix?: string;
  className?: string;
  title?: string;
}

export function AttentionBadge({ level, size = 'md', children, srPrefix, className, title }: AttentionBadgeProps) {
  const m = attentionMeta(level);
  return (
    <span
      className={`ui-att-badge ui-att-badge--${size} ${attentionClass(m.level)}${className ? ` ${className}` : ''}`}
      title={title ?? m.description}
      data-attention={m.level}
    >
      <Icon name={m.icon} size={size === 'lg' ? 22 : size === 'sm' ? 13 : 15} />
      {srPrefix && <span className="sr-only">{srPrefix}: </span>}
      <span>{children ?? m.label}</span>
      {children && <span className="sr-only"> ({m.label})</span>}
    </span>
  );
}
