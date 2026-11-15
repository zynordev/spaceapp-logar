// Mission screen side columns (left: vitals, right: status / cabin / alerts /
// clock). Plain panels with table rows: one line per measurement, nothing
// floats over the 3D body. Every number comes from the API; missing data is
// "—" with a reason, never a made-up value.
import { useEffect, useState, type ReactNode } from 'react';
import { qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { ATTENTION_ORDER, AttentionBadge, Icon, attentionClass, attentionMeta, type IconName } from '../../ui';
import { displayUnit } from '../vitals/copy';
import { rulesForMetric, targetFor, useAlerts, useCrewStatus, useMetrics, useSeries, useVitalsUi, worst } from '../vitals/data';
import { fmtAuto, fmtClock, relTime, toMs } from '../vitals/format';
import type { MeasurementPoint, MetricDef, RuleStatus } from '../vitals/types';
import { EcgStrip } from '../ecg';
// From the file, not the folder index: the console stays its own lazy chunk.
import { GroundConsoleLink } from '../console/GroundConsoleLink';

export type DetailTab = 'rules' | 'inputs' | 'ground';

export interface HudOverlayProps {
  scenarioId: string | null;
  /** Scroll to the detail section and open the given tab. */
  onOpen: (tab: DetailTab) => void;
}

const STALE_MS = 10 * 60_000;

const ICONS: Record<string, IconName> = {
  HEART_RATE: 'heart',
  SPO2: 'droplet',
  RESPIRATION_RATE: 'lungs',
  BODY_TEMPERATURE: 'thermometer',
  SYSTOLIC_BP: 'gauge',
  CABIN_CO2_PARTIAL_PRESSURE: 'wind',
  CABIN_O2_FRACTION: 'droplet',
  CABIN_PRESSURE: 'gauge',
  RADIATION_DOSE_RATE: 'radiation',
};

const SHORT: Record<string, string> = {
  SYSTOLIC_BP: 'Tansiyon',
  CABIN_CO2_PARTIAL_PRESSURE: 'CO₂',
  CABIN_O2_FRACTION: 'O₂',
  CABIN_PRESSURE: 'Basınç',
  RADIATION_DOSE_RATE: 'Radyasyon',
};

// Acute vitals only; HRV and sleep stay in the detail section.
const VITAL_ORDER = ['HEART_RATE', 'SPO2', 'BODY_TEMPERATURE', 'RESPIRATION_RATE', 'SYSTOLIC_BP'];
const ENV_ORDER = ['CABIN_CO2_PARTIAL_PRESSURE', 'CABIN_O2_FRACTION', 'CABIN_PRESSURE', 'RADIATION_DOSE_RATE'];

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function lastPoint(pts: MeasurementPoint[] | undefined): MeasurementPoint | null {
  if (!pts) return null;
  for (let i = pts.length - 1; i >= 0; i--) if (Number.isFinite(pts[i].value)) return pts[i];
  return null;
}

function pick(list: MetricDef[], order: string[]): MetricDef[] {
  return order.map((m) => list.find((d) => d.metric === m)).filter((d): d is MetricDef => !!d);
}

/* ------------------------------------------------------------------ panel */

function Panel({ title, id, aside, children, className }: { title: string; id: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`hud-panel${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <header className="hud-panel__head">
        <h2 id={id} className="hud-panel__title">
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------- metric row */

function MetricRow({
  def,
  pair = null,
  rules,
  onOpen,
  below,
}: {
  def: MetricDef;
  pair?: MetricDef | null;
  rules: RuleStatus[];
  onOpen: (m: string) => void;
  /** Rendered under the row, outside the button (e.g. the recorded ECG strip). */
  below?: ReactNode;
}) {
  const crewId = useApp((s) => s.crewId);
  const envId = useApp((s) => s.environmentTargetId);
  const now = useNow(30_000);
  const target = targetFor(def, crewId, envId);
  const series = useSeries(target ? def : null, 2, 10_000);
  const pairSeries = useSeries(pair && target ? pair : null, 2, 10_000);
  const last = lastPoint(series.data?.points);
  const lastPair = pair ? lastPoint(pairSeries.data?.points) : null;
  const top = worst([...rulesForMetric(rules, def.metric), ...(pair ? rulesForMetric(rules, pair.metric) : [])]);
  const level = top?.health_attention ?? null;
  const unit = displayUnit(def.unit);
  const pending = !!target && !series.data && !series.error;
  const observed = toMs(last?.observed_at);
  const stale = observed != null && now - observed > STALE_MS;
  const demo = !!top?.validation_status?.startsWith('DEMO');
  const value = last ? (pair ? `${fmtAuto(last.value)}/${lastPair ? fmtAuto(lastPair.value) : '—'}` : fmtAuto(last.value)) : '—';
  const reason = !target ? 'Hedef seçilmedi' : series.error ? 'Alınamadı' : 'Veri yok';
  const flagged = level && level !== 'NORMAL' && level !== 'UNKNOWN';

  return (
    <li>
      <button
        type="button"
        className={`hud-row${level ? ` ${attentionClass(level)}` : ''}${flagged ? ' is-flagged' : ''}${!last ? ' is-empty' : ''}`}
        onClick={() => onOpen(def.metric)}
        aria-label={`${def.label}: ${last ? `${value} ${unit}` : reason}. ${level ? attentionMeta(level).label : 'Kural yok'}. Ayrıntıyı aç.`}
      >
        <span className="hud-row__name">
          <Icon name={ICONS[def.metric] ?? 'pulse'} size={16} />
          {SHORT[def.metric] ?? def.label}
        </span>
        <span className="hud-row__value">
          {pending ? '…' : value}
          {last && <small>{unit}</small>}
        </span>
        <span className="hud-row__state">
          {level ? <AttentionBadge level={level} size="sm" /> : <span className="hud-tag">Kural yok</span>}
        </span>
        <span className={`hud-row__meta${stale ? ' is-stale' : ''}`} title={stale ? 'Son ölçüm 10 dakikadan eski' : undefined}>
          {last ? `${fmtClock(last.observed_at)} · ${relTime(last.observed_at, now)}` : reason}
          {demo && (
            <span className="hud-row__demo" title="DEMO eşik: uçuş tıbbı uzmanı doğrulaması bekliyor">
              {' '}
              · DEMO
            </span>
          )}
          {top?.validation_status === 'APPROVED' && (
            <span className="hud-row__src" title={top.source ? `Eşik kaynağı: ${top.source}` : undefined}>
              {' '}
              · Kaynaklı
            </span>
          )}
        </span>
      </button>
      {below}
    </li>
  );
}

/* ------------------------------------------------------------ status panel */

function initials(id: string): string {
  const letters = id.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase();
  const digits = id.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 2);
  return (letters + digits || id.slice(0, 2)).toUpperCase();
}

function StatusPanel({ scenarioId, onOpen }: { scenarioId: string | null; onOpen: (tab: DetailTab) => void }) {
  const status = useCrewStatus();
  const crewId = useApp((s) => s.crewId);
  const offline = useApp((s) => s.offline);
  const now = useNow(30_000);
  const data = status.data;
  const meta = attentionMeta(data?.overall_attention);
  const counts = new Map<string, number>();
  for (const r of data?.rules ?? []) counts.set(r.health_attention, (counts.get(r.health_attention) ?? 0) + 1);
  const generated = toMs(data?.generated_at);
  const stale = offline || (generated != null && now - generated > STALE_MS);
  const activity = (data as { current_activity?: { state: string; message_tr: string } | null } | null)?.current_activity;

  return (
    <Panel
      title="Genel durum"
      id="hud-status-title"
      className={`hud-status ${attentionClass(meta.level)}`}
      aside={
        <span className="hud-crew">
          <span className="hud-avatar" aria-hidden="true">
            {crewId ? initials(crewId) : '—'}
          </span>
          <span className="mono">{crewId ?? '—'}</span>
        </span>
      }
    >
      {!data ? (
        <p className="hud-status__desc">{status.error ? `Durum alınamadı. ${status.error.network ? 'Sunucuya ulaşılamıyor.' : status.error.message}` : 'Yükleniyor…'}</p>
      ) : (
        <>
          <p className="hud-status__level" aria-live="polite">
            <Icon name={meta.icon} size={28} />
            <span>{meta.label}</span>
          </p>
          <p className="hud-status__desc">{meta.description}</p>
          {counts.size > 0 && (
            <ul className="hud-status__counts" aria-label="Kural dağılımı">
              {ATTENTION_ORDER.filter((l) => counts.get(l)).map((l) => (
                <li key={l}>
                  <AttentionBadge level={l} size="sm">
                    {attentionMeta(l).label} {counts.get(l)}
                  </AttentionBadge>
                </li>
              ))}
            </ul>
          )}
          {activity && activity.state !== 'NONE' && <p className="hud-status__meta">{activity.message_tr}</p>}
          <p className="hud-status__meta">
            Değerlendirme {fmtClock(data.generated_at)} · {relTime(data.generated_at, now)}
            {stale && (offline ? ' · son bilinen veri' : ' · eski veri')}
          </p>
        </>
      )}
      <div className="hud-status__foot">
        {scenarioId && <span className="hud-tag hud-tag--demo">Sentetik veri · {scenarioId}</span>}
        <button type="button" className="hud-link" onClick={() => onOpen('rules')}>
          Kurallar ve “Neden?”
        </button>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ alerts panel */

function AlertsPanel({ onOpen }: { onOpen: (tab: DetailTab) => void }) {
  const { data, error } = useAlerts();
  const setActiveAlert = useVitalsUi((s) => s.setActiveAlert);
  const open = (data ?? []).filter((a) => a.status !== 'RESOLVED');
  const sorted = [...open].sort((a, b) => attentionMeta(b.health_attention).rank - attentionMeta(a.health_attention).rank);
  const unacked = open.filter((a) => a.status === 'OPEN').length;

  return (
    <Panel
      title="Açık alarmlar"
      id="hud-alerts-title"
      aside={<span className="hud-panel__count">{data ? open.length : '—'}</span>}
    >
      {!data ? (
        <p className="hud-empty">{error ? 'Alarmlar alınamadı' : 'Yükleniyor…'}</p>
      ) : sorted.length === 0 ? (
        <p className="hud-empty">Açık alarm yok.</p>
      ) : (
        <ul className="hud-rows">
          {sorted.slice(0, 3).map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="hud-alert"
                onClick={() => {
                  setActiveAlert(a.id);
                  onOpen('rules');
                }}
              >
                <AttentionBadge level={a.health_attention} size="sm" />
                <span className="hud-alert__title">{a.action_card?.title_tr ?? a.rule_id}</span>
                <span className="hud-alert__state">{a.status === 'OPEN' ? 'Görülmedi' : 'Görüldü'}</span>
              </button>
            </li>
          ))}
          {unacked > 0 && sorted.length > 3 && <li className="hud-empty">+{sorted.length - 3} alarm daha</li>}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------- clock panel */

interface SyncStatusLite {
  link_delay_seconds: number | null;
  recipients: { pending_items: number }[];
  pending_escalations: number;
}

function ClockPanel({ onOpen }: { onOpen: (tab: DetailTab) => void }) {
  const missionId = useApp((s) => s.missionId);
  const now = useNow(1000);
  const sync = usePolling<SyncStatusLite>(missionId ? `/v1/sync/status${qs({ mission_id: missionId })}` : null, 30_000);
  const d = new Date(now);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  const delay = sync.data?.link_delay_seconds;
  const pending = sync.data ? sync.data.recipients.reduce((n, r) => n + r.pending_items, 0) : null;

  return (
    <Panel
      title="Görev saati"
      id="hud-clock-title"
      aside={
        <span className="hud-clock">
          <time dateTime={d.toISOString()}>
            {hh}:{mm}:{ss}
          </time>{' '}
          UTC
        </span>
      }
    >
      <dl className="hud-kv">
        <div>
          <dt>Işık gecikmesi</dt>
          <dd>{delay == null ? <span className="hud-muted">tanımsız</span> : `${fmtAuto(delay)} sn`}</dd>
        </div>
        <div>
          <dt>Yer senkronu</dt>
          <dd>
            {pending == null ? (
              <span className="hud-muted">{sync.error ? 'alınamadı' : '—'}</span>
            ) : (
              <button type="button" className="hud-link" onClick={() => onOpen('ground')}>
                {pending} öğe bekliyor
              </button>
            )}
          </dd>
        </div>
        {sync.data && sync.data.pending_escalations > 0 && (
          <div>
            <dt>Eskalasyon</dt>
            <dd className="hud-warn-text">{sync.data.pending_escalations} bekliyor</dd>
          </div>
        )}
      </dl>
      <div className="hud-console">
        <GroundConsoleLink />
      </div>
    </Panel>
  );
}

/* ----------------------------------------------------------------- columns */

export function HudOverlay({ scenarioId, onOpen }: HudOverlayProps) {
  const status = useCrewStatus();
  const metrics = useMetrics();
  const select = useVitalsUi((s) => s.select);
  const rules = status.data?.rules ?? [];
  const dia = metrics.find((d) => d.metric === 'DIASTOLIC_BP') ?? null;
  const openMetric = (metric: string) => {
    select(metric);
    onOpen('rules');
  };

  return (
    <>
      <div className="hud__left">
        <Panel title="Vital bulgular" id="hud-vitals-title">
          <ul className="hud-rows">
            {pick(metrics, VITAL_ORDER).map((m) => (
              <MetricRow
                key={m.metric}
                def={m}
                pair={m.metric === 'SYSTOLIC_BP' ? dia : null}
                rules={rules}
                onOpen={openMetric}
                below={
                  m.metric === 'HEART_RATE' ? (
                    // Recorded sample, not the source of the number above (see ecg/README).
                    <div className="hud-ecg">
                      <EcgStrip compact height={56} />
                    </div>
                  ) : undefined
                }
              />
            ))}
          </ul>
        </Panel>
      </div>
      <div className="hud__cabin">
        <Panel title="Kabin ortamı" id="hud-cabin-title">
          <ul className="hud-rows hud-rows--strip">
            {pick(metrics, ENV_ORDER).map((m) => (
              <MetricRow key={m.metric} def={m} rules={rules} onOpen={openMetric} />
            ))}
          </ul>
        </Panel>
      </div>
      <div className="hud__right">
        <StatusPanel scenarioId={scenarioId} onOpen={onOpen} />
        <AlertsPanel onOpen={onOpen} />
        <ClockPanel onOpen={onOpen} />
      </div>
    </>
  );
}
