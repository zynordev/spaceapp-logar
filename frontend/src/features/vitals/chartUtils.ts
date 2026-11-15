import { isNum, toMs } from './format';
import type { MeasurementPoint, TrendBucket } from './types';

export interface RawItem {
  t: number;
  v: number;
  quality: string;
  activity: string | null;
}

export interface BucketItem {
  t: number; // bucket midpoint
  start: number;
  end: number;
  v: number; // mean
  lo: number;
  hi: number;
  count: number;
}

export interface Segmented<T> {
  segments: T[][];
  gaps: [number, number][];
  /** Points that cannot be drawn on the value axis (sensor FAULT). */
  faults: number[];
}

const drawable = (q: string) => q !== 'MISSING' && q !== 'FAULT';

/**
 * Split raw points into drawable segments. The line breaks on FAULT/MISSING
 * points and on time gaps larger than 3× the median sampling interval, so
 * missing data is never bridged with a fake straight line.
 */
export function segmentRaw(points: MeasurementPoint[]): Segmented<RawItem> {
  const times: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = toMs(points[i - 1].observed_at);
    const b = toMs(points[i].observed_at);
    if (a != null && b != null && b > a) times.push(b - a);
  }
  times.sort((x, y) => x - y);
  const median = times.length ? times[Math.floor(times.length / 2)] : 60000;
  const maxGap = Math.max(median * 3, 1000);
  const segments: RawItem[][] = [];
  const gaps: [number, number][] = [];
  const faults: number[] = [];
  let cur: RawItem[] = [];
  let prev: RawItem | null = null;
  let broke = false;
  for (const p of points) {
    const t = toMs(p.observed_at);
    if (t == null) continue;
    if (!isNum(p.value) || !drawable(p.reported_quality)) {
      faults.push(t);
      broke = true;
      continue;
    }
    const item: RawItem = { t, v: p.value, quality: p.reported_quality, activity: p.activity_state };
    if (prev && (broke || t - prev.t > maxGap)) {
      if (cur.length) segments.push(cur);
      cur = [];
      gaps.push([prev.t, t]);
    }
    cur.push(item);
    prev = item;
    broke = false;
  }
  if (cur.length) segments.push(cur);
  return { segments, gaps, faults };
}

export function segmentBuckets(buckets: TrendBucket[], bucketMs: number): Segmented<BucketItem> {
  const items: BucketItem[] = [];
  for (const b of buckets) {
    const s = toMs(b.start);
    const e = toMs(b.end) ?? (s != null ? s + bucketMs : null);
    if (s == null || e == null || !b.count || !isNum(b.mean)) continue;
    items.push({
      t: (s + e) / 2, start: s, end: e, v: b.mean,
      lo: isNum(b.min) ? b.min : b.mean, hi: isNum(b.max) ? b.max : b.mean, count: b.count,
    });
  }
  items.sort((a, b) => a.t - b.t);
  const segments: BucketItem[][] = [];
  const gaps: [number, number][] = [];
  let cur: BucketItem[] = [];
  for (const it of items) {
    const prev = cur[cur.length - 1];
    if (prev && it.start - prev.end > bucketMs * 0.5) {
      segments.push(cur);
      gaps.push([prev.t, it.t]);
      cur = [];
    }
    cur.push(it);
  }
  if (cur.length) segments.push(cur);
  return { segments, gaps, faults: [] };
}

export function niceTicks(min: number, max: number, count = 5): { ticks: number[]; step: number } {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
  return { ticks, step };
}

const HOUR = 3600_000;
const TIME_STEPS = [
  60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR, 2 * 24 * HOUR, 7 * 24 * HOUR,
];

/** Time ticks aligned to round local clock values. */
export function timeTicks(t0: number, t1: number, maxTicks: number): { ticks: number[]; step: number } {
  const span = Math.max(1, t1 - t0);
  const step = TIME_STEPS.find((s) => span / s <= maxTicks) ?? TIME_STEPS[TIME_STEPS.length - 1];
  const offset = new Date(t0).getTimezoneOffset() * 60_000;
  const first = Math.ceil((t0 - offset) / step) * step + offset;
  const ticks: number[] = [];
  for (let t = first; t <= t1; t += step) ticks.push(t);
  return { ticks, step };
}

export function pathFrom<T>(items: T[], x: (i: T) => number, y: (i: T) => number): string {
  return items.map((s, i) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(s).toFixed(1)}`).join('');
}

export function nearestIndex<T extends { t: number }>(items: T[], t: number): number {
  let lo = 0;
  let hi = items.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(items[lo - 1].t - t) <= Math.abs(items[lo].t - t)) return lo - 1;
  return lo;
}
