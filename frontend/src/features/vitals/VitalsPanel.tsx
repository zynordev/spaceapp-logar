import { useEffect } from 'react';
import { useApp } from '../../lib/store';
import { Skeleton } from './Badges';
import { ChartSection } from './ChartSection';
import { targetFor, useAlerts, useCrewStatus, useMetrics, useSelection, useVitalsUi, worst } from './data';
import { fmtClock, relTime } from './format';
import { RuleList } from './RuleList';
import { Icon } from '../../ui';

export function Freshness({ at, error }: { at: string | null | undefined; error: boolean }) {
  const offline = useApp((s) => s.offline);
  if (!at) return null;
  const stale = offline || error;
  return (
    <span className={`vt-fresh${stale ? ' is-stale' : ''}`} role="status">
      <Icon name={stale ? 'warning' : 'dot'} size={12} />
      {stale ? `Last known data · ${fmtClock(at)} (${relTime(at)})` : `Current · ${fmtClock(at)}`}
    </span>
  );
}

export function VitalsPanel() {
  const { missionId, crewId, environmentTargetId } = useSelection();
  const status = useCrewStatus();
  const alerts = useAlerts();
  const metrics = useMetrics();
  const { metric: selectedMetric, ruleId, select } = useVitalsUi();
  const rules = status.data?.rules ?? [];

  // First selection: metric of the highest-attention rule, else the first metric.
  useEffect(() => {
    if (selectedMetric && metrics.some((m) => m.metric === selectedMetric)) return;
    if (!status.data && missionId) return;
    const chartable = rules.filter((r) => metrics.some((m) => m.metric === r.metric));
    const w = worst(chartable);
    select(w?.metric ?? metrics[0]?.metric ?? null);
  }, [selectedMetric, metrics, rules, status.data, missionId, select]);

  if (!missionId || !crewId) {
    return (
      <section className="vt-panel" aria-label="Measurements and rules">
        <h2 className="vt-h2">Measurements and rules</h2>
        <div className="vt-empty-state">
          <span aria-hidden="true" className="vt-empty-icon"><Icon name="info" size={22} /></span>
          <p>Select a mission and a crew member to see measurements.</p>
        </div>
      </section>
    );
  }

  const def = metrics.find((m) => m.metric === selectedMetric) ?? null;
  const groups = [
    { key: 'vital', title: 'Vital', list: metrics.filter((m) => m.category !== 'environment') },
    { key: 'environment', title: 'Environment', list: metrics.filter((m) => m.category === 'environment') },
  ];

  return (
    <section className="vt-panel" aria-label="Measurements and rules">
      <header className="vt-panel-head">
        <div>
          <h2 className="vt-h2">Measurements and rules</h2>
          <p className="vt-muted vt-small">Explainable rules: for each level, the observed value, the threshold and the “reasons”.</p>
        </div>
        <div className="vt-head-right">
          <Freshness at={status.data?.generated_at} error={!!status.error} />
        </div>
      </header>

      {status.error && !status.data && (
        <p className="vt-note vt-note-warn" role="alert">
          <span aria-hidden="true"><Icon name="warning" size={14} /></span>
          {status.error.network ? 'Cannot reach the server; data will load when the connection returns.' : `Status could not be loaded (${status.error.message}).`}
        </p>
      )}

      <div className="vt-picker">
        <label htmlFor="vt-metric-pick" className="vt-picker__label">Measurement on chart</label>
        <select
          id="vt-metric-pick"
          className="vt-picker__select"
          value={selectedMetric ?? ''}
          onChange={(e) => select(e.target.value || null)}
        >
          {groups.map((g) => g.list.length > 0 && (
            <optgroup key={g.key} label={g.title}>
              {g.list.map((m) => (
                <option key={m.metric} value={m.metric} disabled={!targetFor(m, crewId, environmentTargetId)}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {def && <ChartSection def={def} rules={rules} alerts={alerts.data ?? []} selectedRuleId={ruleId} />}

      <div className="vt-card">
        <h3 className="vt-h3 vt-card-title">Rules</h3>
        {!status.data ? (
          status.error ? <p className="vt-muted">Rules could not be loaded right now.</p> : <Skeleton lines={4} height={44} />
        ) : rules.length === 0 ? (
          <div className="vt-empty-state vt-empty-small">
            <span aria-hidden="true" className="vt-empty-icon"><Icon name="question" size={22} /></span>
            <p>No rules have been evaluated for this mission yet. Without data the status is “unknown”, not “normal”.</p>
          </div>
        ) : (
          <RuleList
            rules={rules}
            envTargetId={environmentTargetId}
            metrics={metrics}
            selectedRuleId={ruleId}
            selectedMetric={selectedMetric}
            onSelect={(m, r) => select(m, r)}
          />
        )}
        {status.data && status.data.limitations.length > 0 && (
          <details className="vt-limits">
            <summary>Limitations</summary>
            <ul>{status.data.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </details>
        )}
      </div>
    </section>
  );
}
