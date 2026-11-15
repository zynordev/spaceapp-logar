import { segmentRaw, pathFrom } from './chartUtils';
import { AttBadge, QualityBadge } from './Badges';
import { attInfo, displayUnit } from './copy';
import { rulesForMetric, useSeries, worst } from './data';
import { fmtAuto, fmtClock, relTime } from './format';
import type { MeasurementPoint, MetricDef, RuleStatus } from './types';

export function Sparkline({ points }: { points: MeasurementPoint[] }) {
  const W = 120;
  const H = 34;
  const { segments } = segmentRaw(points.slice(-90));
  const all = segments.flat();
  if (!all.length) return <svg className="vt-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const t0 = all[0].t;
  const t1 = all[all.length - 1].t;
  let lo = Math.min(...all.map((x) => x.v));
  let hi = Math.max(...all.map((x) => x.v));
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const X = (t: number) => (t1 === t0 ? W / 2 : 2 + ((t - t0) / (t1 - t0)) * (W - 6));
  const Y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
  const last = all[all.length - 1];
  return (
    <svg className="vt-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {segments.map((seg, i) => (
        <path key={i} d={pathFrom(seg, (s) => X(s.t), (s) => Y(s.v))} vectorEffect="non-scaling-stroke" />
      ))}
      <circle cx={X(last.t)} cy={Y(last.v)} r={2.4} />
    </svg>
  );
}

function lastPoint(pts: MeasurementPoint[]): MeasurementPoint | null {
  for (let i = pts.length - 1; i >= 0; i--) if (Number.isFinite(pts[i].value)) return pts[i];
  return null;
}

export function MetricTile({
  def, rules, selected, onSelect, targetMissing,
}: {
  def: MetricDef;
  rules: RuleStatus[];
  selected: boolean;
  onSelect: () => void;
  targetMissing: boolean;
}) {
  const { data, error } = useSeries(targetMissing ? null : def, 120, 10000);
  const pts = data?.points ?? [];
  const last = lastPoint(pts);
  const top = worst(rulesForMetric(rules, def.metric));
  const unit = displayUnit(def.unit);
  const quality = top ? top.data_quality : last ? last.reported_quality : 'MISSING';
  const pending = !targetMissing && !data && !error;
  const att = top ? attInfo(top.health_attention) : null;
  const noRule = !top;
  const ariaLabel = `${def.label}: ${last ? `${fmtAuto(last.value)} ${unit}` : 'veri yok'}. ${
    att ? att.label : 'No rule'
  }. Switch the chart to this measurement.`;

  return (
    <button
      type="button"
      className={`vt-tile vt-tile-${att ? att.cls : 'none'}${selected ? ' is-selected' : ''}${!last ? ' is-empty' : ''}`}
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onSelect}
    >
      <span className="vt-tile-head">
        <span className="vt-tile-label">{def.label}</span>
        {att ? <AttBadge att={top!.health_attention} size="sm" /> : (
          <span className="vt-badge vt-badge-sm vt-att-none" title="No active rule for this measurement">
            <span className="vt-bi" aria-hidden="true">–</span>{def.metric === 'HRV_RMSSD' ? 'Data only' : 'No rule'}
          </span>
        )}
      </span>
      {pending ? (
        <span className="vt-tile-skel" aria-hidden="true"><span className="vt-skel" style={{ height: 26, width: '55%' }} /><span className="vt-skel" style={{ height: 30, width: '100%' }} /></span>
      ) : (
        <>
          <span className="vt-tile-value">
            {last ? fmtAuto(last.value) : '—'}
            {last && <small>{unit}</small>}
          </span>
          {last ? <Sparkline points={pts} /> : <span className="vt-tile-nodata">{targetMissing ? 'No target selected' : 'No data'}</span>}
        </>
      )}
      <span className="vt-tile-foot">
        <span className="vt-tile-time">{last ? `${fmtClock(last.observed_at)} · ${relTime(last.observed_at)}` : ' '}</span>
        {!pending && (quality !== 'VALID' || !last) && <QualityBadge q={last ? quality : 'MISSING'} prefix="" />}
        {noRule && def.metric === 'HRV_RMSSD' && <span className="vt-sr">No rule or threshold for HRV.</span>}
      </span>
    </button>
  );
}
