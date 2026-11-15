// 6. Demo scenario runner (top bar). Each run writes clearly labelled
// SYNTHETIC data into a brand-new mission, which is then selected.
import { useEffect, useId, useState } from 'react';
import { api, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Icon } from '../../ui';
import { InlineMsg, useAction } from './shared';
import type { DemoRunRead, DemoScenarioRead } from './types';

const TIME_SCALE: Record<string, string> = { acute: 'Akut', subacute: 'Alt akut' };

export function DemoScenarioPicker() {
  const uid = useId();
  const setSelection = useApp((s) => s.setSelection);
  const list = usePolling<DemoScenarioRead[]>('/v1/demo/scenarios', 600000);
  const [scenarioId, setScenarioId] = useState('');
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<DemoRunRead | null>(null);
  const { busy, msg, run } = useAction();

  const scenarios = list.data ?? [];
  useEffect(() => {
    if (!scenarioId && scenarios.length) setScenarioId(scenarios[0].scenario_id);
  }, [scenarioId, scenarios]);
  const current = scenarios.find((s) => s.scenario_id === scenarioId) ?? null;

  const start = async () => {
    if (!scenarioId) return;
    setResult(null);
    const r = await run(
      () => api<DemoRunRead>('POST', `/v1/demo/scenarios/${encodeURIComponent(scenarioId)}/run`, undefined, 120000),
      (res) => ({
        kind: 'ok',
        text: `Scenario ran: ${res.observations_posted} observations, ${res.check_ins_posted} subjective entries, ${res.lab_results_posted} lab results (SYNTHETIC). New mission selected: ${res.mission_id}.`,
      }),
      'the scenario could not run',
    );
    if (r) {
      setResult(r);
      setOpen(true);
      setSelection({ missionId: r.mission_id, crewId: r.crew_member_id, environmentTargetId: r.environment_target_id });
    }
  };

  const disabled = !scenarios.length || busy;

  return (
    <div className="lgi lgi-demo">
      <div className="lgi-demo__bar">
        <span className="lgi-chip lgi-chip--demo">DEMO</span>
        <label htmlFor={`${uid}-sel`} className="lgi-sr">Demo scenario</label>
        <select
          id={`${uid}-sel`}
          className="lgi-input lgi-demo__select"
          value={scenarioId}
          onChange={(e) => { setScenarioId(e.target.value); setResult(null); }}
          disabled={!scenarios.length || busy}
          title={current?.description}
        >
          {!scenarios.length && <option value="">{list.error ? 'Scenarios could not be loaded' : 'Loading…'}</option>}
          {scenarios.map((s) => <option key={s.scenario_id} value={s.scenario_id}>{s.title || s.scenario_id}</option>)}
        </select>
        <button type="button" className="lgi-btn lgi-btn--primary lgi-btn--small" onClick={start} disabled={disabled} aria-busy={busy}>
          <Icon name="play" size={14} />{' '}{busy ? 'Running…' : 'Run'}
        </button>
        <button
          type="button"
          className="lgi-btn lgi-btn--small lgi-btn--ghost"
          aria-expanded={open}
          aria-controls={`${uid}-info`}
          onClick={() => setOpen((o) => !o)}
          disabled={!current}
        >
          {open ? 'Hide details' : 'Details'}
        </button>
      </div>
      {current && (
        <p className="lgi-demo__line">
          <span className="lgi-chip">{TIME_SCALE[current.time_scale] ?? current.time_scale}</span>{' '}
          <span className="lgi-muted">{current.duration_minutes} dk sentetik veri · </span>
          <span className="lgi-demo__desc">{current.description}</span>
        </p>
      )}
      <div id={`${uid}-info`} hidden={!open || !current} className="lgi-demo__info">
        {current && (
          <>
            <strong>Beklenen:</strong>
            <ul>{(result?.scenario_id === current.scenario_id ? result.summary : current.expected).map((t) => <li key={t}>{t}</li>)}</ul>
          </>
        )}
      </div>
      <InlineMsg msg={msg} />
    </div>
  );
}
