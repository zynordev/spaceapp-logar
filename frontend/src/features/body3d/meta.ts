// Static presentation data for the body map: colours, Turkish labels, glyphs,
// plain-language explanations. Server text (label_tr, description_tr) wins
// when present; these are fallbacks for the neutral / offline state.
import type { IconName } from '../../ui';
import type { Attention, Coverage, RegionKey } from './types';

export const ATTENTION_RANK: Record<Attention, number> = {
  NORMAL: 0,
  UNKNOWN: 1,
  WATCH: 2,
  ALERT: 3,
  CRITICAL: 4,
};

export interface AttentionMeta {
  /** Turkish label shown next to the colour (colour is never the only signal). */
  label: string;
  /** Short, font-safe glyph (text fallback only; UI renders `icon`). */
  glyph: string;
  /** Shared SVG icon for the level. */
  icon: IconName;
  /** One-line meaning for a non-doctor. */
  hint: string;
  /** Hex used by three.js (CSS uses the matching variable). */
  hex: string;
  cssVar: string;
}

export const ATTENTION: Record<Attention, AttentionMeta> = {
  NORMAL: {
    label: 'Normal',
    glyph: '✓',
    icon: 'check',
    hint: 'Kurallar sorun görmüyor.',
    hex: '#22c55e',
    cssVar: 'var(--att-normal, #22c55e)',
  },
  UNKNOWN: {
    label: 'Bilinmiyor',
    glyph: '?',
    icon: 'question',
    hint: 'Yeterli veri ya da kural yok — "normal" sanmayın.',
    hex: '#94a3b8',
    cssVar: 'var(--att-unknown, #94a3b8)',
  },
  WATCH: {
    label: 'İzlemede',
    glyph: '!',
    icon: 'eye',
    hint: 'Dikkat edin, gelişmeyi takip edin.',
    hex: '#eab308',
    cssVar: 'var(--att-watch, #eab308)',
  },
  ALERT: {
    label: 'Uyarı',
    glyph: '!!',
    icon: 'alert',
    hint: 'Eylem kartını açın, adımları uygulayın.',
    hex: '#ef4b4b',
    cssVar: 'var(--att-alert, #ef4b4b)',
  },
  CRITICAL: {
    label: 'Kritik',
    glyph: '!!!',
    icon: 'critical',
    hint: 'Hemen müdahale edin, sağlık sorumlusunu çağırın.',
    hex: '#ef4444',
    cssVar: 'var(--att-critical, #ef4444)',
  },
};

export interface RegionMeta {
  label: string;
  short: string;
  description: string;
  /** Point the camera focuses on (world units, feet at y=0, facing +z). */
  focus: [number, number, number];
  /** Camera distance when focused. */
  distance: number;
  /** Anchor for the 3D marker label. */
  marker: [number, number, number];
}

export const REGION_META: Record<RegionKey, RegionMeta> = {
  head: {
    label: 'Baş / Beyin',
    short: 'Baş',
    description: 'Uyku, bilişsel durum ve baş ağrısı gibi belirtiler.',
    focus: [0, 1.62, 0],
    distance: 1.05,
    marker: [-0.2, 1.74, 0],
  },
  eyes: {
    label: 'Gözler',
    short: 'Göz',
    description: 'Görme değişiklikleri (uzay uçuşuna bağlı göz sendromu, SANS).',
    focus: [0, 1.625, 0.09],
    distance: 0.8,
    marker: [0.2, 1.67, 0.12],
  },
  inner_ear: {
    label: 'İç kulak / Denge',
    short: 'Denge',
    description: 'Hareket hastalığı, baş dönmesi ve denge.',
    focus: [0.1, 1.615, 0],
    distance: 0.8,
    marker: [0.26, 1.58, 0],
  },
  heart: {
    label: 'Kalp',
    short: 'Kalp',
    description: 'Nabız ve kalp-dolaşım belirtileri.',
    focus: [0.03, 1.27, 0.04],
    distance: 1.1,
    marker: [0.32, 1.3, 0.1],
  },
  lungs: {
    label: 'Akciğerler',
    short: 'Akciğer',
    description: 'Solunum hızı ve kandaki oksijen (SpO₂).',
    focus: [0, 1.29, 0],
    distance: 1.2,
    marker: [-0.34, 1.36, 0.06],
  },
  torso: {
    label: 'Gövde / Karın',
    short: 'Gövde',
    description: 'Sindirim, beslenme, sıvı dengesi ve karın belirtileri.',
    focus: [0, 1.05, 0.02],
    distance: 1.25,
    marker: [-0.3, 1.04, 0.08],
  },
  musculoskeletal: {
    label: 'Kas-iskelet',
    short: 'Kas-iskelet',
    description: 'Kemik kaybı, kas gücü, omurga ve eklemler.',
    focus: [0, 0.7, 0],
    distance: 2.0,
    marker: [0.24, 0.55, 0],
  },
  skin: {
    label: 'Deri / Vücut ısısı',
    short: 'Deri',
    description: 'Vücut sıcaklığı, deri tahrişi ve yaralar.',
    focus: [0, 1.05, 0],
    distance: 2.4,
    marker: [-0.42, 0.82, 0],
  },
  cabin: {
    label: 'Kabin ortamı',
    short: 'Kabin',
    description: 'Yaşam alanı: CO₂, O₂, basınç ve radyasyon.',
    focus: [0, 1.0, 0],
    distance: 4.7,
    marker: [0.62, 1.9, 0],
  },
};

export const COVERAGE_TEXT: Record<Coverage, { label: string; text: string }> = {
  RULE: {
    label: 'Kuralla izleniyor',
    text: 'Bu bölge otomatik olarak değerlendiriliyor: ölçümler açıklanabilir kurallarla eşiklere göre kontrol ediliyor.',
  },
  DATA_ONLY: {
    label: 'Sadece veri',
    text: 'Veri toplanıyor ama otomatik kural yok. Değerleri bir uzman (sağlık sorumlusu / yer ekibi) yorumlamalı.',
  },
  GAP: {
    label: 'Kapsam boşluğu',
    text: 'Bu bölge için henüz veri ya da kural yok. Durum bilinmiyor — sorun olmadığı anlamına gelmez.',
  },
};

export const QUALITY_TEXT: Record<string, string> = {
  VALID: 'Veri geçerli',
  SUSPECT: 'Veri şüpheli',
  MISSING: 'Veri eksik',
  FAULT: 'Sensör arızası',
};

/** Region order for chips, 2D drawing and screen readers (top to bottom). */
export const CHIP_ORDER: RegionKey[] = [
  'head',
  'eyes',
  'inner_ear',
  'heart',
  'lungs',
  'torso',
  'musculoskeletal',
  'skin',
  'cabin',
];
