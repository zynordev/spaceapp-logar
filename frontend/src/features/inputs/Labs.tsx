// 4. Laboratuvar: manual entry of a periodic lab value (POST /v1/lab-results),
// latest value per analyte, and the real OSDR (Inspiration4) import.
// The reference range is copied from the lab report: the software never
// invents thresholds and adds no interpretation beyond the backend's text.
import { useState, type FormEvent } from 'react';
import { api, qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Icon, SourceBadge, labSource, type IconName } from '../../ui';
import { Segmented } from './Segmented';
import {
  InlineMsg, NeedSelection, Notice, SOURCE_ID, Section, fmtDateTime, fmtNum, localInputValue, useAction,
} from './shared';
import type {
  LabAnalyte, LabAnalyteSummary, LabPanelRead, LabResultReadLite, LabUnit, OsdrImportRead, SamplePhase,
} from './types';

export const LAB_LABELS: Record<LabAnalyte, string> = {
  GLUCOSE: 'Glucose', SODIUM: 'Sodium', POTASSIUM: 'Potassium', CREATININE: 'Creatinine',
  WBC: 'White blood cells', HEMOGLOBIN: 'Hemoglobin', PLATELETS: 'Platelets', ALT: 'ALT', AST: 'AST',
};
const ANALYTES = Object.keys(LAB_LABELS) as LabAnalyte[];

// Mirrors ALLOWED_UNITS in src/spaceapp_logar/schemas/lab_results.py.
export const ALLOWED_UNITS: Record<LabAnalyte, LabUnit[]> = {
  GLUCOSE: ['mg/dL', 'mmol/L'],
  SODIUM: ['mmol/L', 'mEq/L'],
  POTASSIUM: ['mmol/L', 'mEq/L'],
  CREATININE: ['mg/dL', 'umol/L'],
  WBC: ['10^3/uL', '10^9/L'],
  HEMOGLOBIN: ['g/dL', 'g/L'],
  PLATELETS: ['10^3/uL', '10^9/L'],
  ALT: ['U/L'],
  AST: ['U/L'],
};
const UNIT_DISPLAY: Record<string, string> = {
  'umol/L': 'µmol/L', '10^3/uL': '10³/µL', '10^9/L': '10⁹/L',
};
export const unitText = (u: string | null | undefined) => (u ? UNIT_DISPLAY[u] ?? u : '');

const PHASE: Record<SamplePhase, string> = {
  PRE_FLIGHT: 'Pre-flight', IN_FLIGHT: 'In flight', POST_FLIGHT: 'Post-flight',
};
const POSITION: Record<'BELOW' | 'WITHIN' | 'ABOVE', { label: string; icon: IconName }> = {
  BELOW: { label: 'Below reference', icon: 'arrow-down' },
  WITHIN: { label: 'Within reference range', icon: 'dot' },
  ABOVE: { label: 'Above reference', icon: 'arrow-up' },
};

