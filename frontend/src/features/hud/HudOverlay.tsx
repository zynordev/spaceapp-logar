// HUD layer floating over the full-screen 3D body scene. Every number comes
// from the API (status, measurements, alerts, sync status); missing data is
// shown as "—" with an explicit reason, never as a made-up value.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import {
  ATTENTION_ORDER,
  AttentionBadge,
  Icon,
  attentionClass,
  attentionMeta,
  type IconName,
} from '../../ui';
import { displayUnit } from '../vitals/copy';
import { rulesForMetric, targetFor, useAlerts, useCrewStatus, useMetrics, useSeries, useVitalsUi, worst } from '../vitals/data';
import { fmtAuto, fmtClock, relTime, toMs } from '../vitals/format';
import { Sparkline } from '../vitals/MetricTiles';
import type { MeasurementPoint, MetricDef, RuleStatus } from '../vitals/types';

export type DetailTab = 'rules' | 'inputs' | 'ground';

export interface HudOverlayProps {
  scenarioId: string | null;
  /** Scroll to the detail section and open the given tab. */
  onOpen: (tab: DetailTab) => void;
}

const STALE_MS = 10 * 60_000;

const ICONS: Record<string, IconName> = {
  HEART_RATE: 'heart',
  HRV_RMSSD: 'pulse',
  SPO2: 'droplet',
  RESPIRATION_RATE: 'lungs',
  BODY_TEMPERATURE: 'thermometer',
  SYSTOLIC_BP: 'gauge',
  SLEEP_DURATION: 'moon',
  CABIN_CO2_PARTIAL_PRESSURE: 'wind',
  CABIN_O2_FRACTION: 'droplet',
  CABIN_PRESSURE: 'gauge',
  RADIATION_DOSE_RATE: 'radiation',
};

/** Shorter HUD labels; the full API label stays in the accessible name. */
const SHORT: Record<string, string> = {
  HRV_RMSSD: 'HRV (RMSSD)',
  SYSTOLIC_BP: 'Tansiyon',
  // Cabin cards sit in the "Kabin ortamı" group: drop the repeated prefix.
  CABIN_CO2_PARTIAL_PRESSURE: 'CO₂',
  CABIN_O2_FRACTION: 'O₂',
  CABIN_PRESSURE: 'Basınç',
  RADIATION_DOSE_RATE: 'Radyasyon',
};

// The HUD shows acute vitals only; HRV and sleep stay in the detail section.
const VITAL_ORDER = ['SPO2', 'BODY_TEMPERATURE', 'RESPIRATION_RATE', 'SYSTOLIC_BP'];
const HUD_HIDDEN = new Set(['HEART_RATE', 'DIASTOLIC_BP', 'HRV_RMSSD', 'SLEEP_DURATION']);
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

function ordered(list: MetricDef[], order: string[]): MetricDef[] {
  const pick = order.map((m) => list.find((d) => d.metric === m)).filter((d): d is MetricDef => !!d);
  const rest = list.filter((d) => !order.includes(d.metric) && !HUD_HIDDEN.has(d.metric));
  return [...pick, ...rest];
}

/* ------------------------------------------------------------------ cards */

interface MetricCardProps {
  def: MetricDef;
  /** Second series shown as "a/b" (blood pressure). */
  pair?: MetricDef | null;
  rules: RuleStatus[];
  hero?: boolean;
  onOpen: (metric: string) => void;
}

