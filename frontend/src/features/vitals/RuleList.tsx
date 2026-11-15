import { useId, useState } from 'react';
import { AttBadge, QualityBadge, ThresholdSource } from './Badges';
import { BASELINE, GENERIC_NEXT, METRIC_INFO, TIME_SCALE, attInfo, cmpSymbol, displayUnit } from './copy';
import { rank, useSeries } from './data';
import { fmtAuto, fmtDateTime, fmtNum, isNum, relTime, safeUrl, toMs } from './format';
import type { MetricDef, RuleStatus } from './types';
import { Icon } from '../../ui';

function valueLine(r: RuleStatus): string {
  const unit = displayUnit(r.unit);
  const obs = isNum(r.observed_value) ? `${fmtAuto(r.observed_value)} ${unit}` : '—';
  const thr = isNum(r.threshold) ? `${cmpSymbol(r.comparison)} ${fmtAuto(r.threshold)} ${unit}` : '—';
  return `${obs} · threshold ${thr}`;
}

/** Counts the raw measurements inside the rule's evaluation window. */
function EvidenceCounts({ rule, def }: { rule: RuleStatus; def: MetricDef }) {
  const { data, error } = useSeries(def, 500, 15000);
  if (!data) return <span className="vt-muted">{error ? 'Readings could not be loaded' : 'Calculating…'}</span>;
  const end = toMs(rule.evaluated_at);
  if (end == null) return <span>—</span>;
  const start = end - rule.window_minutes * 60_000;
  let valid = 0;
  let suspect = 0;
  let fault = 0;
  for (const p of data.points) {
    const t = toMs(p.observed_at);
    if (t == null || t <= start || t > end) continue;
    if (p.reported_quality === 'VALID') valid++;
    else if (p.reported_quality === 'SUSPECT') suspect++;
    else fault++;
  }
  const total = valid + suspect + fault;
  if (!total) return <span>No readings in the window (within the last 500 readings)</span>;
  return (
    <span className="vt-evidence">
      <span><b>{total}</b> readings</span>
      <span className="vt-ev vt-ev-valid"><span aria-hidden="true"><Icon name="check" size={14} /></span> {valid} valid</span>
      {suspect > 0 && <span className="vt-ev vt-ev-suspect"><span aria-hidden="true"><Icon name="warning" size={14} /></span> {suspect} suspect</span>}
      {fault > 0 && <span className="vt-ev vt-ev-fault"><span aria-hidden="true"><Icon name="x" size={14} /></span> {fault} fault</span>}
    </span>
  );
}

