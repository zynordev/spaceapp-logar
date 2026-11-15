// Mission screens built 1:1 to the design team's three frames (1920x1080
// design pixels, scaled to the viewport):
//   overview  crew cards | room conditions | empty main panel
//   crew      overview blurred + window: body | three summary rings
//   person    warnings | body parameters | general data | body | subjective
// Every value comes from the API. Exceptions to the design, all forced:
// no real names/photos (crew id + initials), no invented scores (rings are
// shares of NORMAL rules / in-range labs), unmeasured cabin values show "—",
// DEMO thresholds stay labelled, the recorded ECG keeps its full label.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Icon, SourceBadge, attentionMeta, measurementSource, ruleSource, type IconName } from '../../ui';
import { cmpSymbol, displayUnit } from '../vitals/copy';
import { rulesForMetric, targetFor, useAlerts, useCrewStatus, useMetrics, useSeries, useVitalsUi, worst } from '../vitals/data';
import { fmtAuto, fmtClock, relTime } from '../vitals/format';
import type { AlertRead, CrewStatus, MeasurementPoint, MetricDef, RuleStatus } from '../vitals/types';
import { BodyMapPanel } from '../body3d';
import { EcgStrip } from '../ecg';
import { MissionSpaceView } from '../space';

export type DetailTab = 'rules' | 'inputs' | 'ground';

export interface MissionScreensProps {
  scenarioId: string | null;
  crewIds: string[];
  /** Scroll to the detail section and open a tab. */
  onOpen: (tab: DetailTab) => void;
}

type Screen = 'overview' | 'crew' | 'person';

const W = 1920;
const H = 1080;

/* ================================================================ helpers */

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const upperTr = (s: string) => s.toUpperCase();

function lastPoint(pts: MeasurementPoint[] | undefined): MeasurementPoint | null {
  if (!pts) return null;
  for (let i = pts.length - 1; i >= 0; i--) if (Number.isFinite(pts[i].value)) return pts[i];
  return null;
}

function initials(id: string): string {
  const letters = id.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase();
  const digits = id.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 2);
  return (letters + digits || id.slice(0, 2)).toUpperCase();
}

/** Absolute box in design pixels. */
function box(x: number, y: number, w: number, h: number): CSSProperties {
  return { left: x, top: y, width: w, height: h };
}

/** Solid status bar with the level word. */
function Bar({ level, text, className = '' }: { level: string | null; text?: string; className?: string }) {
  if (!level) return <span className={`dz-bar dz-bar--none ${className}`}>{text ?? 'KURAL YOK'}</span>;
  const m = attentionMeta(level);
  return (
    <span className={`dz-bar dz-bar--${m.level.toLowerCase()} ${className}`} title={m.description}>
      {text ?? upperTr(m.label)}
    </span>
  );
}

/**
 * Ring colour. An open WATCH/ALERT/CRITICAL attention always wins (a critical
 * crew member is never shown green because most of their rules are normal),
 * and UNKNOWN stays grey ("unknown is not normal"). Otherwise the share
 * decides: 70-100 green, 35-69 yellow, 0-34 red.
 */
/** Ring colour is the share itself: 70-100 green, 35-69 yellow, 0-34 red,
 * no data grey. Only a CRITICAL state overrides the share and turns the ring
 * red (e.g. a radiation emergency); a WARNING or WATCH never does. */
function ringBand(pct: number | null, level?: string | null): 'normal' | 'watch' | 'alert' | 'critical' | 'unknown' {
  if ((level ?? '').toUpperCase() === 'CRITICAL') return 'critical';
  if (pct === null) return 'unknown';
  if (pct >= 70) return 'normal';
  if (pct >= 35) return 'watch';
  return 'critical';
}