function MetricCard({ def, pair = null, rules, hero = false, onOpen }: MetricCardProps) {
  const crewId = useApp((s) => s.crewId);
  const envId = useApp((s) => s.environmentTargetId);
  const now = useNow(30_000);
  const target = targetFor(def, crewId, envId);
  const series = useSeries(target ? def : null, hero ? 120 : 60, 10_000);
  const pairSeries = useSeries(pair && target ? pair : null, 2, 10_000);
  const last = lastPoint(series.data?.points);
  const lastPair = pair ? lastPoint(pairSeries.data?.points) : null;
  const related = [...rulesForMetric(rules, def.metric), ...(pair ? rulesForMetric(rules, pair.metric) : [])];
  const top = worst(related);
  const level = top?.health_attention ?? null;
  const unit = displayUnit(def.unit);
  const label = SHORT[def.metric] ?? def.label;
  const pending = !!target && !series.data && !series.error;
  const observed = toMs(last?.observed_at);
  const stale = observed != null && now - observed > STALE_MS;
  const quality = last && last.reported_quality !== 'VALID' ? last.reported_quality : null;

  const value = last
    ? pair
      ? `${fmtAuto(last.value)}/${lastPair ? fmtAuto(lastPair.value) : '—'}`
      : fmtAuto(last.value)
    : '—';
  const reason = !target ? 'Hedef seçilmedi' : series.error ? 'Alınamadı' : 'Veri yok';
  const aria = `${def.label}: ${last ? `${value} ${unit}` : reason}. ${
    level ? attentionMeta(level).label : 'Kural yok'
  }. Ayrıntılı grafiği aç.`;

  const levelCls = level ? attentionClass(level) : '';
  const demo = !!top?.validation_status?.startsWith('DEMO');
  return (
    <button
      type="button"
      className={`hud-card hud-metric${hero ? ' hud-metric--hero' : ''} ${levelCls}${
        level && level !== 'NORMAL' && level !== 'UNKNOWN' ? ' is-flagged' : ''
      }${!last ? ' is-empty' : ''}`}
      onClick={() => onOpen(def.metric)}
      aria-label={aria}
      data-attention={level ?? 'NONE'}
    >
      <span className="hud-card__head">
        <Icon name={ICONS[def.metric] ?? 'pulse'} size={16} className="hud-card__icon" />
        <span className="hud-card__label">{label}</span>
        {demo && (
          <span className="hud-tag hud-tag--demo" title="DEMO eşik: uçuş tıbbı uzmanı doğrulaması bekliyor">
            DEMO
          </span>
        )}
        {top?.validation_status === 'APPROVED' && (
          <span className="hud-tag hud-tag--ok" title={top.source ? `Eşik kaynağı: ${top.source}` : 'Kaynağıyla doğrulanmış eşik'}>
            Kaynaklı
          </span>
        )}
      </span>
      <span className="hud-metric__body">
        {pending ? (
          <span className="hud-skel" aria-hidden="true" />
        ) : (
          <span className="hud-value">
            {value}
            {last && <small>{unit}</small>}
          </span>
        )}
        {last && (
          <span className="hud-metric__trace">
            <Sparkline points={series.data?.points ?? []} />
          </span>
        )}
      </span>
      <span className="hud-card__foot">
        {level ? (
          <AttentionBadge level={level} size="sm" />
        ) : (
          <span className="hud-tag" title="Bu ölçüm için etkin kural yok: dikkat seviyesi hesaplanmaz">
            Kural yok
          </span>
        )}
        {quality && (
          <span className="hud-tag hud-tag--warn">{quality === 'SUSPECT' ? 'Şüpheli' : quality === 'FAULT' ? 'Arıza' : 'Eksik'}</span>
        )}
        <span className={`hud-card__time${stale ? ' is-stale' : ''}`} title={stale ? 'Son ölçüm 10 dakikadan eski' : undefined}>
          {last ? (
            <>
              {stale && <Icon name="clock" size={12} />}
              {fmtClock(last.observed_at)}
              <span className="hud-card__rel"> · {relTime(last.observed_at, now)}</span>
            </>
          ) : (
            reason
          )}
        </span>
      </span>
    </button>
  );
}

function initials(id: string): string {
  const letters = id.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase();
  const digits = id.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 2);
  return (letters + digits || id.slice(0, 2)).toUpperCase();
}