/** Parse "5,4" or "5.4"; returns null for empty/invalid. */
function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function LabsSection() {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const setSelection = useApp((s) => s.setSelection);
  const [analyte, setAnalyte] = useState<LabAnalyte>('GLUCOSE');
  const [unit, setUnit] = useState<LabUnit>('mg/dL');
  const [value, setValue] = useState('');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [phase, setPhase] = useState<SamplePhase>('IN_FLIGHT');
  const [sampledAt, setSampledAt] = useState(() => localInputValue(new Date()));
  const [localErr, setLocalErr] = useState<string[]>([]);
  const entry = useAction();
  const osdr = useAction();

  const panelPath = missionId && crewId
    ? `/v1/crew/${encodeURIComponent(crewId)}/lab-results${qs({ mission_id: missionId })}`
    : null;
  const panel = usePolling<LabPanelRead>(panelPath, 60000);

  const chooseAnalyte = (a: LabAnalyte) => {
    setAnalyte(a);
    if (!ALLOWED_UNITS[a].includes(unit)) setUnit(ALLOWED_UNITS[a][0]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!missionId || !crewId) return;
    const v = parseNum(value);
    const lo = parseNum(low);
    const hi = parseNum(high);
    const sampled = new Date(sampledAt);
    const errs: string[] = [];
    if (v === null || v < 0) errs.push('Value: enter a number of 0 or more.');
    if (lo === null || lo < 0) errs.push('Reference lower limit: enter the value from the report.');
    if (hi === null || hi < 0) errs.push('Reference upper limit: enter the value from the report.');
    if (lo !== null && hi !== null && lo > hi) errs.push('The reference lower limit cannot be greater than the upper limit.');
    if (!sampledAt || Number.isNaN(sampled.getTime())) errs.push('Sample time: select a valid date and time.');
    setLocalErr(errs);
    if (errs.length) return;
    const r = await entry.run(
      () => api<LabResultReadLite>('POST', '/v1/lab-results', {
        mission_id: missionId,
        crew_member_id: crewId,
        analyte,
        value: v,
        unit,
        reference_low: lo,
        reference_high: hi,
        phase,
        sampled_at: sampled.toISOString(),
        source_type: 'MANUAL',
        source_id: SOURCE_ID,
      }),
      (res) => ({ kind: 'ok', text: `${LAB_LABELS[res.analyte] ?? res.analyte} saved: ${fmtNum(res.value)} ${unitText(res.unit)} (${fmtDateTime(res.sampled_at)}).` }),
      'could not be saved',
    );
    if (r) setValue('');
  };

  const importOsdr = async () => {
    const r = await osdr.run(
      () => api<OsdrImportRead>('POST', '/v1/demo/osdr-labs/import', undefined, 60000),
      (res) => ({
        kind: 'ok',
        text: `Real OSDR data: ${res.imported} new, ${res.skipped_existing} already present, ${res.skipped_unusable} unusable. Mission ${res.mission_id} selected.`,
      }),
      'OSDR data could not be loaded',
    );
    if (r?.mission_id) {
      setSelection({ missionId: r.mission_id, crewId: r.crew_member_ids[0] ?? null, environmentTargetId: null });
    }
  };

  const results = panel.data?.results ?? [];
  const order = ANALYTES.filter((a) => results.some((r) => r.analyte === a));

  return (
    <Section
      id="lgi-labs"
      title="Laboratory"
      hint="Enter the periodic lab value from the report. Copy the reference range from the report too; the software does not set thresholds."
    >
      <div className="lgi-actions lgi-actions--top">
        <button type="button" className="lgi-btn" onClick={importOsdr} disabled={osdr.busy} aria-busy={osdr.busy}>
          <Icon name="download" size={14} />{' '}{osdr.busy ? 'Loading…' : 'Real OSDR lab data (Inspiration4)'}
        </button>
        <span className="lgi-muted">Loads real values from NASA OSDR into a separate mission and selects it.</span>
      </div>
      <InlineMsg msg={osdr.msg} />

      {!missionId || !crewId ? <NeedSelection /> : (
        <>
          <form className="lgi-form" onSubmit={submit} noValidate>
            <div className="lgi-field">
              <label htmlFor="lgi-lab-analyte">Test</label>
              <select
                id="lgi-lab-analyte"
                className="lgi-input"
                value={analyte}
                onChange={(e) => chooseAnalyte(e.target.value as LabAnalyte)}
              >
                {ANALYTES.map((a) => <option key={a} value={a}>{LAB_LABELS[a]}</option>)}
              </select>
            </div>
            <div className="lgi-field-row">
              <div className="lgi-field">
                <label htmlFor="lgi-lab-value">Value</label>
                <input
                  id="lgi-lab-value"
                  className="lgi-input lgi-input--big"
                  inputMode="decimal"
                  autoComplete="off"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 92"
                  aria-describedby="lgi-lab-unit-legend"
                />
              </div>
              <Segmented<LabUnit>
                name="lgi-lab-unit"
                legend={<span id="lgi-lab-unit-legend">Unit</span>}
                value={unit}
                onChange={setUnit}
                compact
                options={ALLOWED_UNITS[analyte].map((u) => ({ value: u, label: unitText(u), aria: unitText(u) }))}
              />
            </div>
            <fieldset className="lgi-fieldset">
              <legend>Reference range from the report ({unitText(unit)})</legend>
              <div className="lgi-field-row">
                <div className="lgi-field">
                  <label htmlFor="lgi-lab-low">Lower limit</label>
                  <input id="lgi-lab-low" className="lgi-input" inputMode="decimal" autoComplete="off" value={low} onChange={(e) => setLow(e.target.value)} />
                </div>
                <div className="lgi-field">
                  <label htmlFor="lgi-lab-high">Upper limit</label>
                  <input id="lgi-lab-high" className="lgi-input" inputMode="decimal" autoComplete="off" value={high} onChange={(e) => setHigh(e.target.value)} />
                </div>
              </div>
            </fieldset>
            <Segmented<SamplePhase>
              name="lgi-lab-phase"
              legend="Phase"
              value={phase}
              onChange={setPhase}
              compact
              options={(Object.keys(PHASE) as SamplePhase[]).map((p) => ({ value: p, label: PHASE[p] }))}
            />
            <div className="lgi-field lgi-field--inline">
              <label htmlFor="lgi-lab-at">Sample time</label>
              <input id="lgi-lab-at" className="lgi-input" type="datetime-local" value={sampledAt} onChange={(e) => setSampledAt(e.target.value)} />
              <button type="button" className="lgi-btn lgi-btn--small" onClick={() => setSampledAt(localInputValue(new Date()))}>Now</button>
            </div>
            {localErr.length > 0 && (
              <div className="lgi-msg lgi-msg--err" role="alert">
                <span className="lgi-msg__icon" aria-hidden="true"><Icon name="warning" size={18} /></span>
                <ul className="lgi-msg__fields">{localErr.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
            <div className="lgi-actions">
              <button type="submit" className="lgi-btn lgi-btn--primary" disabled={entry.busy} aria-busy={entry.busy}>
                {entry.busy ? 'Saving…' : 'Save lab result'}
              </button>
            </div>
            <InlineMsg msg={entry.msg} />
          </form>

          <h4 className="lgi-subhead">Recent results</h4>
          {panel.loading && !panel.data && <p className="lgi-muted">Loading…</p>}
          {panel.error && !panel.data && <Notice kind="err">Lab results could not be loaded ({panel.error.message}).</Notice>}
          {panel.data && order.length === 0 && <p className="lgi-muted">No lab results for this crew member.</p>}
          {order.length > 0 && (
            <ul className="lgi-labgrid">
              {order.map((a) => {
                const r = results.find((x) => x.analyte === a)!;
                return <LabCard key={a} r={r} />;
              })}
            </ul>
          )}
          {panel.data && panel.data.limitations.length > 0 && (
            <ul className="lgi-limits" aria-label="Limitations">
              {panel.data.limitations.map((t) => <li key={t}>{t}</li>)}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

function LabCard({ r }: { r: LabAnalyteSummary }) {
  const pos = POSITION[r.position_vs_reference];
  const src = labSource(r.source_type);
  const lo = r.reference_low;
  const hi = r.reference_high;
  const span = Math.max(hi - lo, 1e-9);
  const dmin = Math.min(lo, r.value) - span * 0.4;
  const dmax = Math.max(hi, r.value) + span * 0.4;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - dmin) / (dmax - dmin)) * 100));
  const u = unitText(r.unit);
  const signed = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${fmtNum(v)} ${u}`);
  return (
    <li className={`lgi-lab lgi-lab--${r.position_vs_reference.toLowerCase()}`}>
      <div className="lgi-lab__top">
        <strong>{LAB_LABELS[r.analyte] ?? r.analyte}</strong>
        {pos && <span className="lgi-pos"><Icon name={pos.icon} size={14} />{' '}{pos.label}</span>}
      </div>
      <div className="lgi-lab__value">{fmtNum(r.value)} <small>{u}</small></div>
      <div
        className="lgi-refbar"
        role="img"
        aria-label={`Value ${fmtNum(r.value)} ${u}, reference range ${fmtNum(lo)}–${fmtNum(hi)}; position: ${pos?.label ?? '—'}`}
      >
        <div className="lgi-refbar__band" style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />
        <div className="lgi-refbar__marker" style={{ left: `${pct(r.value)}%` }} />
      </div>
      <div className="lgi-muted">Referans: {fmtNum(lo)}–{fmtNum(hi)} {u}</div>
      <div className="lgi-muted">Vs. previous: {signed(r.change_from_previous)} · Vs. baseline: {signed(r.change_from_baseline)}</div>
      <div className="lgi-muted">
        {PHASE[r.phase] ?? r.phase} · {fmtDateTime(r.sampled_at)} · {r.source_id}{' '}
        {src ? <SourceBadge kind={src.kind} detail={src.detail} size="xs" /> : `(${r.source_type})`}
      </div>
    </li>
  );
}
