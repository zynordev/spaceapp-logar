// Sweep-style ECG strip that replays a RECORDED excerpt (PhysioNet MIT-BIH
// NSR 16265, 30 s, 128 Hz). It is not a live sensor and derives nothing from
// the signal: no heart rate, no rhythm reading. See ./README.md.
import { useEffect, useRef, useState } from 'react';
import { Button, EmptyState, Icon, Skeleton, SourceBadge } from '../../ui';
import { ECG_ATTRIBUTION_URL, loadEcg, type EcgRecord } from './data';
import './ecg.css';

export const ECG_LABEL =
  'Recorded sample ECG — MIT-BIH NSR 16265 (PhysioNet) · not a live sensor · no rhythm interpretation';

export interface EcgStripProps {
  /** Height of the trace area in CSS px (default 160, compact 96). */
  height?: number;
  /** Tighter typography and padding for HUD cards. */
  compact?: boolean;
  className?: string;
}

/* Clinical paper ratio: 25 mm/s and 10 mm/mV. One nominal CSS millimetre is
 * 96/25.4 px; it is shrunk when the strip is too short to fit the excerpt's
 * amplitude range, so the time/voltage ratio of the grid is always kept. */
const NOMINAL_PX_PER_MM = 96 / 25.4;
const MM_PER_S = 25;
const MM_PER_MV = 10;
const MINOR_S = 0.2;
const MINOR_MV = 0.5;
const PAD_Y = 8;

type LoadState = { kind: 'loading' } | { kind: 'ready'; rec: EcgRecord } | { kind: 'error' };

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

interface Palette {
  bg: string;
  minor: string;
  major: string;
  trace: string;
  seam: string;
}

function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--bg-2', 'black'),
    minor: v('--hud-line', 'gray'),
    major: v('--hud-line-strong', 'gray'),
    trace: v('--data', 'orange'),
    seam: v('--text-faint', 'gray'),
  };
}

interface Geometry {
  w: number;
  h: number;
  pxPerS: number;
  pxPerMv: number;
  /** y (CSS px) of 0 mV */
  y0: number;
  /** Draw vertical minor (0.2 s) lines? False when they would be < 4 px apart. */
  minorTime: boolean;
}

function geometry(rec: EcgRecord, w: number, h: number, fitWidth: boolean): Geometry {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of rec.samples) {
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  const range = Math.max(hi - lo, 1);
  const pxPerMm = Math.min(NOMINAL_PX_PER_MM, (h - 2 * PAD_Y) / (range * MM_PER_MV));
  const pxPerMv = pxPerMm * MM_PER_MV;
  const duration = rec.samples.length / rec.fs;
  const pxPerS = fitWidth ? w / duration : pxPerMm * MM_PER_S;
  const y0 = (h - range * pxPerMv) / 2 + hi * pxPerMv;
  return { w, h, pxPerS, pxPerMv, y0, minorTime: pxPerS * MINOR_S >= 4 };
}