function WhyPanel({ rule, def, metricLabel }: { rule: RuleStatus; def: MetricDef | null; metricLabel: (m: string) => string }) {
  const src = safeUrl(rule.source_uri);
  const info = METRIC_INFO[rule.metric];
  const bl = rule.baseline;
  const blInfo = bl ? BASELINE[bl.classification] : null;
  const unit = displayUnit(rule.unit);
  return (
    <div className="vt-why">
      {rule.data_quality !== 'VALID' && (
        <p className="vt-callout vt-callout-quality">
          <span aria-hidden="true"><Icon name="question" size={14} /></span>
          There is a data quality problem: this means the health assessment is not reliable. Bad data does not mean “normal”.
        </p>
      )}
      {rule.validation_status.startsWith('DEMO') && (
        <p className="vt-callout vt-callout-demo">
          <span aria-hidden="true"><Icon name="flask" size={14} /></span>
          DEMO threshold — awaiting flight medicine expert validation.
        </p>
      )}
      <p className="vt-why-text">{rule.explanation || 'No explanation.'}</p>
      <dl className="vt-kv">
        <dt>Observed value</dt>
        <dd>{isNum(rule.observed_value) ? `${fmtAuto(rule.observed_value)} ${unit}` : '—'}</dd>
        <dt>Threshold</dt>
        <dd>{isNum(rule.threshold) ? `${cmpSymbol(rule.comparison)} ${fmtAuto(rule.threshold)} ${unit}` : '—'}</dd>
        <dt>Pencere</dt>
        <dd>{fmtNum(rule.window_minutes, 0)} dk · {TIME_SCALE[rule.time_scale] ?? rule.time_scale}</dd>
        <dt>Evidence</dt>
        <dd>{def ? <EvidenceCounts rule={rule} def={def} /> : <span className="vt-muted">This rule uses inputs other than numeric measurements</span>}</dd>
        <dt>Personal baseline</dt>
        <dd>
          {bl ? (
            <span className="vt-baseline">
              <span className={`vt-badge vt-badge-sm vt-bl-${blInfo?.cls ?? 'estimated'}`}>
                <span className="vt-bi" aria-hidden="true"><Icon name={bl.classification === 'ESTABLISHED' ? 'dot' : 'circle'} size={12} /></span>
                {blInfo?.label ?? bl.status_label}
              </span>
              <span>
                {isNum(bl.value) ? `${fmtAuto(bl.value)} ${unit}` : '—'} · {bl.sample_count ?? 0} samples
                {bl.profile_version ? ` · profil v${bl.profile_version}` : ''}
              </span>
              {blInfo && <span className="vt-muted vt-small">{blInfo.note}</span>}
            </span>
          ) : (
            <span className="vt-muted">This rule does not use a personal baseline</span>
          )}
        </dd>
        <dt>Assessment</dt>
        <dd>{fmtDateTime(rule.evaluated_at, true)} · {relTime(rule.evaluated_at)}</dd>
        <dt>Kaynak</dt>
        <dd>
          {src ? <a href={src} target="_blank" rel="noopener noreferrer">{rule.source || src}</a> : rule.source || '—'}
          {rule.evidence_level ? <span className="vt-muted"> · evidence class {rule.evidence_level}</span> : null}
        </dd>
        <dt>Rule</dt>
        <dd className="vt-mono">{rule.rule_id} v{rule.rule_version}</dd>
      </dl>
      {rule.related_metrics?.length > 0 && (
        <p className="vt-muted vt-small">Measurements assessed together: {rule.related_metrics.map(metricLabel).join(', ')}</p>
      )}
      {info && (
        <div className="vt-info">
          <h4>Why does this measurement matter?</h4>
          <p>{info.why}</p>
          <h4>Ne zaman dikkat?</h4>
          <p>{info.watch}{GENERIC_NEXT}</p>
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule, def, selected, onSelect, metricLabel,
}: {
  rule: RuleStatus;
  def: MetricDef | null;
  selected: boolean;
  onSelect: (() => void) | null;
  metricLabel: (m: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const att = attInfo(rule.health_attention);
  return (
    <li className={`vt-rule vt-rule-${att.cls}${selected ? ' is-selected' : ''}${open ? ' is-open' : ''}`}>
      <div className="vt-rule-main">
        <AttBadge att={rule.health_attention} />
        <div className="vt-rule-body">
          {onSelect ? (
            <button type="button" className="vt-rule-title vt-linklike" onClick={onSelect} aria-pressed={selected}
              title="Show on chart">
              {rule.title || rule.rule_id}
            </button>
          ) : (
            <span className="vt-rule-title">{rule.title || rule.rule_id}</span>
          )}
          <span className="vt-rule-value">{valueLine(rule)}</span>
        </div>
        <div className="vt-rule-badges">
          <QualityBadge q={rule.data_quality} />
          <ThresholdSource r={rule} />
        </div>
        <button
          type="button"
          className="vt-btn vt-btn-ghost vt-why-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          Why? <span aria-hidden="true" className="vt-chev"><Icon name="chevron-down" size={12} /></span>
        </button>
      </div>
      <div id={panelId} className="vt-collapse" data-open={open} hidden={!open}>
        {open && <WhyPanel rule={rule} def={def} metricLabel={metricLabel} />}
      </div>
    </li>
  );
}

export function RuleList({
  rules, envTargetId, metrics, selectedRuleId, selectedMetric, onSelect,
}: {
  rules: RuleStatus[];
  envTargetId: string | null;
  metrics: MetricDef[];
  selectedRuleId: string | null;
  selectedMetric: string | null;
  onSelect: (metric: string, ruleId: string) => void;
}) {
  const byMetric = new Map(metrics.map((m) => [m.metric, m]));
  const metricLabel = (m: string) => byMetric.get(m)?.label ?? m;
  const sorted = [...rules].sort((a, b) => rank(b) - rank(a) || a.title.localeCompare(b.title, 'en'));
  const groups = [
    { key: 'vital', title: 'Vital and subjective', list: sorted.filter((r) => r.target_id !== envTargetId) },
    { key: 'env', title: 'Environment', list: sorted.filter((r) => envTargetId != null && r.target_id === envTargetId) },
  ];
  return (
    <div className="vt-rule-groups">
      {groups.map((g) => (
        <section key={g.key} className="vt-rule-group" aria-label={`${g.title} rules`}>
          <h3 className="vt-h3">
            {g.title} <span className="vt-count">{g.list.length}</span>
          </h3>
          {g.list.length === 0 ? (
            <p className="vt-muted vt-small">No rules have been evaluated in this group yet.</p>
          ) : (
            <ul className="vt-rules">
              {g.list.map((r) => {
                const def = byMetric.get(r.metric) ?? null;
                return (
                  <RuleRow
                    key={r.rule_id}
                    rule={r}
                    def={def}
                    metricLabel={metricLabel}
                    selected={selectedRuleId === r.rule_id || (!selectedRuleId && selectedMetric === r.metric)}
                    onSelect={def ? () => onSelect(r.metric, r.rule_id) : null}
                  />
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
