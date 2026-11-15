import { useEffect } from 'react';
import { useApp } from '../../lib/store';
import { AttBadge, Skeleton } from './Badges';
import { ChartSection } from './ChartSection';
import { attInfo } from './copy';
import { targetFor, useAlerts, useCrewStatus, useMetrics, useSelection, useVitalsUi, worst } from './data';
import { fmtClock, relTime } from './format';
import { MetricTile } from './MetricTiles';
import { RuleList } from './RuleList';

export function Freshness({ at, error }: { at: string | null | undefined; error: boolean }) {
  const offline = useApp((s) => s.offline);
  if (!at) return null;
  const stale = offline || error;
  return (
    <span className={`vt-fresh${stale ? ' is-stale' : ''}`} role="status">
      <span aria-hidden="true">{stale ? '⚠' : '●'}</span>
      {stale ? `Son bilinen veri · ${fmtClock(at)} (${relTime(at)})` : `Güncel · ${fmtClock(at)}`}
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
      <section className="vt-panel" aria-label="Ölçümler ve kurallar">
        <h2 className="vt-h2">Ölçümler ve kurallar</h2>
        <div className="vt-empty-state">
          <span aria-hidden="true" className="vt-empty-icon">◎</span>
          <p>Ölçümleri görmek için bir görev ve ekip üyesi seçin.</p>
        </div>
      </section>
    );
  }

  const def = metrics.find((m) => m.metric === selectedMetric) ?? null;
  const groups = [
    { key: 'vital', title: 'Vital', list: metrics.filter((m) => m.category !== 'environment') },
    { key: 'environment', title: 'Çevre', list: metrics.filter((m) => m.category === 'environment') },
  ];
  const overall = status.data?.overall_attention;

  return (
    <section className="vt-panel" aria-label="Ölçümler ve kurallar">
      <header className="vt-panel-head">
        <div>
          <h2 className="vt-h2">Ölçümler ve kurallar</h2>
          <p className="vt-muted vt-small">Açıklanabilir kurallar: her seviye için gözlenen değer, eşik ve “neden”.</p>
        </div>
        <div className="vt-head-right">
          {overall && (
            <span className="vt-overall" title={attInfo(overall).desc}>
              <span className="vt-muted vt-small">Genel durum</span>
              <AttBadge att={overall} size="lg" />
            </span>
          )}
          <Freshness at={status.data?.generated_at} error={!!status.error} />
        </div>
      </header>

      {status.error && !status.data && (
        <p className="vt-note vt-note-warn" role="alert">
          <span aria-hidden="true">⚠</span>
          {status.error.network ? 'Sunucuya ulaşılamıyor; bağlantı gelince veriler yüklenecek.' : `Durum alınamadı (${status.error.message}).`}
        </p>
      )}

      {groups.map((g) => g.list.length > 0 && (
        <div key={g.key} className="vt-tile-group">
          <h3 className="vt-h3">{g.title}</h3>
          <div className="vt-tiles">
            {g.list.map((m) => (
              <MetricTile
                key={m.metric}
                def={m}
                rules={rules}
                selected={selectedMetric === m.metric}
                onSelect={() => select(m.metric)}
                targetMissing={!targetFor(m, crewId, environmentTargetId)}
              />
            ))}
          </div>
        </div>
      ))}

      {def && <ChartSection def={def} rules={rules} alerts={alerts.data ?? []} selectedRuleId={ruleId} />}

      <div className="vt-card">
        <h3 className="vt-h3 vt-card-title">Kurallar</h3>
        {!status.data ? (
          status.error ? <p className="vt-muted">Kurallar şu an alınamadı.</p> : <Skeleton lines={4} height={44} />
        ) : rules.length === 0 ? (
          <div className="vt-empty-state vt-empty-small">
            <span aria-hidden="true" className="vt-empty-icon">∅</span>
            <p>Bu görev için henüz değerlendirilmiş kural yok. Veri yoksa durum “bilinmiyor”dur, “normal” değil.</p>
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
            <summary>Sınırlamalar</summary>
            <ul>{status.data.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </details>
        )}
      </div>
    </section>
  );
}
