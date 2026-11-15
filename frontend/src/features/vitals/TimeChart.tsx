// Hand-built SVG time-series chart: raw line with gaps, quality markers,
// threshold line, alert markers, crosshair tooltip (pointer, touch, keyboard),
// or — in trend mode — mean line with a min–max band. No chart library.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import { ACTIVITY, QUALITY, cmpSymbol } from './copy';
import {
  type BucketItem, type RawItem, nearestIndex, niceTicks, pathFrom, segmentBuckets, segmentRaw, timeTicks,
} from './chartUtils';
import { fmtAuto, fmtClock, fmtDateTime, fmtDay } from './format';
import type { MeasurementPoint, TrendBucket } from './types';
import { Icon } from '../../ui';

export interface ChartMarker {
  t: number;
  kind: 'open' | 'res';
  label: string;
}

export interface ChartThreshold {
  value: number;
  comparison: string;
}

type Props = {
  label: string;
  unit: string;
  threshold: ChartThreshold | null;
  markers: ChartMarker[];
} & (
  | { mode: 'raw'; points: MeasurementPoint[] }
  | { mode: 'trend'; buckets: TrendBucket[]; bucketMs: number }
);

type Item = (RawItem & { kind: 'raw' }) | (BucketItem & { kind: 'bucket' });

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.floor(el.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = Math.floor(entries[0].contentRect.width);
      setW((prev) => (Math.abs(prev - cw) >= 2 ? cw : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function TimeChart(props: Props) {
  const { label, unit, threshold, markers } = props;
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const liveId = useId();
  const W = Math.max(240, width || 600);
  const H = W < 520 ? 230 : 300;
  const m = { l: 50, r: 14, t: 30, b: 30 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  const model = useMemo(() => {
    if (props.mode === 'raw') {
      const seg = segmentRaw(props.points);
      return { ...seg, items: seg.segments.flat().map((s) => ({ ...s, kind: 'raw' as const })) as Item[] };
    }
    const seg = segmentBuckets(props.buckets, props.bucketMs);
    return { ...seg, items: seg.segments.flat().map((s) => ({ ...s, kind: 'bucket' as const })) as Item[] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, props.mode === 'raw' ? props.points : props.buckets]);

  const { items, segments, gaps, faults } = model;

  // Keep the crosshair index valid across data refreshes.
  useEffect(() => {
    setHover((h) => (h == null ? h : Math.min(h, items.length - 1)));
  }, [items.length]);

  if (!items.length) {
    return (
      <div ref={boxRef} className="vt-chart-box"><div className="vt-chart-empty" role="note">
        <span aria-hidden="true" className="vt-empty-icon"><Icon name="question" size={22} /></span>
        <p>There is no valid data to plot in this range. Missing data does not mean “normal”.</p>
        {faults.length > 0 && <p className="vt-muted">{faults.length} readings are marked as sensor faults.</p>}
      </div></div>
    );
  }

  let t0 = items[0].kind === 'bucket' ? (items[0] as BucketItem).start : items[0].t;
  const lastItem = items[items.length - 1];
  let t1 = lastItem.kind === 'bucket' ? (lastItem as BucketItem).end : lastItem.t;
  for (const f of faults) { t0 = Math.min(t0, f); t1 = Math.max(t1, f); }
  if (t1 - t0 < 1000) { t0 -= 60_000; t1 += 60_000; }

  let lo = Infinity;
  let hi = -Infinity;
  for (const it of items) {
    const a = it.kind === 'bucket' ? it.lo : it.v;
    const b = it.kind === 'bucket' ? it.hi : it.v;
    if (a < lo) lo = a;
    if (b > hi) hi = b;
  }
  if (threshold) { lo = Math.min(lo, threshold.value); hi = Math.max(hi, threshold.value); }
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;

  const X = (t: number) => m.l + ((t - t0) / (t1 - t0)) * iw;
  const Y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * ih;

  const yt = niceTicks(lo, hi, H < 260 ? 4 : 5);
  const dec = Math.max(0, -Math.floor(Math.log10(yt.step)));
  const xt = timeTicks(t0, t1, Math.max(2, Math.floor(iw / 110)));
  const longSpan = t1 - t0 > 36 * 3600_000;
  const dayTicks = xt.step >= 24 * 3600_000;
  const xLabel = (t: number) => (dayTicks ? fmtDay(t) : longSpan ? `${fmtDay(t)} ${fmtClock(t)}` : fmtClock(t));

  const visibleMarkers = markers.filter((mk) => mk.t >= t0 && mk.t <= t1);
  const active = hover != null ? items[hover] : null;

  const pick = (clientX: number, target: Element) => {
    const r = target.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const t = t0 + ((px - m.l) / iw) * (t1 - t0);
    setHover(nearestIndex(items, t));
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.currentTarget);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = hover ?? items.length;
    const big = Math.max(1, Math.round(items.length / 10));
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = cur - 1;
    else if (e.key === 'ArrowRight') next = hover == null ? items.length - 1 : cur + 1;
    else if (e.key === 'PageUp') next = cur - big;
    else if (e.key === 'PageDown') next = cur + big;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Escape') { setHover(null); return; }
    if (next == null) return;
    e.preventDefault();
    setHover(Math.max(0, Math.min(items.length - 1, next)));
  };

  const lastV = lastItem.v;
  const summary = `${label} ${props.mode === 'trend' ? 'trend chart' : 'time chart'}. ${items.length} ${
    props.mode === 'trend' ? 'time buckets' : 'readings'
  }, ${fmtDateTime(t0)} – ${fmtDateTime(t1)}. Last value ${fmtAuto(lastV)} ${unit}.${
    threshold ? ` Threshold ${cmpSymbol(threshold.comparison)} ${fmtAuto(threshold.value)} ${unit}.` : ''
  }${gaps.length ? ` ${gaps.length} data gaps.` : ''} Use the arrow keys to move between points.`;

  const announce = active
    ? active.kind === 'bucket'
      ? `${fmtDateTime(active.start)}: average ${fmtAuto(active.v)} ${unit}, lowest ${fmtAuto(active.lo)}, highest ${fmtAuto(active.hi)}, ${active.count} readings.`
      : `${fmtDateTime(active.t, true)}: ${fmtAuto(active.v)} ${unit}, data ${QUALITY[active.quality]?.label ?? active.quality}.`
    : '';

  const ax = active ? X(active.t) : 0;
  const ay = active ? Y(active.v) : 0;
  const tipLeft = ax > W - 200 ? ax - 12 : ax + 12;
  const tipAlign = ax > W - 200 ? 'right' : 'left';

  return (
    <div ref={boxRef} className="vt-chart-box">
    <div
      className="vt-chart"
      tabIndex={0}
      role="group"
      aria-roledescription="chart"
      aria-label={summary}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="vt-chart-svg"
        aria-hidden="true"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }}
      >
        <defs>
          <pattern id={`${liveId}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="vt-hatch" />
          </pattern>
        </defs>

        {yt.ticks.map((v) => (
          <g key={`y${v}`}>
            <line className="vt-grid" x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} />
            <text className="vt-axis" x={m.l - 8} y={Y(v) + 4} textAnchor="end">
              {v.toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec })}
            </text>
          </g>
        ))}
        {xt.ticks.map((t) => (
          <g key={`x${t}`}>
            <line className="vt-grid vt-grid-x" x1={X(t)} x2={X(t)} y1={m.t} y2={H - m.b} />
            <text className="vt-axis" x={X(t)} y={H - m.b + 18} textAnchor="middle">{xLabel(t)}</text>
          </g>
        ))}
        <line className="vt-axis-line" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />

        {gaps.map(([a, b]) => (
          <g key={`g${a}`}>
            <rect className="vt-gap" x={X(a)} y={m.t} width={Math.max(1, X(b) - X(a))} height={ih} fill={`url(#${liveId}-hatch)`} />
            {X(b) - X(a) > 74 && (
              <text className="vt-gap-text" x={(X(a) + X(b)) / 2} y={m.t + 14} textAnchor="middle">Data gap</text>
            )}
          </g>
        ))}

        {props.mode === 'trend' && segments.map((seg, i) => {
          const bs = seg as BucketItem[];
          if (bs.length === 1) {
            const b = bs[0];
            return <rect key={`band${i}`} className="vt-band" x={X(b.t) - 4} width={8} y={Y(b.hi)} height={Math.max(1, Y(b.lo) - Y(b.hi))} rx={3} />;
          }
          const top = pathFrom(bs, (s) => X(s.t), (s) => Y(s.hi));
          const bottom = [...bs].reverse().map((s) => `L${X(s.t).toFixed(1)},${Y(s.lo).toFixed(1)}`).join('');
          return <path key={`band${i}`} className="vt-band" d={`${top}${bottom}Z`} />;
        })}

        {threshold && (
          <g>
            <line className="vt-thr" x1={m.l} x2={W - m.r} y1={Y(threshold.value)} y2={Y(threshold.value)} />
            <text className="vt-thr-text" x={W - m.r - 4} y={Y(threshold.value) - 6} textAnchor="end">
              Threshold {cmpSymbol(threshold.comparison)} {fmtAuto(threshold.value)} {unit}
            </text>
          </g>
        )}

        {segments.map((seg, i) =>
          seg.length === 1 ? (
            <circle key={`s${i}`} className="vt-dot" cx={X(seg[0].t)} cy={Y(seg[0].v)} r={3} />
          ) : (
            <path key={`s${i}`} className="vt-line" d={pathFrom(seg as { t: number; v: number }[], (s) => X(s.t), (s) => Y(s.v))} />
          ),
        )}

        {props.mode === 'raw' && (items as RawItem[]).filter((s) => s.quality === 'SUSPECT').map((s) => (
          <rect
            key={`q${s.t}`} className="vt-suspect"
            x={X(s.t) - 3.5} y={Y(s.v) - 3.5} width={7} height={7}
            transform={`rotate(45 ${X(s.t)} ${Y(s.v)})`}
          />
        ))}
        {faults.map((t) => (
          <path key={`f${t}`} className="vt-fault-x" d={`M${X(t) - 4} ${H - m.b - 12}l8 8m0 -8l-8 8`} />
        ))}

        {visibleMarkers.map((mk, i) => {
          const x = X(mk.t);
          const right = x > W - 120;
          return (
            <g key={`m${i}`} className={mk.kind === 'open' ? 'vt-mk-open' : 'vt-mk-res'}>
              <line x1={x} x2={x} y1={m.t - 8} y2={H - m.b} />
              <text x={x + (right ? -4 : 4)} y={m.t - 12} textAnchor={right ? 'end' : 'start'}>
                {mk.label}
              </text>
            </g>
          );
        })}

        {active && (
          <g className="vt-cross">
            <line x1={ax} x2={ax} y1={m.t} y2={H - m.b} />
            {active.kind === 'bucket' && (
              <line className="vt-cross-range" x1={ax} x2={ax} y1={Y(active.hi)} y2={Y(active.lo)} />
            )}
            <circle cx={ax} cy={ay} r={5} />
          </g>
        )}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" />
      </svg>

      {active && (
        <div
          className="vt-tip"
          style={{ left: tipLeft, top: Math.max(6, Math.min(ay - 28, H - 110)), transform: tipAlign === 'right' ? 'translateX(-100%)' : undefined }}
        >
          {active.kind === 'bucket' ? (
            <>
              <div className="vt-tip-time">{fmtDateTime(active.start)} – {fmtClock(active.end)}</div>
              <div className="vt-tip-val">{fmtAuto(active.v)} <small>{unit} avg.</small></div>
              <div className="vt-tip-sub">lowest {fmtAuto(active.lo)} · highest {fmtAuto(active.hi)}</div>
              <div className="vt-tip-sub">{active.count} readings</div>
            </>
          ) : (
            <>
              <div className="vt-tip-time">{fmtDateTime(active.t, true)}</div>
              <div className="vt-tip-val">{fmtAuto(active.v)} <small>{unit}</small></div>
              <div className="vt-tip-sub">
                <Icon name={QUALITY[active.quality]?.icon ?? 'question'} size={12} /> Data: {QUALITY[active.quality]?.label ?? active.quality}
              </div>
              {active.activity && <div className="vt-tip-sub">Activity: {ACTIVITY[active.activity] ?? active.activity}</div>}
            </>
          )}
        </div>
      )}
      <div id={liveId} className="vt-sr" aria-live="polite">{announce}</div>
    </div>
    </div>
  );
}
