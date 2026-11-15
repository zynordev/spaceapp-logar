// Mission screen, built to the design team's hand-made layout:
//   left   crew cards (one per crew member in the mission) + mission card
//   top    cabin conditions: one column per measured metric
//   main   3D body (shell) + vital-sign columns and the recorded ECG strip
// Every number comes from the API. Missing data is "—" with a reason; no
// photos or names of real people, no invented health score.
import { useEffect, useState, type ReactNode } from 'react';
import { qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Icon, SOURCE_META, SourceBadge, attentionMeta, labSource, measurementSource, ruleSource, type IconName, type SourceKind } from '../../ui';
import { cmpSymbol, displayUnit } from '../vitals/copy';
import { rulesForMetric, targetFor, useAlerts, useCrewStatus, useMetrics, useSeries, useVitalsUi, worst } from '../vitals/data';
import { fmtAuto, fmtClock, relTime, toMs } from '../vitals/format';
import type { AlertRead, CrewStatus, MeasurementPoint, MetricDef, RuleStatus } from '../vitals/types';
import { EcgStrip } from '../ecg';
// From the file, not the folder index: the console stays its own lazy chunk.
import { GroundConsoleLink } from '../console/GroundConsoleLink';

export type DetailTab = 'rules' | 'inputs' | 'ground';

export interface HudOverlayProps {
  scenarioId: string | null;
  /** Crew members of the selected mission (from GET /v1/missions). */
  crewIds: string[];
  /** Scroll to the detail section and open the given tab. */
  onOpen: (tab: DetailTab) => void;
  /** Whether the big panel shows the 3D body + vitals. */
  bodyOpen: boolean;
  /** Crew card clicked: select it and open (or close) its 3D model. */
  onOpenCrew: (crewId: string) => void;
}

const STALE_MS = 10 * 60_000;

const ICONS: Record<string, IconName> = {
  HEART_RATE: 'heart',
  SPO2: 'droplet',
  RESPIRATION_RATE: 'lungs',
  BODY_TEMPERATURE: 'thermometer',
  SYSTOLIC_BP: 'gauge',
  CABIN_CO2_PARTIAL_PRESSURE: 'wind',
  CABIN_O2_FRACTION: 'circle',
  CABIN_PRESSURE: 'gauge',
  RADIATION_DOSE_RATE: 'radiation',
};

/** Column titles: the API metric keys, wrapped where the reference wraps. */
const KEY_LABEL: Record<string, string> = {
  CABIN_CO2_PARTIAL_PRESSURE: 'CABIN_CO2_​PARTIAL_PRESSURE',
  SYSTOLIC_BP: 'BLOOD_PRESSURE',
};

const VITAL_ORDER = ['HEART_RATE', 'SPO2', 'BODY_TEMPERATURE', 'RESPIRATION_RATE', 'SYSTOLIC_BP'];
const ENV_ORDER = ['CABIN_PRESSURE', 'CABIN_O2_FRACTION', 'CABIN_CO2_PARTIAL_PRESSURE', 'RADIATION_DOSE_RATE'];

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

const upperTr = (s: string) => s.toLocaleUpperCase('en-GB');

/* --------------------------------------------------------------- pieces */

function Panel({
  title,
  id,
  aside,
  children,
  className,
  tour,
  crew,
  open,
}: {
  title: ReactNode;
  id: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Stable hooks for the guided tour: data-tour / data-crew / data-open. */
  tour?: string;
  crew?: string;
  open?: boolean;
}) {
  return (
    <section
      className={`hud-panel${className ? ` ${className}` : ''}`}
      aria-labelledby={id}
      data-tour={tour}
      data-crew={crew}
      data-open={open ? 'true' : undefined}
    >
      <header className="hud-panel__head">
        <h2 id={id} className="hud-panel__title">
          {title}
        </h2>
        {aside}
      </header>
      <div className="hud-panel__body">{children}</div>
    </section>
  );
}

/** Solid status bar with the level word (dark ink on the bar colour). */
function StatusBar({ level }: { level: string | null }) {
  if (!level) return <span className="hud-bar hud-bar--none">KURAL YOK</span>;
  const m = attentionMeta(level);
  return (
    <span className={`hud-bar hud-bar--${m.level.toLowerCase()}`} title={m.description}>
      {upperTr(m.label)}
    </span>
  );
}

