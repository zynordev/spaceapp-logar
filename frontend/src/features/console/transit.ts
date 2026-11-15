// Display-only light-delay simulation. The API answers instantly; this file
// decides when an item "would" reach the other side:
//   departure = the moment this console first saw the item (packet items:
//               their own timestamp, but never before the console started
//               watching the mission),
//   arrival   = departure + delay / compression.
// An item whose own timestamp is already older than the (real, uncompressed)
// one-way delay when the console first sees it has, physically, already
// arrived: it is shown as "konsol açılmadan önce ulaştı" instead of being
// held back again. "Yeniden oynat" replays every known item from now.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Seen {
  /** Client clock (ms) when this console first saw the item. */
  firstSeen: number;
  /** The item's own server timestamp (ms), null for console-made items. */
  eventAt: number | null;
  /** Replayed: ignore the "already arrived" shortcut. */
  replayed: boolean;
}

export type Phase = 'transit' | 'arrived' | 'before';

export interface Transit {
  phase: Phase;
  departAt: number;
  arriveAt: number;
  /** 0..1 along the link. */
  progress: number;
  remainingMs: number;
}

export interface SeenEntry {
  key: string;
  eventAt: number | null;
  /** Override the first-seen moment (clamped to [scope start, now]). */
  seenAt?: number;
}

export interface Tracker {
  get: (key: string) => Seen | undefined;
  register: (entries: SeenEntry[]) => void;
  replay: () => void;
  /** Client clock when this console started watching the current mission. */
  scopeStart: number;
  /** Incremented on every change (dependency for memoised views). */
  version: number;
}

/** First-seen registry, cleared when `scope` (mission) changes. */
export function useTracker(scope: string | null): Tracker {
  const map = useRef(new Map<string, Seen>());
  const [version, setVersion] = useState(0);
  const lastScope = useRef(scope);
  const scopeStart = useRef(Date.now());

  if (lastScope.current !== scope) {
    lastScope.current = scope;
    map.current = new Map();
    scopeStart.current = Date.now();
  }

  const register = useCallback((entries: SeenEntry[]) => {
    const now = Date.now();
    let added = false;
    for (const e of entries) {
      if (!map.current.has(e.key)) {
        const firstSeen = e.seenAt === undefined ? now : Math.min(now, Math.max(scopeStart.current, e.seenAt));
        map.current.set(e.key, { firstSeen, eventAt: e.eventAt, replayed: false });
        added = true;
      }
    }
    if (added) setVersion((v) => v + 1);
  }, []);

  const replay = useCallback(() => {
    const now = Date.now();
    for (const seen of map.current.values()) {
      seen.firstSeen = now;
      seen.replayed = true;
    }
    setVersion((v) => v + 1);
  }, []);

  const get = useCallback((key: string) => map.current.get(key), []);
  return { get, register, replay, scopeStart: scopeStart.current, version };
}

/**
 * Where an item is on the link right now.
 * @param delaySeconds real one-way delay; @param compression display speed-up.
 */
export function transitOf(seen: Seen | undefined, now: number, delaySeconds: number, compression: number): Transit {
  const physMs = Math.max(0, delaySeconds) * 1000;
  const shownMs = physMs / Math.max(1, compression);
  const departAt = seen?.firstSeen ?? now;
  if (seen && !seen.replayed && physMs > 0 && seen.eventAt !== null && seen.firstSeen - seen.eventAt >= physMs) {
    return { phase: 'before', departAt: seen.eventAt, arriveAt: seen.eventAt + physMs, progress: 1, remainingMs: 0 };
  }
  const arriveAt = departAt + shownMs;
  if (shownMs <= 0 || now >= arriveAt) {
    return { phase: 'arrived', departAt, arriveAt, progress: 1, remainingMs: 0 };
  }
  const progress = Math.min(1, Math.max(0, (now - departAt) / shownMs));
  return { phase: 'transit', departAt, arriveAt, progress, remainingMs: arriveAt - now };
}

export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Client clock that re-renders every `intervalMs`. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