function CrewCard({ scenarioId, onOpen }: { scenarioId: string | null; onOpen: (tab: DetailTab) => void }) {
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
    <section className={`hud-card hud-crew ${attentionClass(meta.level)}`} aria-labelledby="hud-crew-title" data-attention={meta.level}>
      <header className="hud-crew__head">
        <span className="hud-avatar" aria-hidden="true">
          {crewId ? initials(crewId) : '—'}
        </span>
        <span className="hud-crew__id">
          <h2 id="hud-crew-title" className="hud-crew__name mono">
            {crewId ?? 'Astronot seçilmedi'}
          </h2>
          <span className="hud-crew__role">Mürettebat · genel durum</span>
        </span>
      </header>

      {!data ? (
        status.error ? (
          <p className="hud-crew__desc">Durum alınamadı. {status.error.network ? 'Sunucuya ulaşılamıyor.' : status.error.message}</p>
        ) : (
          <span className="hud-skel hud-skel--block" aria-hidden="true" />
        )
      ) : (
        <>
          <p className="hud-crew__level" aria-live="polite">
            <Icon name={meta.icon} size={26} />
            <span>{meta.label}</span>
          </p>
          <p className="hud-crew__desc">{meta.description}</p>
          {counts.size > 0 && (
            <ul className="hud-crew__counts" aria-label="Kural dağılımı">
              {ATTENTION_ORDER.filter((l) => counts.get(l)).map((l) => (
                <li key={l}>
                  <AttentionBadge level={l} size="sm">
                    {attentionMeta(l).label} {counts.get(l)}
                  </AttentionBadge>
                </li>
              ))}
            </ul>
          )}
          {activity && activity.state !== 'NONE' && (
            <p className={`hud-crew__activity${activity.state === 'EXPIRED' ? ' is-expired' : ''}`}>
              <Icon name={activity.state === 'EXPIRED' ? 'question' : 'info'} size={14} />
              <span>{activity.message_tr}</span>
            </p>
          )}
          <p className="hud-crew__time">
            <Icon name="clock" size={14} />
            <span>
              Değerlendirme {fmtClock(data.generated_at)} · {relTime(data.generated_at, now)}
            </span>
            {stale && <span className="hud-tag hud-tag--warn">{offline ? 'Son bilinen' : 'Eski veri'}</span>}
          </p>
        </>
      )}
      <div className="hud-crew__actions">
        {scenarioId && (
          <span className="hud-tag hud-tag--demo" title="Bu görevdeki tüm ölçümler sentetik demo verisidir">
            Sentetik veri · {scenarioId}
          </span>
        )}
        <button type="button" className="hud-link" onClick={() => onOpen('rules')}>
          Kurallar ve “Neden?”
          <Icon name="arrow-down" size={14} />
        </button>
      </div>
    </section>
  );
}