/* ---------------------------------------------------------- metric column */

function MetricColumn({
  def,
  pair = null,
  rules,
  onOpen,
  compact = false,
  scenarioId,
}: {
  def: MetricDef;
  pair?: MetricDef | null;
  rules: RuleStatus[];
  onOpen: (m: string) => void;
  compact?: boolean;
  /** Mission scenario: values of a scenario mission are SYNTHETIC. */
  scenarioId: string | null;
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
  const value = last ? (pair ? `${fmtAuto(last.value)}/${lastPair ? fmtAuto(lastPair.value) : '—'}` : fmtAuto(last.value)) : '—';
  const reason = !target ? 'No target selected' : series.error ? 'Not loaded' : 'No data';
  const approved = top?.validation_status === 'APPROVED';
  const demo = !!top?.validation_status?.startsWith('DEMO');
  // Only show a threshold on the metric the rule is measured on; a related
  // rule (e.g. ppO2 shown under cabin pressure) gets its name instead.
  const own = !!top && (top.metric === def.metric || (!!pair && top.metric === pair.metric));
  const thr = top && own && Number.isFinite(top.threshold) ? `${cmpSymbol(top.comparison)} ${fmtAuto(top.threshold)} ${displayUnit(top.unit)}` : top ? 'related' : '';
  // Provenance: the threshold (STANDART / DEMO) and the value (SENTETİK; in the
  // radiation-spe scenario the event timing is a real NASA DONKI record).
  const thrSrc = ruleSource(top);
  const valueSrc: SourceKind | null = last ? measurementSource(scenarioId) : null;
  const donki = def.metric === 'RADIATION_DOSE_RATE' && scenarioId === 'radiation-spe' && !!last;
  const srcSay = [
    valueSrc ? `Value: ${SOURCE_META[valueSrc].label}${donki ? ', event timing REAL (NASA DONKI)' : ''}.` : '',
    thrSrc ? `Threshold: ${SOURCE_META[thrSrc.kind].label}${thrSrc.detail ? ` (${thrSrc.detail})` : ''}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={`hud-col${compact ? ' hud-col--compact' : ''}`} data-tour={`metric-${def.metric}`}>
      <button
        type="button"
        className="hud-col__btn"
        onClick={() => onOpen(def.metric)}
        aria-label={`${def.label}: ${last ? `${value} ${unit}` : reason}. ${level ? attentionMeta(level).label : 'No rule'}.${last ? ` Reading ${fmtClock(last.observed_at)}.` : ''}${srcSay ? ` ${srcSay}` : ''} Open details.`}
        title={last ? `Last reading ${fmtClock(last.observed_at)} · ${relTime(last.observed_at, now)}` : undefined}
      >
        <span className="hud-col__key" title={def.label}>
          {KEY_LABEL[def.metric] ?? def.metric}
        </span>
        <span className={`hud-col__value${!last ? ' is-empty' : ''}`}>
          {pending ? '…' : value}
          {compact && last && <small className="hud-col__unit-inline">{unit}</small>}
        </span>
        {(!compact || !last) && <span className="hud-col__unit">{last ? unit : reason}</span>}
        <StatusBar level={level} />
        <span className={`hud-col__src${demo ? ' is-demo' : ''}`}>
          {thrSrc && (
            <SourceBadge
              kind={thrSrc.kind}
              detail={compact ? null : thrSrc.detail}
              size="xs"
              title={
                thrSrc.kind === 'DEMO'
                  ? 'DEMO threshold (evidence class F): awaiting flight medicine expert validation.'
                  : approved && top?.source
                    ? `Threshold sourced from NASA-STD-3001. Source: ${top.source}`
                    : undefined
              }
            />
          )}
          <span className="hud-col__thr" title={top?.source || undefined}>
            {top ? thr : 'NO THRESHOLD'}
          </span>
        </span>
        {(valueSrc || donki) && (
          <span className="hud-col__prov">
            {valueSrc && <SourceBadge kind={valueSrc} size="xs" title="Value is synthetic data generated by a demo scenario; not a real measurement." />}
            {donki && (
              <SourceBadge
                kind="REAL"
                detail={compact ? 'DONKI' : 'NASA DONKI'}
                size="xs"
                title="Event timing is from a real NASA DONKI solar particle event record; dose values are synthetic."
              />
            )}
          </span>
        )}
        {!compact && (
          <span className={`hud-col__time${stale ? ' is-stale' : ''}`}>{last ? `${fmtClock(last.observed_at)} · ${relTime(last.observed_at, now)}` : ' '}</span>
        )}
        {!compact && <Icon name={ICONS[def.metric] ?? 'pulse'} size={30} className="hud-col__icon" />}
      </button>
    </li>
  );
}

/* --------------------------------------------------------------- crew card */

interface CheckInLite {
  observed_at: string;
  [k: string]: number | string | null;
}
interface LabPanelLite {
  results: { position_vs_reference: 'BELOW' | 'WITHIN' | 'ABOVE'; sampled_at: string; source_type?: string | null }[];
}

const SYMPTOM_TR: Record<string, string> = {
  fatigue: 'Yorgunluk',
  dizziness: 'Dizziness',
  nausea: 'Nausea',
  headache: 'Headache',
  pain: 'Pain',
  mood_distress: 'Ruh hali',
  vision_change: 'Vision',
  back_pain: 'Back pain',
  congestion: 'Congestion',
};

function initials(id: string): string {
  const letters = id.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase();
  const digits = id.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 2);
  return (letters + digits || id.slice(0, 2)).toUpperCase();
}

/** White disc with an arc: share of this crew member's rules that are NORMAL. */
function RuleRing({ normal, total, level }: { normal: number; total: number; level: string }) {
  const pct = total ? Math.round((normal / total) * 100) : null;
  const r = 22;
  const c = 2 * Math.PI * r;
  const m = attentionMeta(level);
  return (
    <span
      className={`hud-ring hud-ring--${m.level.toLowerCase()}`}
      role="img"
      aria-label={total ? `${normal} of ${total} rules are normal (${pct}%). Overall status: ${m.label}.` : 'No rules have been evaluated.'}
      title={total ? `${normal}/${total} rules normal · overall status: ${m.label}` : 'No rules have been evaluated'}
    >
      <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
        <circle cx="28" cy="28" r="27" className="hud-ring__disc" />
        <circle cx="28" cy="28" r={r} className="hud-ring__track" />
        {pct !== null && (
          <circle cx="28" cy="28" r={r} className="hud-ring__arc" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 28 28)" />
        )}
      </svg>
      <span className="hud-ring__num" aria-hidden="true">
        {pct === null ? '—' : pct}
        {pct !== null && <sup>%</sup>}
      </span>
    </span>
  );
}

function CrewCard({
  crewId,
  envId,
  alerts,
  onOpen,
  open,
  onToggle,
}: {
  crewId: string;
  envId: string | null;
  alerts: AlertRead[];
  onOpen: (tab: DetailTab) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const missionId = useApp((s) => s.missionId);
  const now = useNow(30_000);
  const base = missionId ? `/v1/crew/${encodeURIComponent(crewId)}` : null;
  const status = usePolling<CrewStatus & { latest_check_in?: CheckInLite | null }>(
    base ? `${base}/status${qs({ mission_id: missionId, environment_target_id: envId })}` : null,
    10_000,
  );
  const labs = usePolling<LabPanelLite>(base ? `${base}/lab-results${qs({ mission_id: missionId })}` : null, 60_000);
  const data = status.data;
  const crewRules = (data?.rules ?? []).filter((r) => r.target_id === crewId);
  const normal = crewRules.filter((r) => r.health_attention === 'NORMAL').length;
  const overall = attentionMeta(data?.overall_attention);
  const physio = worst(crewRules.filter((r) => !r.rule_id.startsWith('RED_FLAG')));

  const mine = alerts.filter((a) => a.target_id === crewId && a.status !== 'RESOLVED');
  const urgent = mine
    .filter((a) => a.health_attention === 'ALERT' || a.health_attention === 'CRITICAL')
    .sort((a, b) => attentionMeta(b.health_attention).rank - attentionMeta(a.health_attention).rank);
  const watching = mine.filter((a) => a.health_attention === 'WATCH').length;

  const ci = data?.latest_check_in ?? null;
  let psych = 'No subjective entry';
  if (ci) {
    let topKey: string | null = null;
    let topVal = 0;
    for (const [k, v] of Object.entries(ci)) {
      if (typeof v === 'number' && k in SYMPTOM_TR && v > topVal) {
        topVal = v;
        topKey = k;
      }
    }
    psych = topKey ? `${SYMPTOM_TR[topKey]} ${topVal}/4 · ${relTime(ci.observed_at, now)}` : `belirti yok · ${relTime(ci.observed_at, now)}`;
  }
  const labRes = labs.data?.results ?? [];
  const outRef = labRes.filter((r) => r.position_vs_reference !== 'WITHIN').length;
  const blood = labs.data ? (labRes.length ? `${labRes.length} results · ${outRef} out of range` : 'No lab results') : labs.error ? 'Not loaded' : '…';
  // One badge per lab source present (GERÇEK = NASA OSDR, ELLE = manual entry).
  const labSrcs = [...new Set(labRes.map((r) => r.source_type ?? ''))]
    .map((t) => labSource(t))
    .filter((x): x is NonNullable<ReturnType<typeof labSource>> => !!x);

  return (
    <Panel
      title={
        <button type="button" className="hud-crewcard__name" aria-pressed={open} onClick={onToggle}>
          {upperTr(crewId)}
        </button>
      }
      id={`hud-crew-${crewId}`}
      tour="crew-card"
      crew={crewId}
      open={open}
      className={`hud-crewcard att-${overall.level.toLowerCase()}${open ? ' is-open' : ''}`}
      aside={<span className="hud-tag">{open ? '3D ON' : 'CLICK FOR 3D'}</span>}
    >
      <div className="hud-crew">
        <button
          type="button"
          className="hud-crew__photo"
          data-tour="crew-open"
          data-crew={crewId}
          aria-pressed={open}
          aria-label={open ? `${crewId}: close the 3D body model` : `${crewId}: open the 3D body model`}
          onClick={onToggle}
        >
          <span aria-hidden="true">{initials(crewId)}</span>
          <small aria-hidden="true">{open ? 'KAPAT' : '3D MODEL'}</small>
        </button>
        <div className="hud-crew__info">
          <div className="hud-crew__row">
            <span className="hud-crew__label">
              EMERGENCY
              <br />
              DURUM:
            </span>
            <button type="button" className={`hud-crew__emergency${urgent.length ? ' is-active' : ''}`} onClick={() => onOpen('rules')}>
              {urgent.length
                ? `${upperTr(urgent[0].action_card?.title_tr ?? urgent[0].rule_id)}${urgent.length > 1 ? ` (+${urgent.length - 1})` : ''}`
                : watching
                  ? `NO EMERGENCY. ${watching} WATCH ALARM(S).`
                  : 'NO OPEN EMERGENCY.'}
            </button>
          </div>
          <div className="hud-crew__row hud-crew__row--health">
            <span className="hud-crew__label">
              GENEL
              <br />
              HEALTH:
            </span>
            <RuleRing normal={normal} total={crewRules.length} level={data?.overall_attention ?? 'UNKNOWN'} />
            <ul className="hud-crew__list">
              <li>
                <span>›Fizyolojik</span>
                <b className={physio ? `t-${physio.health_attention.toLowerCase()}` : undefined}>
                  {physio ? attentionMeta(physio.health_attention).label : 'No rule'}
                </b>
              </li>
              <li>
                <span>›Psikolojik</span>
                <b>{psych}</b>
              </li>
              <li>
                <span>›Kan</span>
                <b>{blood}</b>
                {labSrcs.length > 0 && (
                  <span className="hud-crew__src">
                    {labSrcs.map((x) => (
                      <SourceBadge
                        key={x.kind}
                        kind={x.kind}
                        detail={x.detail === 'NASA OSDR' ? 'OSDR' : x.detail}
                        size="xs"
                        title={x.kind === 'REAL' ? 'Real public data: NASA OSDR laboratory record; not this astronaut’s own measurement.' : undefined}
                      />
                    ))}
                  </span>
                )}
              </li>
            </ul>
          </div>
          <p className="hud-crew__resume">
            <span>Health summary:</span>{' '}
            {data ? (
              <>
                <b className={`t-${overall.level.toLowerCase()}`}>{upperTr(overall.label)}</b> — {overall.description}
              </>
            ) : status.error ? (
              'status not loaded'
            ) : (
              '…'
            )}
          </p>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- mission card */

interface SyncStatusLite {
  link_delay_seconds: number | null;
  recipients: { pending_items: number }[];
  pending_escalations: number;
}

/** Mission line in the cabin header strip: UTC clock, light delay, ground
 * sync and the ground console link (the left column is for crew cards). */
function MissionStrip({ scenarioId, onOpen }: { scenarioId: string | null; onOpen: (tab: DetailTab) => void }) {
  const missionId = useApp((s) => s.missionId);
  const now = useNow(1000);
  const sync = usePolling<SyncStatusLite>(missionId ? `/v1/sync/status${qs({ mission_id: missionId })}` : null, 30_000);
  const d = new Date(now);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const delay = sync.data?.link_delay_seconds;
  const pending = sync.data ? sync.data.recipients.reduce((n, r) => n + r.pending_items, 0) : null;
  const esc = sync.data?.pending_escalations ?? 0;

  return (
    <div className="hud-mission" role="group" aria-label="Mission" data-tour="mission">
      {scenarioId && (
        <span className="hud-mission__item hud-mission__demo" title="Measurements in this mission are synthetic demo data">
          SYNTHETIC · {scenarioId}
        </span>
      )}
      <span className="hud-mission__item">
        LIGHT DELAY <b>{delay == null ? 'n/a' : `${fmtAuto(delay)} s`}</b>
      </span>
      <span className="hud-mission__item">
        YER{' '}
        {pending == null ? (
          <b>{sync.error ? 'not loaded' : '—'}</b>
        ) : (
          <button type="button" className="hud-link" onClick={() => onOpen('ground')}>
            {pending} bekliyor{esc ? ` · ${esc} eskalasyon` : ''}
          </button>
        )}
      </span>
      <time className="hud-mission__clock" dateTime={d.toISOString()}>
        {p2(d.getUTCHours())}:{p2(d.getUTCMinutes())}:{p2(d.getUTCSeconds())} <small>UTC</small>
      </time>
      <GroundConsoleLink compact />
    </div>
  );
}

/* ------------------------------------------------------------------ export */

export function HudOverlay({ scenarioId, crewIds = [], onOpen, bodyOpen = false, onOpenCrew }: HudOverlayProps) {
  const status = useCrewStatus();
  const metrics = useMetrics();
  const alerts = useAlerts();
  const select = useVitalsUi((s) => s.select);
  const envId = useApp((s) => s.environmentTargetId);
  const crewId = useApp((s) => s.crewId);
  const rules = status.data?.rules ?? [];
  const dia = metrics.find((d) => d.metric === 'DIASTOLIC_BP') ?? null;
  const openMetric = (metric: string) => {
    select(metric);
    onOpen('rules');
  };

  return (
    <>
      <div className="hud__left">
        {crewIds.map((c) => (
          <CrewCard
            key={c}
            crewId={c}
            envId={envId}
            alerts={alerts.data ?? []}
            onOpen={onOpen}
            open={bodyOpen && crewId === c}
            onToggle={() => onOpenCrew(c)}
          />
        ))}
      </div>

      <div className="hud__room">
        <Panel title={<>CABIN ENVIRONMENT{envId && <small className="hud-panel__sub"> · {envId}</small>}</>} id="hud-room-title" tour="cabin" aside={<MissionStrip scenarioId={scenarioId} onOpen={onOpen} />}>
          <ul className="hud-cols">
            {pick(metrics, ENV_ORDER).map((m) => (
              <MetricColumn key={m.metric} def={m} rules={rules} onOpen={openMetric} scenarioId={scenarioId} />
            ))}
          </ul>
        </Panel>
      </div>

      <div className="hud__vitals">
        {bodyOpen && (
        <section className="hud-vitals" data-tour="vitals" aria-label={`Vital bulgular · ${crewId ?? ''}`}>
          <ul className="hud-cols hud-cols--grid">
            {pick(metrics, VITAL_ORDER).map((m) => (
              <MetricColumn
                key={m.metric}
                def={m}
                pair={m.metric === 'SYSTOLIC_BP' ? dia : null}
                rules={rules}
                onOpen={openMetric}
                compact
                scenarioId={scenarioId}
              />
            ))}
          </ul>
          {/* Recorded sample with its own label; not the source of HEART_RATE above. */}
          <div className="hud-ecg" data-tour="ecg">
            <EcgStrip compact height={48} />
          </div>
        </section>
        )}
      </div>
    </>
  );
}
