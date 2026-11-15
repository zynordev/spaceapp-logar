// 5. Red flag: serious symptoms that open a CRITICAL alert immediately.
import { useState } from 'react';
import { api, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Icon } from '../../ui';
import { InlineMsg, NeedSelection, Notice, SOURCE_ID, Section, useAction } from './shared';
import type { RedFlagAccepted, RedFlagOption } from './types';

export function RedFlagsSection() {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const catalog = usePolling<RedFlagOption[]>('/v1/red-flags/catalog', 600000);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const { busy, msg, setMsg, run } = useAction();

  const toggle = (flag: string) => {
    setConfirming(false);
    setMsg(null);
    setSelected((s) => (s.includes(flag) ? s.filter((x) => x !== flag) : [...s, flag]));
  };

  const labelOf = (flag: string) => catalog.data?.find((c) => c.flag === flag)?.label ?? flag;

  const send = async () => {
    if (!missionId || !crewId || !selected.length) return;
    setExplanation(null);
    const r = await run(
      () => api<RedFlagAccepted>('POST', '/v1/red-flags', {
        mission_id: missionId,
        crew_member_id: crewId,
        flags: selected,
        observed_at: new Date().toISOString(),
        source_type: 'MANUAL',
        source_id: SOURCE_ID,
      }),
      (res) => ({
        kind: 'ok',
        text: res.alert_id
          ? 'Emergency reported: a CRITICAL alarm was opened. Carry out the action card and inform the crew health officer.'
          : 'Emergency reported (alarm already open). Carry out the action card and inform the crew health officer.',
      }),
      'could not be reported. Inform the team verbally',
    );
    setConfirming(false);
    if (r) {
      setSelected([]);
      setExplanation(r.evaluation?.explanation ?? null);
    }
  };

  return (
    <Section
      id="lgi-redflag"
      title="Red flag"
      hint="If any of these symptoms is present, select it and report. A report opens a CRITICAL alarm immediately: no averaging, time window or sensor confirmation is awaited. This is not a diagnosis."
      badge={<span className="lgi-chip lgi-chip--crit"><Icon name="warning" size={14} />{' '}Emergency</span>}
    >
      {!missionId || !crewId ? <NeedSelection /> : (
        <>
          {catalog.loading && !catalog.data && <p className="lgi-muted">Loading the symptom list…</p>}
          {catalog.error && !catalog.data && (
            <Notice kind="err">
              The symptom list could not be loaded ({catalog.error.message}). If there is an emergency, inform the team verbally.
            </Notice>
          )}
          {catalog.data && (
            <ul className="lgi-flags" aria-label="Red flag symptoms">
              {catalog.data.map((c) => {
                const on = selected.includes(c.flag);
                return (
                  <li key={c.flag}>
                    <button
                      type="button"
                      className={`lgi-flag${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggle(c.flag)}
                      disabled={busy}
                    >
                      <span className="lgi-flag__box" aria-hidden="true">{on ? <Icon name="check" size={20} /> : null}</span>
                      <span className="lgi-flag__label">{c.label}</span>
                      <span className="lgi-flag__state" aria-hidden="true">{on ? 'Selected' : 'Select'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!confirming ? (
            <div className="lgi-actions">
              <button
                type="button"
                className="lgi-btn lgi-btn--danger"
                disabled={!selected.length || busy}
                onClick={() => setConfirming(true)}
              >
                <Icon name="warning" size={14} />{' '}
                {selected.length ? `Report emergency (${selected.length} symptoms)` : 'Select a symptom first'}
              </button>
              {selected.length > 0 && (
                <button type="button" className="lgi-btn" onClick={() => setSelected([])} disabled={busy}>Clear selection</button>
              )}
            </div>
          ) : (
            <div className="lgi-confirm" role="alertdialog" aria-labelledby="lgi-rf-confirm-h" aria-describedby="lgi-rf-confirm-d">
              <strong id="lgi-rf-confirm-h">Are you sure? A CRITICAL alarm will open immediately.</strong>
              <div id="lgi-rf-confirm-d">
                To be reported: <ul>{selected.map((f) => <li key={f}>{labelOf(f)}</li>)}</ul>
              </div>
              <div className="lgi-actions">
                <button type="button" className="lgi-btn lgi-btn--danger" onClick={send} disabled={busy} aria-busy={busy} autoFocus>
                  {busy ? 'Reporting…' : 'Yes, report emergency'}
                </button>
                <button type="button" className="lgi-btn" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
          <InlineMsg msg={msg} />
          {explanation && <p className="lgi-explain">{explanation}</p>}
        </>
      )}
    </Section>
  );
}