/** White disc + coloured arc + number (share in %). */
function Ring({ pct, size, stroke, label, level }: { pct: number | null; size: number; stroke: number; label: string; level?: string | null }) {
  const r = size / 2 - stroke / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={`dz-ring dz-ring--${ringBand(pct, level)}`} style={{ width: size, height: size }} role="img" aria-label={label} title={label}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} className="dz-ring__disc" />
        <circle cx={size / 2} cy={size / 2} r={r} className="dz-ring__track" style={{ strokeWidth: stroke }} />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className="dz-ring__arc"
            style={{ strokeWidth: stroke }}
            strokeDasharray={`${(c * pct) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="dz-ring__num" style={{ fontSize: size * 0.3 }} aria-hidden="true">
        {pct === null ? '—' : pct}
        {pct !== null && <sup>%</sup>}
      </span>
    </span>
  );
}

const pctOf = (n: number, t: number) => (t ? Math.round((n / t) * 100) : null);

/* ================================================================== data */

interface CheckInLite {
  observed_at: string;
  [k: string]: number | string | null;
}
interface LabPanelLite {
  results: { analyte: string; position_vs_reference: 'BELOW' | 'WITHIN' | 'ABOVE'; sampled_at: string }[];
}
type CrewStatusX = CrewStatus & { latest_check_in?: CheckInLite | null };

function useCrewData(crewId: string | null) {
  const missionId = useApp((s) => s.missionId);
  const envId = useApp((s) => s.environmentTargetId);
  const base = missionId && crewId ? `/v1/crew/${encodeURIComponent(crewId)}` : null;
  const status = usePolling<CrewStatusX>(base ? `${base}/status${qs({ mission_id: missionId, environment_target_id: envId })}` : null, 10_000);
  const labs = usePolling<LabPanelLite>(base ? `${base}/lab-results${qs({ mission_id: missionId })}` : null, 60_000);
  const rules = status.data?.rules ?? [];
  const crewRules = rules.filter((r) => r.target_id === crewId);
  const envRules = rules.filter((r) => r.target_id !== crewId);
  const labRes = labs.data?.results ?? [];
  const inRange = labRes.filter((r) => r.position_vs_reference === 'WITHIN').length;
  return { status, labs, crewRules, envRules, labRes, inRange };
}

const SYMPTOM_TR: Record<string, string> = {
  fatigue: 'Yorgunluk',
  dizziness: 'Dizziness',
  nausea: 'Nausea',
  headache: 'Headache',
  pain: 'Pain',
  mood_distress: 'Mood distress',
  vision_change: 'Vision change',
  back_pain: 'Back pain',
  congestion: 'Nasal congestion',
};
const SEVERITY = ['None', 'Mild', 'Moderate', 'Severe', 'Very severe'];

/* ============================================================ crew card */

const CARD_TOPS = [13, 279, 545, 811];

function CrewCard({ crewId, top, alerts, onClick, open = false }: { crewId: string; top: number; alerts: AlertRead[]; onClick: () => void; open?: boolean }) {
  const d = useCrewData(crewId);
  const data = d.status.data;
  const overall = attentionMeta(data?.overall_attention);
  const normal = d.crewRules.filter((r) => r.health_attention === 'NORMAL').length;
  const physio = worst(d.crewRules.filter((r) => !r.rule_id.startsWith('RED_FLAG')));
  const urgent = alerts
    .filter((a) => a.target_id === crewId && a.status !== 'RESOLVED' && (a.health_attention === 'ALERT' || a.health_attention === 'CRITICAL'))
    .sort((a, b) => attentionMeta(b.health_attention).rank - attentionMeta(a.health_attention).rank);
  const pct = pctOf(normal, d.crewRules.length);
  const blood = d.labs.data ? (d.labRes.length ? `${d.inRange}/${d.labRes.length} in range` : 'no lab results') : '…';

  return (
    <button
      type="button"
      className={`dz-card dz-crew att-${overall.level.toLowerCase()}`}
      style={box(17, top, 615, 255)}
      onClick={onClick}
      aria-label={`${crewId}: open details`}
      data-tour="crew-card"
      data-open={open ? 'true' : undefined}
    >
      <span className="dz-strip dz-crew__name">{upperTr(crewId)}</span>
      <span className="dz-crew__photo" aria-hidden="true" data-tour="crew-open" data-crew={crewId}>
        {initials(crewId)}
      </span>
      <span className="dz-crew__label" style={box(183, 60, 132, 64)}>
        EMERGENCY
        <br />
        CONDITIONS:
      </span>
      <span className={`dz-crew__emergency${urgent.length ? ' is-active' : ''}`} style={box(330, 62, 265, 60)}>
        {urgent.length ? upperTr(urgent[0].action_card?.title_tr ?? urgent[0].rule_id) : 'NO OPEN EMERGENCY.'}
      </span>
      <span className="dz-rule" style={box(183, 130, 420, 4)} />
      <span className="dz-crew__label" style={box(183, 137, 150, 64)}>
        OVERALL
        <br />
        HEALTH:
      </span>
      <span className="dz-abs" style={box(380, 139, 58, 58)}>
        <Ring
          pct={pct}
          level={overall.level}
          size={58}
          stroke={7}
          label={d.crewRules.length ? `${normal} of ${d.crewRules.length} rules normal. Overall: ${overall.label}` : 'No evaluated rules'}
        />
      </span>
      <span className="dz-crew__list" style={box(448, 147, 150, 44)}>
        <span>
          ›Physiologic <b className={physio ? `t-${physio.health_attention.toLowerCase()}` : undefined}>{physio ? attentionMeta(physio.health_attention).label : '—'}</b>
        </span>
        <span>
          ›Blood <b>{blood}</b>
        </span>
      </span>
      <span className="dz-crew__resume" style={box(183, 201, 412, 36)}>
        Health summary: <b className={`t-${overall.level.toLowerCase()}`}>{data ? upperTr(overall.label) : '…'}</b>
        {data ? ` — ${overall.description}` : ''}
      </span>
      <span className="dz-rule" style={box(183, 239, 420, 4)} />
    </button>
  );
}

/* ======================================================= room conditions */

const ROOM_COLS: { key: string; metric: string | null; label: ReactNode; unit: string; icon: IconName; w: number }[] = [
  { key: 'p', metric: 'CABIN_PRESSURE', label: 'CABIN_PRESSURE', unit: 'kPa', icon: 'gauge', w: 219 },
  { key: 'o2', metric: 'CABIN_O2_FRACTION', label: 'CABIN_O2_FRACTION', unit: '%', icon: 'circle', w: 209 },
  {
    key: 'co2',
    metric: 'CABIN_CO2_PARTIAL_PRESSURE',
    label: (
      <>
        CABIN_CO2_
        <br />
        PARTIAL_PRESSURE
      </>
    ),
    unit: 'mmHg',
    icon: 'wind',
    w: 217,
  },
  { key: 'rad', metric: 'RADIATION_DOSE_RATE', label: 'RAD_DOSE_RATE', unit: 'µSv/h', icon: 'radiation', w: 203 },
  { key: 't', metric: null, label: 'CABIN_TEMP', unit: '°C', icon: 'thermometer', w: 202 },
  { key: 'h', metric: null, label: 'HUMIDITY', unit: '%', icon: 'droplet', w: 196 },
];

function sourceLine(top: RuleStatus | null, own: boolean): { text: string; demo: boolean } | null {
  if (!top) return null;
  const thr = own && Number.isFinite(top.threshold) ? `${cmpSymbol(top.comparison)}${fmtAuto(top.threshold)}` : 'related rule';
  if (top.validation_status === 'APPROVED') return { text: `${(top.source || 'KAYNAKLI').split(/[ ,(]/)[0]} // ${thr} ${own ? 'OK' : ''}`.trim(), demo: false };
  if (top.validation_status?.startsWith('DEMO')) return { text: `DEMO THRESHOLD // ${thr}`, demo: true };
  return { text: thr, demo: false };
}

function RoomCol({
  col,
  def,
  rules,
  x,
  onOpenMetric,
  scenarioId,
}: {
  col: (typeof ROOM_COLS)[number];
  def: MetricDef | null;
  rules: RuleStatus[];
  x: number;
  onOpenMetric: (m: string) => void;
  scenarioId: string | null;
}) {
  const crewId = useApp((s) => s.crewId);
  const envId = useApp((s) => s.environmentTargetId);
  const target = def ? targetFor(def, crewId, envId) : null;
  const series = useSeries(def && target ? def : null, 2, 10_000);
  const last = lastPoint(series.data?.points);
  const top = def ? worst(rulesForMetric(rules, def.metric)) : null;
  const src = sourceLine(top, !!top && !!def && top.metric === def.metric);
  const unit = def ? displayUnit(def.unit) : col.unit;
  const measured = !!def;
  const thrSrc = ruleSource(top);
  const valueSrc = last ? measurementSource(scenarioId) : null;

  const body = (
    <>
      <span className="dz-room__label">{col.label}</span>
      <span className={`dz-room__value${!last ? ' is-empty' : ''}`}>{last ? fmtAuto(last.value) : '—'}</span>
      <span className="dz-room__unit">{unit}</span>
      <Bar level={measured ? top?.health_attention ?? null : null} text={measured ? undefined : 'NOT MEASURED'} className="dz-room__bar" />
      {/* line 1: threshold (as in the design's NASA line); line 2: provenance badges around the icon */}
      <span className={`dz-room__src${src?.demo ? ' is-demo' : ''}`}>{src ? (src.demo ? src.text.replace('DEMO THRESHOLD // ', 'THRESHOLD // ') : src.text) : '\u00a0'}</span>
      <span className="dz-room__prov">
        {thrSrc && (
          <SourceBadge
            kind={thrSrc.kind}
            size="xs"
            title={thrSrc.detail ? `${thrSrc.kind === 'DEMO' ? 'DEMO threshold' : 'Sourced threshold'} · ${thrSrc.detail}` : undefined}
          />
        )}
        <Icon name={col.icon} size={thrSrc || valueSrc ? 28 : 40} className="dz-room__icon" />
        {valueSrc && <SourceBadge kind={valueSrc} size="xs" />}
      </span>
    </>
  );
  const style = box(x, 49, col.w, 281);
  return measured && def ? (
    <button
      type="button"
      className="dz-room__col"
      data-tour={`metric-${def.metric}`}
      style={style}
      onClick={() => onOpenMetric(def.metric)}
      title={last ? `${def.label} · ${fmtClock(last.observed_at)} (${relTime(last.observed_at)})` : def.label}
    >
      {body}
    </button>
  ) : (
    <div className="dz-room__col is-unmeasured" style={style} title="This value is not measured by the system">
      {body}
    </div>
  );
}

function RoomPanel({ rules, onOpenMetric, scenarioId }: { rules: RuleStatus[]; onOpenMetric: (m: string) => void; scenarioId: string | null }) {
  const metrics = useMetrics();
  let x = 0;
  return (
    <section className="dz-card" style={box(652, 13, 1246, 337)} aria-label="Cabin environment" data-tour="cabin">
      <h2 className="dz-strip dz-strip--lg">ROOM CONDITIONS</h2>
      {ROOM_COLS.map((col, i) => {
        const cx = x;
        x += col.w;
        return (
          <span key={col.key}>
            {i > 0 && <span className="dz-vsep" style={box(cx - 2, 49, 4, 268)} />}
            <RoomCol
              col={col}
              def={col.metric ? metrics.find((m) => m.metric === col.metric) ?? null : null}
              rules={rules}
              x={cx}
              onOpenMetric={onOpenMetric}
              scenarioId={scenarioId}
            />
          </span>
        );
      })}
    </section>
  );
}

/* ============================================================ crew window */

function CrewWindow({ crewId, onPerson }: { crewId: string; onPerson: () => void }) {
  const d = useCrewData(crewId);
  const data = d.status.data;
  const overall = data?.overall_attention ?? 'UNKNOWN';
  const normal = d.crewRules.filter((r) => r.health_attention === 'NORMAL').length;
  const envNormal = d.envRules.filter((r) => r.health_attention === 'NORMAL').length;
  const envWorst = worst(d.envRules)?.health_attention ?? 'UNKNOWN';
  const labLevel = !d.labRes.length ? 'UNKNOWN' : d.inRange === d.labRes.length ? 'NORMAL' : 'WATCH';
  const rows = [
    {
      title: (
        <>
          INDIVIDUAL
          <br />
          OVERALL
          <br />
          STATUS
        </>
      ),
      pct: pctOf(normal, d.crewRules.length),
      level: overall,
      ringLevel: overall as string | null,
      caption: d.crewRules.length ? `${normal}/${d.crewRules.length} rules normal · ${attentionMeta(overall).label}` : 'no evaluated rules',
    },
    {
      title: (
        <>
          INDIVIDUAL BLOOD
          <br />
          VALUES
          <br />
          OVERALL
          <br />
          STATUS
        </>
      ),
      pct: pctOf(d.inRange, d.labRes.length),
      level: labLevel,
      // Labs are informational (no rule): the share alone colours the ring.
      ringLevel: null as string | null,
      caption: d.labRes.length ? `${d.inRange}/${d.labRes.length} lab results in range (for information only)` : 'no lab results',
    },
    {
      title: (
        <>
          ENVIRONMENT
          <br />
          VALUES
          <br />
          OVERALL
          <br />
          STATUS
        </>
      ),
      pct: pctOf(envNormal, d.envRules.length),
      level: envWorst,
      ringLevel: envWorst as string | null,
      caption: d.envRules.length ? `${envNormal}/${d.envRules.length} environment rules normal · ${attentionMeta(envWorst).label}` : 'no environment rules',
    },
  ];
  const tops = [0, 260, 519];
  const heights = [259, 258, 261];
  return (
    <div className="dz-window" style={box(823, 18, 744, 780)} role="dialog" aria-modal="true" aria-label={`${crewId} summary`}>
      {/* body slot is drawn outside the scaled stage (see MissionScreens) */}
      <button type="button" className="dz-window__body" style={box(0, 0, 380, 780)} onClick={onPerson} aria-label={`${crewId}: open person details`} />
      {rows.map((r, i) => (
        <span key={i}>
          <button type="button" className="dz-window__label" style={box(380, tops[i], 147, heights[i])} onClick={onPerson}>
            {r.title}
          </button>
          <span className="dz-window__ring" style={box(527, tops[i], 217, heights[i])}>
            <Ring pct={r.pct} level={r.ringLevel} size={150} stroke={14} label={r.caption} />
            <span className="dz-window__caption">{r.caption}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

/* ============================================================ person screen */

const PERSON_COLS: { metric: string; title: string; w: number; icon: IconName }[] = [
  { metric: 'HEART_RATE', title: 'HEART RATE', w: 176, icon: 'heart' },
  { metric: 'SPO2', title: 'SPO2', w: 165, icon: 'droplet' },
  { metric: 'RESPIRATION_RATE', title: 'RESPIRATION RATE', w: 166, icon: 'lungs' },
  { metric: 'BODY_TEMPERATURE', title: 'BODY TEMPERATURE', w: 163, icon: 'thermometer' },
  { metric: 'SYSTOLIC_BP', title: 'BLOOD PRESSURE', w: 166, icon: 'gauge' },
  { metric: 'SLEEP_DURATION', title: 'SLEEP DURATION', w: 155, icon: 'moon' },
];

const ACTIVITY_TR: Record<string, string> = { REST: 'REST', LIGHT: 'LIGHT', EXERCISE: 'EXERCISE', SLEEP: 'SLEEP' };

function PersonCol({
  col,
  x,
  defs,
  rules,
  onOpenMetric,
  scenarioId,
}: {
  col: (typeof PERSON_COLS)[number];
  x: number;
  defs: MetricDef[];
  rules: RuleStatus[];
  onOpenMetric: (m: string) => void;
  scenarioId: string | null;
}) {
  const def = defs.find((d) => d.metric === col.metric) ?? null;
  const dia = col.metric === 'SYSTOLIC_BP' ? defs.find((d) => d.metric === 'DIASTOLIC_BP') ?? null : null;
  const s1 = useSeries(def, 2, 10_000);
  const s2 = useSeries(dia, 2, 10_000);
  const last = lastPoint(s1.data?.points);
  const last2 = lastPoint(s2.data?.points);
  const top = def ? worst([...rulesForMetric(rules, def.metric), ...(dia ? rulesForMetric(rules, dia.metric) : [])]) : null;
  const value = last ? (dia ? `${fmtAuto(last.value)}/${last2 ? fmtAuto(last2.value) : '—'}` : fmtAuto(last.value)) : '—';
  const unit = def ? (col.metric === 'RESPIRATION_RATE' ? 'nefes/dk' : col.metric === 'SLEEP_DURATION' ? 'saat' : displayUnit(def.unit)) : '';
  const demo = !!top?.validation_status?.startsWith('DEMO');
  let caption = '';
  if (col.metric === 'HEART_RATE') caption = `SENSOR Q: ${last ? (last.reported_quality === 'VALID' ? 'OK' : last.reported_quality) : '—'}`;
  else if (col.metric === 'SPO2') caption = `QUALITY: ${top ? (top.data_quality === 'VALID' ? 'OK' : top.data_quality) : '—'}`;
  else if (col.metric === 'RESPIRATION_RATE') caption = `ACTIVITY: ${last?.activity_state ? ACTIVITY_TR[last.activity_state] ?? last.activity_state : '—'}`;
  else if (col.metric === 'BODY_TEMPERATURE') {
    const trend = rules.find((r) => r.rule_id === 'VITAL_TEMP_TREND_V1');
    caption = `TREND: ${trend ? upperTr(attentionMeta(trend.health_attention).label) : '—'}`;
  } else if (col.metric === 'SYSTOLIC_BP') caption = last ? `SYS ${fmtAuto(last.value)} / DIA ${last2 ? fmtAuto(last2.value) : '—'}` : 'NO DATA';
  else if (col.metric === 'SLEEP_DURATION') caption = last ? 'DAILY RECORD' : 'NO RECORD';

  return (
    <button
      type="button"
      className="dz-pcol"
      style={box(x, 50, col.w, 204)}
      onClick={() => def && onOpenMetric(def.metric)}
      title={last ? `${def?.label} · ${fmtClock(last.observed_at)} (${relTime(last.observed_at)})${demo ? ' · DEMO threshold' : ''}` : def?.label}
    >
      <span className="dz-pcol__title">{col.title}</span>
      <span className={`dz-pcol__value${!last ? ' is-empty' : ''}`} style={value.length > 6 ? { fontSize: 46 } : undefined}>
        {value}
      </span>
      <span className="dz-pcol__unit">{unit}</span>
      <Bar level={top?.health_attention ?? null} className="dz-pcol__bar" />
      <span className="dz-pcol__demo">
        {ruleSource(top) && <SourceBadge kind={ruleSource(top)!.kind} size="xs" />}
        {last && measurementSource(scenarioId) && <SourceBadge kind={measurementSource(scenarioId)!} size="xs" />}
      </span>
      <span className="dz-pcol__cap">
        <Icon name={col.icon} size={22} />
        <span>{caption}</span>
      </span>
    </button>
  );
}

const BODY_ROWS: { region: string; fallback: string }[] = [
  { region: 'eyes', fallback: 'Eyes' },
  { region: 'inner_ear', fallback: 'Balance' },
  { region: 'head', fallback: 'Head/Sleep' },
  { region: 'heart', fallback: 'Kalp' },
  { region: 'lungs', fallback: 'Lungs' },
  { region: 'torso', fallback: 'Torso/Stomach' },
  { region: 'musculoskeletal', fallback: 'Muscle/Bones' },
  { region: 'skin', fallback: 'Skin and body temperature' },
];

interface BodyMapLite {
  regions: { region: string; label_tr: string; attention: string; description_tr: string; rules: { title: string; health_attention: string }[] }[];
}

function PersonScreen({
  crewId,
  alerts,
  onOpen,
  onOpenMetric,
  scenarioId,
}: {
  crewId: string;
  alerts: AlertRead[];
  onOpen: (tab: DetailTab) => void;
  onOpenMetric: (m: string) => void;
  scenarioId: string | null;
}) {
  const missionId = useApp((s) => s.missionId);
  const envId = useApp((s) => s.environmentTargetId);
  const setActiveAlert = useVitalsUi((s) => s.setActiveAlert);
  const now = useNow(30_000);
  const d = useCrewData(crewId);
  const metrics = useMetrics();
  const bodyMap = usePolling<BodyMapLite>(
    missionId ? `/v1/crew/${encodeURIComponent(crewId)}/body-map${qs({ mission_id: missionId, environment_target_id: envId })}` : null,
    15_000,
  );
  const rules = d.status.data?.rules ?? [];
  const mine = alerts.filter((a) => a.target_id === crewId && a.status !== 'RESOLVED');
  const urgent = mine
    .filter((a) => a.health_attention === 'ALERT' || a.health_attention === 'CRITICAL')
    .sort((a, b) => attentionMeta(b.health_attention).rank - attentionMeta(a.health_attention).rank);
  const watch = mine.filter((a) => a.health_attention === 'WATCH');
  const warnList = urgent.length ? urgent : watch;

  const ci = d.status.data?.latest_check_in ?? null;
  const symptoms = ci
    ? Object.entries(ci)
        .filter(([k, v]) => k in SYMPTOM_TR && typeof v === 'number' && v > 0)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
    : [];
  const redFlags = mine.filter((a) => a.rule_id.startsWith('RED_FLAG'));
  const labLevel = !d.labRes.length ? null : d.inRange === d.labRes.length ? 'NORMAL' : 'WATCH';
  const vitalsDefs = metrics.filter((m) => m.category !== 'environment');
  let x = 0;

  return (
    <>
      {/* warnings: red only when an ALERT/CRITICAL alert is open */}
      <section className={`dz-card dz-warn${urgent.length ? ' is-red' : ''}`} style={box(16, 20, 692, 513)} aria-label="Warnings">
        <h2 className="dz-strip">WARNINGS FOR PERSON</h2>
        <ul className="dz-warn__list">
          {warnList.length === 0 && <li className="dz-warn__none">›NO OPEN WARNING FOR THIS CREW MEMBER.</li>}
          {warnList.slice(0, 2).map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveAlert(a.id);
                  onOpen('rules');
                }}
              >
                <span className="dz-warn__mark">{i === 0 ? '!' : '›'}</span>
                {upperTr(a.action_card?.title_tr ?? a.rule_id)}
                {a.action_card?.reason_tr ? ` — ${upperTr(a.action_card.reason_tr)}` : ''}
              </button>
            </li>
          ))}
        </ul>
        {warnList.length > 2 && <p className="dz-warn__more">+{warnList.length - 2} MORE WARNINGS · CLICK FOR DETAILS</p>}
      </section>

      <section className="dz-card" style={box(16, 549, 692, 517)} aria-label="Body parameters">
        <h2 className="dz-strip">BODY PARAMETERS</h2>
        <ul className="dz-params">
          {BODY_ROWS.map((row) => {
            const reg = bodyMap.data?.regions.find((r) => r.region === row.region);
            const level = reg?.attention ?? 'UNKNOWN';
            const firstRule = reg?.rules.find((r) => r.health_attention === level) ?? reg?.rules[0];
            return (
              <li key={row.region}>
                <span className="dz-params__line">
                  <span>›{reg?.label_tr ?? row.fallback}:</span>
                  <span className="dz-params__dots" aria-hidden="true" />
                  <b className={`t-${level.toLowerCase()}`}>{upperTr(attentionMeta(level).label)}</b>
                </span>
                <span className="dz-params__sub">{firstRule ? firstRule.title : reg ? 'No rule for this region' : '…'}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="dz-card" style={box(736, 20, 1154, 262)} aria-label="Person general data" data-tour="vitals">
        <h2 className="dz-strip">GENERAL DATAS OF PERSON</h2>
        {PERSON_COLS.map((col, i) => {
          const cx = x;
          x += col.w;
          return (
            <span key={col.metric}>
              {i > 0 && <span className="dz-vsep dz-vsep--thin" style={box(cx - 1, 58, 3, 188)} />}
              <PersonCol col={col} x={cx} defs={vitalsDefs} rules={rules} onOpenMetric={onOpenMetric} scenarioId={scenarioId} />
            </span>
          );
        })}
        <span className="dz-vsep dz-vsep--thin" style={box(x - 1, 58, 3, 188)} />
        <button type="button" className="dz-pcol dz-pcol--blood" style={box(x, 50, 1154 - x, 204)} onClick={() => onOpen('inputs')}>
          <span className="dz-pcol__title">BLOOD PARAMETERS</span>
          <span className="dz-pcol__ringwrap">
            <Ring
              pct={pctOf(d.inRange, d.labRes.length)}
              size={82}
              stroke={9}
              label={d.labRes.length ? `${d.inRange}/${d.labRes.length} lab results in range` : 'No lab results'}
            />
          </span>
          <Bar
            level={labLevel}
            text={!d.labRes.length ? 'NO LAB' : d.inRange === d.labRes.length ? 'IN RANGE' : `${d.labRes.length - d.inRange} OUT OF RANGE`}
            className="dz-pcol__bar"
          />
          <span className="dz-pcol__fine">CLICK THE BAR ABOVE FOR DETAILS</span>
        </button>
      </section>

      {/* forced exception: the recorded ECG sits in the free band between the data and the body */}
      <section className="dz-ecg" style={box(736, 290, 1154, 124)} aria-label="Recorded sample ECG" data-tour="ecg">
        <EcgStrip compact height={48} />
      </section>

      <section className="dz-card dz-bodypanel" style={box(736, 420, 404, 646)} aria-label="Body model" />

      <section className="dz-card" style={box(1168, 420, 722, 646)} aria-label="Person subjective data">
        <h2 className="dz-strip">SUBJECTIVE DATAS OF PERSON</h2>
        <ul className="dz-subj">
          {redFlags.map((a) => (
            <li key={a.id} className="t-critical">
              ›Red flag: {a.explanation ?? a.action_card?.title_tr ?? a.rule_id}
            </li>
          ))}
          {ci ? (
            symptoms.length ? (
              symptoms.map(([k, v]) => (
                <li key={k}>
                  ›{SYMPTOM_TR[k]}: {v as number}/4 ({SEVERITY[v as number]})
                </li>
              ))
            ) : (
              <li>›No symptoms in the last subjective entry.</li>
            )
          ) : (
            <li>›No subjective entry.</li>
          )}
          {ci && <li className="dz-subj__time">›Last entry {fmtClock(ci.observed_at)} · {relTime(ci.observed_at, now)}</li>}
        </ul>
        <button type="button" className="dz-subj__msg" style={box(16, 583, 690, 47)} onClick={() => onOpen('inputs')}>
          <span>Enter a subjective entry…</span>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3z" />
            <path d="m10 13 4.5-4.5" />
          </svg>
        </button>
      </section>
    </>
  );
}

/* ================================================================= stage */

function useFit(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: W / 2, h: H / 2 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function MissionScreens({ scenarioId, crewIds = [], onOpen }: MissionScreensProps) {
  const fitRef = useRef<HTMLDivElement>(null);
  const size = useFit(fitRef);
  // `?ekran=pencere|kisi` opens a screen directly (demos, screenshots).
  const [screen, setScreen] = useState<Screen>(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('ekran');
      return q === 'kisi' ? 'person' : q === 'pencere' ? 'crew' : 'overview';
    } catch {
      return 'overview';
    }
  });
  const navH = screen === 'person' ? 32 : 0;
  const s = Math.max(0.2, Math.min(size.w / W, (size.h - navH) / H));
  const ox = (size.w - W * s) / 2;
  const crewId = useApp((st) => st.crewId);
  const setSelection = useApp((st) => st.setSelection);
  const status = useCrewStatus();
  const alerts = useAlerts();
  const select = useVitalsUi((st) => st.select);
  const rules = status.data?.rules ?? [];
  const openMetric = useCallback(
    (metric: string) => {
      select(metric);
      onOpen('rules');
    },
    [select, onOpen],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setScreen((sc) => (sc === 'person' ? 'crew' : 'overview'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openCrew = (id: string) => {
    setSelection({ crewId: id });
    setScreen('crew');
  };

  // 3D body: placed in real pixels over the scaled stage (canvas + picking stay sharp).
  const bodyRect = screen === 'crew' ? [823, 18, 380, 780] : screen === 'person' ? [736, 420, 404, 646] : null;

  return (
    <div className="dz-fit" ref={fitRef} data-screen={screen}>
      {screen === 'person' && crewId && (
        <nav className="dz-nav" aria-label="Ekran">
          <button type="button" onClick={() => setScreen('overview')}>
            ‹ OVERVIEW
          </button>
          <span>{upperTr(crewId)} · PERSON DETAIL</span>
          {scenarioId && <span className="dz-nav__demo">SYNTHETIC DATA · {scenarioId}</span>}
        </nav>
      )}
      <div className="dz-stage" style={{ transform: `translate(${ox}px, ${navH}px) scale(${s})` }} aria-hidden={screen === 'crew' ? true : undefined}>
        {screen === 'person' && crewId ? (
          <PersonScreen crewId={crewId} alerts={alerts.data ?? []} onOpen={onOpen} onOpenMetric={openMetric} scenarioId={scenarioId} />
        ) : (
          <div className={`dz-layer${screen === 'crew' ? ' is-blurred' : ''}`}>
            {crewIds.slice(0, 4).map((c, i) => (
              <CrewCard key={c} crewId={c} top={CARD_TOPS[i]} alerts={alerts.data ?? []} onClick={() => openCrew(c)} open={screen !== 'overview' && crewId === c} />
            ))}
            <RoomPanel rules={rules} onOpenMetric={openMetric} scenarioId={scenarioId} />
            <section className="dz-card dz-main" style={box(652, 364, 1246, 702)} aria-label="Ana panel" data-tour={screen === 'overview' ? 'scene' : undefined}>
              <MissionSpaceView active={screen === 'overview'} onOpenGround={() => onOpen('ground')} />
              {scenarioId && <span className="dz-main__demo">SYNTHETIC DATA · {scenarioId}</span>}
            </section>
          </div>
        )}
      </div>
      {screen === 'crew' && crewId && (
        <>
          <button type="button" className="dz-backdrop" aria-label="Pencereyi kapat" onClick={() => setScreen('overview')} />
          <div className="dz-stage dz-stage--top" style={{ transform: `translateX(${ox}px) scale(${s})` }}>
            <CrewWindow crewId={crewId} onPerson={() => setScreen('person')} />
          </div>
        </>
      )}
      {bodyRect && crewId && (
        <div
          className={`dz-body${screen === 'crew' ? ' is-still' : ''}`}
          data-tour="scene"
          data-open="true"
          style={{ left: ox + bodyRect[0] * s, top: navH + bodyRect[1] * s, width: bodyRect[2] * s, height: bodyRect[3] * s }}
          onClick={screen === 'crew' ? () => setScreen('person') : undefined}
        >
          <BodyMapPanel key={`${crewId}-${screen}`} bare interactive={screen === 'person'} />
        </div>
      )}
    </div>
  );
}
