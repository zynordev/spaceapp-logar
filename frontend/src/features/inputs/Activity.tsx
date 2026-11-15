// 2. Aktivite beyanı (contract B): what the crew member is doing right now and
// for how long. Rest-only rules use only data declared as rest.
import { useEffect, useRef, useState } from 'react';
import { api, qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Icon, type IconName } from '../../ui';
import { mockActivity } from './mock';
import { Segmented } from './Segmented';
import {
  InlineMsg, MOCK, NeedSelection, Notice, SOURCE_ID, Section, fmtClock, fmtDateTime, toMs, useAction, useNow,
} from './shared';
import type { ActivityCurrentRead, ActivityRead, ActivityState } from './types';

export const ACTIVITY_LABELS: Record<ActivityState, { label: string; icon: IconName; sub: string }> = {
  EXERCISE: { label: 'Egzersiz', icon: 'run', sub: 'Antrenman' },
  LIGHT: { label: 'Light work', icon: 'wrench', sub: 'Tasks, maintenance' },
  REST: { label: 'Rest', icon: 'chair', sub: 'Awake, calm' },
  SLEEP: { label: 'Sleep', icon: 'moon', sub: 'Sleep period' },
};
const STATES: ActivityState[] = ['EXERCISE', 'LIGHT', 'REST', 'SLEEP'];
const PRESETS = [15, 30, 45, 60, 90];

function plannedMinutes(a: ActivityRead): number {
  const s = toMs(a.started_at);
  const e = toMs(a.expected_end_at);
  if (s === null || e === null) return 30;
  return Math.min(240, Math.max(5, Math.round((e - s) / 60000)));
}