function AlertsCard({ onOpen }: { onOpen: (tab: DetailTab) => void }) {
  const { data, error } = useAlerts();
  const setActiveAlert = useVitalsUi((s) => s.setActiveAlert);
  const open = (data ?? []).filter((a) => a.status !== 'RESOLVED');
  const sorted = [...open].sort((a, b) => attentionMeta(b.health_attention).rank - attentionMeta(a.health_attention).rank);
  const unacked = open.filter((a) => a.status === 'OPEN').length;
  const level = sorted[0]?.health_attention ?? null;

  return (
    <section className={`hud-card hud-alerts${level ? ` ${attentionClass(level)}` : ''}`} aria-labelledby="hud-alerts-title">
      <header className="hud-card__head">
        <Icon name="alert" size={16} className="hud-card__icon" />
        <h2 id="hud-alerts-title" className="hud-card__label">
          Etkin alarmlar
        </h2>
      </header>
      {!data ? (
        error ? <p className="hud-card__time">Alarmlar alınamadı</p> : <span className="hud-skel" aria-hidden="true" />
      ) : (
        <>
          <p className="hud-alerts__summary">
            <span className="hud-value">
              {open.length}
              <small>{open.length ? 'açık alarm' : 'açık alarm yok'}</small>
            </span>
            {unacked > 0 && <span className="hud-tag hud-tag--warn">{unacked} görülmedi</span>}
          </p>
          {sorted.length > 0 && (
            <ul className="hud-alerts__list">
              {sorted.slice(0, 2).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="hud-alerts__item"
                    onClick={() => {
                      setActiveAlert(a.id);
                      onOpen('rules');
                    }}
                  >
                    <AttentionBadge level={a.health_attention} size="sm" />
                    <span className="hud-alerts__title">{a.action_card?.title_tr ?? a.rule_id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

interface SyncStatusLite {
  link_delay_seconds: number | null;
  recipients: { pending_items: number }[];
  pending_escalations: number;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="hud-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function MissionClock({ onOpen }: { onOpen: (tab: DetailTab) => void }) {
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
    <section className="hud-card hud-clock" aria-labelledby="hud-clock-title">
      <header className="hud-card__head">
        <Icon name="clock" size={16} className="hud-card__icon" />
        <h2 id="hud-clock-title" className="hud-card__label">
          Görev saati
        </h2>
        <span className="hud-tag">UTC</span>
      </header>
      <p className="hud-value hud-clock__time">
        <time dateTime={d.toISOString()}>
          {hh}:{mm}
        </time>
        <small>{ss}</small>
      </p>
      <dl className="hud-rows">
        <Row label="Işık gecikmesi">
          {delay == null ? (
            <span className="hud-muted" title="Sunucuda bağlantı gecikmesi yapılandırılmamış">
              — tanımsız
            </span>
          ) : (
            `${fmtAuto(delay)} sn`
          )}
        </Row>
        <Row label="Yer senkronu">
          {pending == null ? (
            <span className="hud-muted">{sync.error ? 'alınamadı' : '—'}</span>
          ) : (
            <button type="button" className="hud-link" onClick={() => onOpen('ground')}>
              {pending} öğe bekliyor
            </button>
          )}
        </Row>
        {sync.data && sync.data.pending_escalations > 0 && (
          <Row label="Eskalasyon">
            <span className="hud-warn-text">{sync.data.pending_escalations} bekliyor</span>
          </Row>
        )}
      </dl>
    </section>
  );
}

/* ---------------------------------------------------------------- overlay */

export function HudOverlay({ scenarioId, onOpen }: HudOverlayProps) {
  const status = useCrewStatus();
  const metrics = useMetrics();
  const select = useVitalsUi((s) => s.select);
  const rules = status.data?.rules ?? [];
  const byId = (m: string) => metrics.find((d) => d.metric === m) ?? null;
  const vitals = ordered(metrics.filter((m) => m.category !== 'environment'), VITAL_ORDER);
  const env = ordered(metrics.filter((m) => m.category === 'environment'), ENV_ORDER);
  const hr = byId('HEART_RATE');
  // Publish the cabin row height so the shell can start the 3D scene below it.
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = topRef.current;
    const hud = el?.closest<HTMLElement>('.hud');
    if (!el || !hud) return;
    const ro = new ResizeObserver(() => hud.style.setProperty('--hud-top-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const openMetric = (metric: string) => {
    select(metric);
    onOpen('rules');
  };

  return (
    <>
      <div className="hud__left" role="group" aria-label="Vital bulgular">
        {hr && <MetricCard def={hr} rules={rules} hero onOpen={openMetric} />}
        {vitals.map((m) => (
          <MetricCard
            key={m.metric}
            def={m}
            pair={m.metric === 'SYSTOLIC_BP' ? byId('DIASTOLIC_BP') : null}
            rules={rules}
            onOpen={openMetric}
          />
        ))}
      </div>
      <div className="hud__top" role="group" aria-label="Kabin ortamı" ref={topRef}>
        {env.map((m) => (
          <MetricCard key={m.metric} def={m} rules={rules} onOpen={openMetric} />
        ))}
      </div>
      <div className="hud__right">
        <CrewCard scenarioId={scenarioId} onOpen={onOpen} />
        <AlertsCard onOpen={onOpen} />
        <MissionClock onOpen={onOpen} />
      </div>
    </>
  );
}

