import { useMemo, useState } from 'react';
import { qs, usePolling } from '../../lib/api';
import { LEVEL_COMPARISONS, cmpSymbol, displayUnit } from './copy';
import { rulesForMetric, targetFor, useSelection, useSeries, worst } from './data';
import { fmtAuto, isNum, toMs } from './format';
import { Skeleton } from './Badges';
import { type ChartMarker, type ChartThreshold, TimeChart } from './TimeChart';
import type { AlertRead, MeasurementTrend, MetricDef, RuleStatus } from './types';
import { Icon } from '../../ui';

type Range = 'raw' | '7d' | '30d';
const RANGES: { key: Range; label: string }[] = [
  { key: 'raw', label: 'Recent readings' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function Legend({ trend, threshold, markers, suspect, fault }: { trend: boolean; threshold: boolean; markers: boolean; suspect: boolean; fault: boolean }) {
  return (
    <ul className="vt-legend" aria-label="Chart legend">
      <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" className="vt-lg-line" /></svg>{trend ? 'Average' : 'Reading'}</li>
      {trend && <li><svg width="22" height="10" aria-hidden="true"><rect width="22" height="10" className="vt-lg-band" /></svg>Lowest–highest</li>}
      {!trend && suspect && <li><svg width="22" height="10" aria-hidden="true"><rect x="7" y="1" width="7" height="7" transform="rotate(45 10.5 4.5)" className="vt-lg-suspect" /></svg>Suspect data</li>}
      {!trend && fault && <li><span aria-hidden="true" className="vt-lg-fault"><Icon name="x" size={14} /></span>Sensor fault</li>}
      <li><svg width="22" height="10" aria-hidden="true"><rect width="22" height="10" className="vt-lg-gap" /></svg>Data gap</li>
      {threshold && <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" className="vt-lg-thr" /></svg>Rule threshold</li>}
      {markers && <li><span aria-hidden="true" className="vt-lg-open"><Icon name="alert" size={14} /></span>Alarm opened <span aria-hidden="true" className="vt-lg-res"><Icon name="check" size={14} /></span>closed</li>}
    </ul>
  );
}

export function ChartSection({
  def, rules, alerts, selectedRuleId,
}: {
  def: MetricDef;
  rules: RuleStatus[];
  alerts: AlertRead[];
  selectedRuleId: string | null;
}) {
  const [range, setRange] = useState<Range>('raw');
  const { missionId, crewId, environmentTargetId } = useSelection();
  const unit = displayUnit(def.unit);

  const raw = useSeries(def, 500, 5000);

  const target = targetFor(def, crewId, environmentTargetId);
  const trendPath = useMemo(() => {
    if (range === 'raw' || !missionId || !target) return null;
    const bucket = range === '7d' ? 'hour' : 'day';
    const span = range === '7d' ? 7 * DAY : 30 * DAY;
    const step = range === '7d' ? HOUR : DAY;
    const since = new Date(Math.floor((Date.now() - span) / step) * step).toISOString();
    return `/v1/measurements/trend${qs({ mission_id: missionId, target_id: target, metric: def.metric, bucket, since })}`;
  }, [range, missionId, target, def.metric]);
  const trend = usePolling<MeasurementTrend>(trendPath, 30000);

  const metricRules = rulesForMetric(rules, def.metric).filter((r) => r.metric === def.metric);
  const rule = metricRules.find((r) => r.rule_id === selectedRuleId) ?? worst(metricRules);
  const threshold: ChartThreshold | null =
    rule && isNum(rule.threshold) && LEVEL_COMPARISONS.has(rule.comparison) && rule.unit === def.unit
      ? { value: rule.threshold, comparison: rule.comparison }
      : null;

  const ruleIds = new Set(metricRules.map((r) => r.rule_id));
  const markers: ChartMarker[] = [];
  for (const a of alerts) {
    if (!ruleIds.has(a.rule_id)) continue;
    const o = toMs(a.opened_at);
    const r = toMs(a.resolved_at);
    if (o != null) markers.push({ t: o, kind: 'open', label: 'Alarm opened' });
    if (r != null) markers.push({ t: r, kind: 'res', label: 'Alarm closed' });
  }

  const trendUnavailable = range !== 'raw' && trend.error != null && !trend.data;
  const useTrend = range !== 'raw' && trend.data != null;
  const points = raw.data?.points ?? [];
  const hasSuspect = points.some((p) => p.reported_quality === 'SUSPECT');
  const hasFault = points.some((p) => p.reported_quality === 'FAULT' || p.reported_quality === 'MISSING');

  let body;
  if (useTrend) {
    body = (
      <TimeChart
        key={`${def.metric}-${range}`}
        mode="trend"
        label={def.label}
        unit={unit}
        buckets={trend.data!.buckets}
        bucketMs={range === '7d' ? HOUR : DAY}
        threshold={threshold}
        markers={markers}
      />
    );
  } else if (range !== 'raw' && !trendUnavailable) {
    body = <div className="vt-chart-skel"><Skeleton lines={1} height={240} /></div>;
  } else if (raw.data) {
    body = (
      <TimeChart key={`${def.metric}-raw`} mode="raw" label={def.label} unit={unit} points={points} threshold={threshold} markers={markers} />
    );
  } else if (raw.error) {
    body = <p className="vt-empty">Readings could not be loaded. The chart will refresh when the connection returns.</p>;
  } else {
    body = <div className="vt-chart-skel"><Skeleton lines={1} height={240} /></div>;
  }

  return (
    <section className="vt-card vt-chart-card" aria-labelledby="vt-chart-title">
      <header className="vt-chart-head">
        <div>
          <h3 id="vt-chart-title" className="vt-h3">{def.label} <span className="vt-muted">({unit})</span></h3>
          <p className="vt-muted vt-small">
            {threshold && rule
              ? `Threshold: ${rule.title} · ${cmpSymbol(threshold.comparison)} ${fmtAuto(threshold.value)} ${unit}`
              : def.metric === 'HRV_RMSSD'
                ? 'Data only — this measurement has no rule or threshold.'
                : rule
                  ? `${rule.title}: the threshold cannot be drawn on this axis (${cmpSymbol(rule.comparison)} ${fmtAuto(rule.threshold)} ${displayUnit(rule.unit)}).`
                  : 'No active rule for this measurement — “no rule” does not mean normal.'}
          </p>
        </div>
        <div className="vt-seg" role="radiogroup" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={range === r.key}
              className={range === r.key ? 'is-on' : ''}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>
      {trendUnavailable && (
        <p className="vt-note" role="status">
          <span aria-hidden="true"><Icon name="info" size={14} /></span>
          {trend.error?.notFound
            ? 'The long-term trend service is not on this server yet; showing recent readings.'
            : 'The long-term trend cannot be loaded right now; showing recent readings.'}
        </p>
      )}
      {useTrend && trend.data!.buckets.every((b) => !b.count) && (
        <p className="vt-note" role="status"><span aria-hidden="true"><Icon name="question" size={14} /></span>No readings to summarise in this range.</p>
      )}
      <Legend trend={useTrend} threshold={!!threshold} markers={markers.length > 0} suspect={hasSuspect} fault={hasFault} />
      {body}
      <p className="vt-muted vt-small vt-chart-hint">
        {useTrend
          ? `${range === '7d' ? 'Hourly' : 'Daily'} summary: line shows the average, band shows the lowest–highest value.`
          : `Last ${points.length} readings. Hover, tap, or focus and use the arrow keys.`}
      </p>
    </section>
  );
}