function drawGrid(ctx: CanvasRenderingContext2D, g: Geometry, p: Palette) {
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, g.w, g.h);
  ctx.lineWidth = 1;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  };
  // Time lines: minor every 0.2 s, major every 1 s.
  const stepS = g.minorTime ? MINOR_S : 1;
  const n = Math.ceil(g.w / (g.pxPerS * stepS));
  for (const major of [false, true]) {
    ctx.beginPath();
    ctx.strokeStyle = major ? p.major : p.minor;
    ctx.globalAlpha = major ? 0.55 : 0.5;
    for (let i = 0; i <= n; i++) {
      const isMajor = g.minorTime ? i % 5 === 0 : true;
      if (isMajor !== major) continue;
      const x = Math.round(i * stepS * g.pxPerS) + 0.5;
      line(x, 0, x, g.h);
    }
    // Voltage lines: minor every 0.5 mV, major every 1 mV (0 mV included).
    const step = MINOR_MV * g.pxPerMv;
    const kMin = Math.floor((g.y0 - g.h) / step);
    const kMax = Math.ceil(g.y0 / step);
    for (let k = kMin; k <= kMax; k++) {
      if ((k % 2 === 0) !== major) continue;
      const y = Math.round(g.y0 - k * step) + 0.5;
      if (y < 0 || y > g.h) continue;
      line(0, y, g.w, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function EcgStrip({ height, compact = false, className }: EcgStripProps) {
  const h = Math.max(48, Math.round(height ?? (compact ? 96 : 160)));
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [width, setWidth] = useState(0);
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reduced = usePrefersReducedMotion();
  const screenRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Playback clock (s of recording, unbounded; wrapped with modulo). */
  const clock = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    loadEcg().then(
      (rec) => alive && setState({ kind: 'ready', rec }),
      () => alive && setState({ kind: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.kind]);

  const rec = state.kind === 'ready' ? state.rec : null;
  const staticView = reduced;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = screenRef.current;
    if (!rec || !canvas || !host || width < 16) return;
    const ctx = setupCanvas(canvas, width, h);
    if (!ctx) return;
    const pal = readPalette(host);
    const g = geometry(rec, width, h, staticView);
    const N = rec.samples.length;
    const fs = rec.fs;
    const yOf = (mv: number) => g.y0 - mv * g.pxPerMv;

    // Cached grid bitmap at device resolution.
    const grid = document.createElement('canvas');
    const gctx = setupCanvas(grid, width, h);
    if (!gctx) return;
    drawGrid(gctx, g, pal);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (staticView) {
      ctx.drawImage(grid, 0, 0, width, h);
      ctx.beginPath();
      ctx.strokeStyle = pal.trace;
      ctx.lineWidth = 1.25;
      for (let i = 0; i < N; i++) {
        const x = (i / fs) * g.pxPerS;
        const y = yOf(rec.samples[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }

    const gap = Math.max(12, 0.15 * g.pxPerS);
    const visibleS = (width - gap) / g.pxPerS;
    if (clock.current === null) clock.current = visibleS; // start with a full screen
    const seams: number[] = [];

    const frame = (T: number) => {
      ctx.drawImage(grid, 0, 0, width, h);
      const xh = (T * g.pxPerS) % width;
      const kEnd = Math.floor(T * fs);
      const kStart = Math.max(0, Math.ceil((T - visibleS) * fs));
      seams.length = 0;
      ctx.beginPath();
      ctx.strokeStyle = pal.trace;
      ctx.lineWidth = 1.5;
      let prevX = -1;
      let lastY = 0;
      for (let k = kStart; k <= kEnd; k++) {
        let x = xh - (T - k / fs) * g.pxPerS;
        if (x < 0) x += width;
        const idx = k % N;
        const y = yOf(rec.samples[idx]);
        // Break the line where the sweep wraps and where the 30 s loop restarts.
        if (prevX < 0 || x < prevX || idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        if (idx === 0 && k > 0) seams.push(x);
        prevX = x;
        lastY = y;
      }
      ctx.stroke();
      // Loop restart marker: short dashed tick at the top edge (not data).
      if (seams.length) {
        ctx.save();
        ctx.strokeStyle = pal.seam;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        for (const x of seams) {
          ctx.moveTo(Math.round(x) + 0.5, 0);
          ctx.lineTo(Math.round(x) + 0.5, 14);
        }
        ctx.stroke();
        ctx.restore();
      }
      // Write head.
      if (prevX >= 0) {
        ctx.fillStyle = pal.trace;
        ctx.beginPath();
        ctx.arc(prevX, lastY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    frame(clock.current);
    if (paused) return;

    let raf = 0;
    let last: number | null = null;
    let onScreen = true;
    const tick = (now: number) => {
      if (last !== null) clock.current = (clock.current ?? 0) + Math.min(0.25, (now - last) / 1000);
      last = now;
      frame(clock.current ?? 0);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf || document.hidden || !onScreen) return;
      last = null;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    io.observe(host);
    start();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [rec, width, h, staticView, paused]);

  const duration = rec ? Math.round(rec.samples.length / rec.fs) : null;
  // Mirrors geometry(): in the static view 0.2 s lines are dropped when < 4 px apart.
  const staticMinor = rec ? (width / (rec.samples.length / rec.fs)) * MINOR_S >= 4 : true;
  const scaleText = staticView
    ? `Static view: ${duration ?? '—'} s recording at full width · grid ${staticMinor ? '0.2 s' : '1 s'} × 0.5 mV`
    : 'Real speed · small square 0.2 s × 0.5 mV (25 mm/s, 10 mm/mV ratio)';

  return (
    <figure className={['ecg-strip', compact && 'ecg-strip--compact', className].filter(Boolean).join(' ')}>
      <div className="ecg-strip__head">
        <span className="ecg-strip__tag">
          <Icon name="clock" size={compact ? 14 : 16} />
          <span>Recording · not live</span>
        </span>
        <SourceBadge
          kind="REAL"
          detail={compact ? null : 'PhysioNet'}
          size={compact ? 'xs' : 'sm'}
          title="Real recording: PhysioNet MIT-BIH NSR 16265 (ODC-By). Not a live sensor; the heart rate value does not come from this recording."
        />
        {rec && !staticView && (
          <Button
            variant="ghost"
            size="sm"
            icon={paused ? 'play' : 'stop'}
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
          >
            {paused ? 'Play' : 'Pause'}
          </Button>
        )}
      </div>

      {state.kind === 'loading' && (
        <div className="ecg-strip__screen" style={{ height: h }} aria-busy="true">
          <Skeleton height={h} />
        </div>
      )}

      {state.kind === 'error' && (
        <EmptyState
          compact
          icon="info"
          title="Recorded sample ECG could not be loaded"
          action={
            <Button size="sm" variant="secondary" icon="refresh" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </Button>
          }
        >
          The sample file (ecg/nsrdb-16265.json) was not found or could not be read. This system has no live ECG sensor, so
          no made-up curve is shown.
        </EmptyState>
      )}

      {rec && (
        <div className="ecg-strip__screen" ref={screenRef} style={{ height: h }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Recorded sample ECG curve: ${rec.database}, record ${rec.record}, ${rec.signal_name}, ${duration}-second excerpt${
              staticView ? '' : ', playing in a loop'
            }. Not live data; no rhythm interpretation.`}
          />
        </div>
      )}

      <figcaption className="ecg-strip__label">{ECG_LABEL}</figcaption>
      <p className="ecg-strip__meta">
        {rec && <span className="ecg-strip__scale">{scaleText}</span>}
        <a href={ECG_ATTRIBUTION_URL} target="_blank" rel="noopener">
          Source and licence (ODC-By 1.0)
        </a>
      </p>
    </figure>
  );
}
