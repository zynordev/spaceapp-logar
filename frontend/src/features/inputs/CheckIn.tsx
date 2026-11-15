// 1. Öznel durum (subjective check-in): 8 fields, 0–4 severity each.
import { useState, type FormEvent } from 'react';
import { api, qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Icon } from '../../ui';
import { Segmented } from './Segmented';
import {
  InlineMsg, NeedSelection, Notice, SOURCE_ID, Section, fmtDateTime, relTime, toMs, useAction, useNow,
} from './shared';
import type { CheckInKey, CheckInRead, CrewStatusLite } from './types';

export const CHECKIN_FIELDS: [CheckInKey, string][] = [
  ['fatigue', 'Fatigue'], ['dizziness', 'Dizziness'], ['nausea', 'Nausea'],
  ['pain', 'Pain'], ['mood_distress', 'Mood distress'],
  ['vision_change', 'Vision change'], ['back_pain', 'Back pain'],
  ['congestion', 'Nasal congestion / facial swelling'],
];
export const SEVERITY_WORDS = ['None', 'Mild', 'Moderate', 'Severe', 'Very severe'];

const CHECK_DUE_MS = 4 * 60 * 60 * 1000;

type Scores = Record<CheckInKey, number>;
const ZERO: Scores = {
  fatigue: 0, dizziness: 0, nausea: 0, pain: 0, mood_distress: 0,
  vision_change: 0, back_pain: 0, congestion: 0,
};

export function CheckInSection() {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const envId = useApp((s) => s.environmentTargetId);
  const now = useNow(30000);
  const [scores, setScores] = useState<Scores>(ZERO);
  const { busy, msg, run } = useAction();

  const statusPath = missionId && crewId
    ? `/v1/crew/${encodeURIComponent(crewId)}/status${qs({ mission_id: missionId, environment_target_id: envId })}`
    : null;
  const status = usePolling<CrewStatusLite>(statusPath, 30000);
  const latest = status.data?.latest_check_in ?? null;
  const latestMs = toMs(latest?.observed_at);
  const due = !!statusPath && !!status.data && (latestMs === null || now - latestMs > CHECK_DUE_MS);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!missionId || !crewId) return;
    await run(
      () => api<CheckInRead>('POST', '/v1/check-ins', {
        mission_id: missionId,
        crew_member_id: crewId,
        ...scores,
        observed_at: new Date().toISOString(),
        source_type: 'MANUAL',
        source_id: SOURCE_ID,
      }),
      (r) => ({ kind: 'ok', text: `Saved (${fmtDateTime(r.observed_at)}). Subjective entries are context only; they do not raise an alarm on their own.` }),
      'could not be saved',
    );
  };

  const nonZero = CHECKIN_FIELDS.filter(([k]) => (scores[k] ?? 0) > 0).length;

  return (
    <Section
      id="lgi-checkin"
      title="Subjective state"
      hint="Choose the current severity of each symptom. 0 = none, 4 = very severe."
      badge={due ? <span className="lgi-chip lgi-chip--warn"><Icon name="bell" size={14} />{' '}Check-in due</span> : null}
    >
      {!missionId || !crewId ? <NeedSelection /> : (
        <>
          <LatestCheckIn latest={latest} now={now} due={due} loading={status.loading && !status.data} />
          <form onSubmit={submit} className="lgi-form">
            <div className="lgi-checkin-grid">
              {CHECKIN_FIELDS.map(([key, label]) => (
                <Segmented<number>
                  key={key}
                  name={`lgi-ci-${key}`}
                  legend={label}
                  value={scores[key]}
                  onChange={(v) => setScores((s) => ({ ...s, [key]: v }))}
                  tone={(v) => v}
                  compact
                  options={SEVERITY_WORDS.map((w, i) => ({ value: i, label: String(i), sub: w, aria: `${i} — ${w}` }))}
                />
              ))}
            </div>
            <div className="lgi-actions">
              <button type="submit" className="lgi-btn lgi-btn--primary" disabled={busy} aria-busy={busy}>
                {busy ? 'Saving…' : 'Save status'}
              </button>
              <button type="button" className="lgi-btn" onClick={() => setScores(ZERO)} disabled={busy}>
                Set all to “None”
              </button>
              <span className="lgi-muted">{nonZero ? `${nonZero} symptoms marked` : 'No symptoms marked'}</span>
            </div>
            <InlineMsg msg={msg} />
          </form>
        </>
      )}
    </Section>
  );
}

function LatestCheckIn({ latest, now, due, loading }: { latest: CheckInRead | null; now: number; due: boolean; loading: boolean }) {
  if (loading) return <p className="lgi-muted">Loading the last entry…</p>;
  if (!latest) {
    return <Notice kind="warn">No subjective entry yet. A check-in is due: enter the first entry below.</Notice>;
  }
  const reported = CHECKIN_FIELDS
    .map(([k, label]) => [label, latest[k]] as const)
    .filter(([, v]) => typeof v === 'number' && v > 0);
  return (
    <div className={`lgi-latest${due ? ' is-due' : ''}`}>
      <div className="lgi-latest__head">
        <strong>Last entry:</strong> {fmtDateTime(latest.observed_at)} ({relTime(latest.observed_at, now)})
        {due && <span className="lgi-latest__due"> · older than 4 hours, check-in due</span>}
      </div>
      {reported.length === 0 ? (
        <p className="lgi-muted">All symptoms were reported as “None”.</p>
      ) : (
        <ul className="lgi-taglist">
          {reported.map(([label, v]) => (
            <li key={label} className="lgi-tag" data-tone={v}>
              {label}: <b>{v} — {SEVERITY_WORDS[v as number]}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