export function ActivitySection() {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const now = useNow(1000);
  const [mockVer, setMockVer] = useState(0);
  const [pick, setPick] = useState<ActivityState>('REST');
  const [minutes, setMinutes] = useState<number>(30);
  const [custom, setCustom] = useState('');
  const { busy, msg, setMsg, run } = useAction();

  const ready = MOCK || (!!missionId && !!crewId);
  const path = !MOCK && missionId && crewId
    ? `/v1/activities/current${qs({ mission_id: missionId, crew_member_id: crewId })}`
    : null;
  const polled = usePolling<ActivityCurrentRead>(path, 15000);

  // Remember when the server answered so the countdown is skew-free.
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  useEffect(() => { if (polled.data) setReceivedAt(Date.now()); }, [polled.data]);

  void mockVer; // re-render trigger for mock mode
  const current: ActivityCurrentRead | null = MOCK ? mockActivity.current(now) : polled.data;
  const missing = !MOCK && polled.error?.notFound === true;

  let remaining: number | null = null;
  if (current?.state === 'ACTIVE') {
    if (MOCK || current.remaining_seconds === null) {
      const end = toMs(current.activity?.expected_end_at);
      remaining = end === null ? null : (end - now) / 1000;
    } else {
      remaining = current.remaining_seconds - (now - receivedAt) / 1000;
    }
  }
  const locallyExpired = current?.state === 'ACTIVE' && remaining !== null && remaining <= 0;

  // When the local countdown hits zero, ask the server for the new state.
  // Once per declaration (polled.reload is a fresh function each render).
  const reloadedFor = useRef<string | null>(null);
  const activityId = current?.activity?.id ?? null;
  useEffect(() => {
    if (!locallyExpired || MOCK || !activityId || reloadedFor.current === activityId) return;
    reloadedFor.current = activityId;
    const t = setTimeout(polled.reload, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locallyExpired, activityId]);

  const start = async (state: ActivityState, mins: number) => {
    if (MOCK) {
      mockActivity.start(state, mins);
      setMockVer((v) => v + 1);
      setMsg({ kind: 'ok', text: `${ACTIVITY_LABELS[state].label} started: ${mins} min (preview, not sent to the server).` });
      return;
    }
    if (!missionId || !crewId) return;
    await run(
      () => api<ActivityRead>('POST', '/v1/activities', {
        mission_id: missionId,
        crew_member_id: crewId,
        activity_state: state,
        planned_minutes: mins,
        source_type: 'MANUAL',
        source_id: SOURCE_ID,
      }),
      (r) => ({ kind: 'ok', text: `${ACTIVITY_LABELS[r.activity_state]?.label ?? r.activity_state} started; expected end ${fmtDateTime(r.expected_end_at)}.` }),
      'the activity could not be started',
    );
  };

  const end = async (a: ActivityRead) => {
    if (MOCK) {
      mockActivity.end();
      setMockVer((v) => v + 1);
      setMsg({ kind: 'ok', text: 'Activity ended (preview).' });
      return;
    }
    await run(
      () => api<ActivityRead>('POST', `/v1/activities/${encodeURIComponent(a.id)}/end`, {}),
      () => ({ kind: 'ok', text: 'Aktivite bitirildi.' }),
      'aktivite bitirilemedi',
    );
  };

  const customNum = Number(custom);
  const customValid = custom !== '' && Number.isInteger(customNum) && customNum >= 5 && customNum <= 240;
  const effectiveMinutes = custom !== '' ? (customValid ? customNum : null) : minutes;

  return (
    <Section
      id="lgi-activity"
      title="Aktivite"
      hint="Why it matters: rest rules use only data from periods declared as “rest”; a high heart rate during exercise does not raise a false alarm."
      badge={MOCK ? <span className="lgi-chip">Preview data</span> : null}
    >
      {!ready ? <NeedSelection /> : (
        <>
          {missing && (
            <Notice kind="warn">
              Activity declarations are not on the server yet. To preview the interface, add <code>?mock=1</code> to the address.
            </Notice>
          )}
          {!missing && (
            <CurrentActivity
              current={current}
              remaining={remaining}
              expired={current?.state === 'EXPIRED' || locallyExpired}
              loading={!MOCK && polled.loading && !polled.data}
              busy={busy}
              onEnd={end}
              onRestart={(a) => start(a.activity_state, plannedMinutes(a))}
            />
          )}

          <form
            className="lgi-form"
            onSubmit={(e) => { e.preventDefault(); if (effectiveMinutes !== null) start(pick, effectiveMinutes); }}
          >
            <Segmented<ActivityState>
              name="lgi-act-state"
              legend="What are you doing right now?"
              value={pick}
              onChange={setPick}
              options={STATES.map((s) => ({
                value: s,
                label: <><Icon name={ACTIVITY_LABELS[s].icon} size={14} />{' '}{ACTIVITY_LABELS[s].label}</>,
                aria: ACTIVITY_LABELS[s].label,
                sub: ACTIVITY_LABELS[s].sub,
              }))}
            />
            <Segmented<number>
              name="lgi-act-min"
              legend="Planned duration"
              value={custom !== '' ? null : minutes}
              onChange={(v) => { setMinutes(v); setCustom(''); }}
              compact
              options={PRESETS.map((m) => ({ value: m, label: `${m}`, sub: 'dk', aria: `${m} dakika` }))}
            />
            <div className="lgi-field lgi-field--inline">
              <label htmlFor="lgi-act-custom">Custom duration (5–240 min)</label>
              <input
                id="lgi-act-custom"
                className="lgi-input lgi-input--short"
                type="number"
                inputMode="numeric"
                min={5}
                max={240}
                step={1}
                value={custom}
                aria-invalid={custom !== '' && !customValid}
                aria-describedby="lgi-act-custom-help"
                onChange={(e) => setCustom(e.target.value)}
              />
              <span id="lgi-act-custom-help" className={custom !== '' && !customValid ? 'lgi-err-text' : 'lgi-muted'}>
                {custom !== '' && !customValid ? 'Enter a whole number between 5 and 240.' : 'If left empty, the selected preset duration is used.'}
              </span>
            </div>
            <div className="lgi-actions">
              <button
                type="submit"
                className="lgi-btn lgi-btn--primary"
                disabled={busy || missing || effectiveMinutes === null}
                aria-busy={busy}
              >
                {busy ? 'Sending…' : `Start: ${ACTIVITY_LABELS[pick].label}${effectiveMinutes ? `, ${effectiveMinutes} min` : ''}`}
              </button>
              {current?.activity && current.state !== 'NONE' && (
                <span className="lgi-muted">A new declaration automatically ends the open one.</span>
              )}
            </div>
            <InlineMsg msg={msg} />
          </form>
        </>
      )}
    </Section>
  );
}

function CurrentActivity({ current, remaining, expired, loading, busy, onEnd, onRestart }: {
  current: ActivityCurrentRead | null;
  remaining: number | null;
  expired: boolean;
  loading: boolean;
  busy: boolean;
  onEnd: (a: ActivityRead) => void;
  onRestart: (a: ActivityRead) => void;
}) {
  if (loading) return <p className="lgi-muted">Loading current activity…</p>;
  if (!current || current.state === 'NONE' || !current.activity) {
    return (
      <div className="lgi-activity lgi-activity--none">
        <span className="lgi-activity__icon" aria-hidden="true"><Icon name="circle" size={28} /></span>
        <div>
          <strong>No declared activity.</strong>
          <div className="lgi-muted">{current?.message_tr || 'Activity context is unknown; choose below.'}</div>
        </div>
      </div>
    );
  }
  const a = current.activity;
  const meta = ACTIVITY_LABELS[a.activity_state] ?? { label: a.activity_state, icon: 'dot' as IconName, sub: '' };
  const planned = plannedMinutes(a);

  if (expired) {
    return (
      <div className="lgi-activity lgi-activity--expired" role="alert">
        <span className="lgi-activity__icon" aria-hidden="true"><Icon name="warning" size={28} /></span>
        <div className="lgi-activity__body">
          <strong className="lgi-activity__big">The declared time has run out — activity context is unknown</strong>
          {current.message_tr && current.state === 'EXPIRED' && !current.message_tr.startsWith('Beyan edilen süre doldu') && (
            <div>{current.message_tr}</div>
          )}
          <div className="lgi-muted">
            Last declaration: {meta.label}, {planned} min · started {fmtDateTime(a.started_at)} · expected end {fmtDateTime(a.expected_end_at)}
          </div>
          <div className="lgi-actions">
            <button type="button" className="lgi-btn lgi-btn--primary" disabled={busy} onClick={() => onRestart(a)}>
              <Icon name="refresh" size={14} />{' '}Restart: {meta.label}, {planned} min
            </button>
            <button type="button" className="lgi-btn" disabled={busy} onClick={() => onEnd(a)}>End</button>
          </div>
        </div>
      </div>
    );
  }

  const total = planned * 60;
  const pct = remaining === null ? 0 : Math.max(0, Math.min(100, 100 - (remaining / total) * 100));
  return (
    <div className="lgi-activity lgi-activity--active">
      <span className="lgi-activity__icon" aria-hidden="true"><Icon name={meta.icon} size={28} /></span>
      <div className="lgi-activity__body">
        <div className="lgi-activity__row">
          <strong className="lgi-activity__big">{meta.label}</strong>
          <span className="lgi-countdown" aria-label={remaining === null ? 'Time remaining unknown' : `${Math.ceil(remaining / 60)} minutes remaining`}>
            {remaining === null ? '—' : fmtClock(remaining)}
            <span className="lgi-muted"> left</span>
          </span>
        </div>
        <div className="lgi-progress" role="progressbar" aria-label="Elapsed part of the declared time" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className="lgi-progress__bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="lgi-muted">
          {planned} min planned · started {fmtDateTime(a.started_at)} · expected end {fmtDateTime(a.expected_end_at)}
        </div>
        {current.message_tr && <div className="lgi-muted">{current.message_tr}</div>}
        <div className="lgi-actions">
          <button type="button" className="lgi-btn" disabled={busy} onClick={() => onEnd(a)}>
            <Icon name="stop" size={14} />{' '}Bitir
          </button>
        </div>
      </div>
    </div>
  );
}
