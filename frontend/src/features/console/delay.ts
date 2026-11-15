// Light-delay presets + time-compression settings for the ground console.
// Everything here is a DISPLAY-ONLY simulation: the API answers instantly;
// only this screen holds items back to show when the ground could know them.
import { useCallback, useEffect, useState } from 'react';

export type PresetId = 'leo' | 'moon' | 'mars-near' | 'mars-avg' | 'mars-far' | 'server' | 'custom';

export interface Preset {
  id: PresetId;
  label: string;
  /** One-way delay in seconds; null for server/custom (resolved at runtime). */
  seconds: number | null;
  hint: string;
}

// One-way light time. Mars varies with orbital geometry; the rounded presets
// follow the brief (en yakın ~4 dk, ortalama ~12,5 dk, en uzak ~24 dk).
export const PRESETS: Preset[] = [
  { id: 'leo', label: 'Dünya yörüngesi', seconds: 0, hint: '≈ 0 sn' },
  { id: 'moon', label: 'Ay', seconds: 1.3, hint: '≈ 1,3 sn' },
  { id: 'mars-near', label: 'Mars en yakın', seconds: 240, hint: '≈ 4 dk' },
  { id: 'mars-avg', label: 'Mars ortalama', seconds: 750, hint: '≈ 12,5 dk' },
  { id: 'mars-far', label: 'Mars en uzak', seconds: 1440, hint: '≈ 24 dk' },
  { id: 'server', label: 'Sunucu ayarı', seconds: null, hint: 'sunucu' },
  { id: 'custom', label: 'Özel', seconds: null, hint: 'saniye' },
];

export const COMPRESSIONS = [1, 10, 60] as const;
export type Compression = (typeof COMPRESSIONS)[number];

export const CUSTOM_MAX_SECONDS = 7200;

export interface DelaySettings {
  preset: PresetId;
  customSeconds: number;
  compression: Compression;
}

const KEY = 'logar.console.delay';
const DEFAULTS: DelaySettings = { preset: 'server', customSeconds: 60, compression: 60 };

export function clampSeconds(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(CUSTOM_MAX_SECONDS, Math.max(0, Math.round(v * 10) / 10));
}

function read(): DelaySettings {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<DelaySettings>;
    return {
      preset: PRESETS.some((p) => p.id === v.preset) ? (v.preset as PresetId) : DEFAULTS.preset,
      customSeconds: clampSeconds(Number(v.customSeconds ?? DEFAULTS.customSeconds)),
      compression: COMPRESSIONS.includes(v.compression as Compression) ? (v.compression as Compression) : DEFAULTS.compression,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useDelaySettings() {
  const [settings, setSettings] = useState<DelaySettings>(read);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable: settings live in memory */
    }
  }, [settings]);
  const update = useCallback((patch: Partial<DelaySettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  return [settings, update] as const;
}

/**
 * Effective one-way delay (seconds). `null` = the chosen source has no value
 * (server preset while the server has no SPACEAPP_LINK_DELAY_SECONDS).
 */
export function resolveDelay(settings: DelaySettings, serverSeconds: number | null | undefined): number | null {
  if (settings.preset === 'custom') return settings.customSeconds;
  if (settings.preset === 'server') return serverSeconds ?? null;
  return PRESETS.find((p) => p.id === settings.preset)?.seconds ?? null;
}

const nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

/** 0 -> "0 sn", 1.3 -> "1,3 sn", 750 -> "12 dk 30 sn", 3600 -> "1 sa". */
export function formatDelay(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${nf1.format(seconds)} sn`;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} sa`);
  if (m) parts.push(`${m} dk`);
  if (r) parts.push(`${r} sn`);
  return parts.join(' ');
}

/** Countdown clock for remaining milliseconds: "0:12", "12:30", "1:02:05". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "08:45:34" local clock time; "—" for invalid. */
export function clock(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function parseTime(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}
