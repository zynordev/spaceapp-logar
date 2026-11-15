// Compact ISS / Moon / Mars segmented control (top bar + Earth console header).
// Reads GET /v1/missions/{id}/profile; a change POSTs the new profile. The
// server owns the delay values and the escalation owner; until the backend
// ships the endpoint (404) the control is shown disabled with a calm note.
import { useId, useState } from 'react';
import { ApiError, api, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Icon, notifyError, toast } from '../../ui';
import { fmtDelay } from './format';
import { PROFILE_OPTIONS, type MissionProfile, type MissionProfileRead } from './types';
import './profile.css';

export function useMissionProfile() {
  const missionId = useApp((s) => s.missionId);
  return usePolling<MissionProfileRead>(missionId ? `/v1/missions/${encodeURIComponent(missionId)}/profile` : null, 30_000);
}

export function ProfileSelector({ variant = 'bar' }: { variant?: 'bar' | 'console' }) {
  const uid = useId();
  const missionId = useApp((s) => s.missionId);
  const q = useMissionProfile();
  const [busy, setBusy] = useState<MissionProfile | null>(null);
  const unsupported = q.error?.notFound === true && !q.data;
  const current = q.data?.profile ?? null;
  const disabled = !missionId || unsupported || busy !== null;

  const choose = async (p: MissionProfile) => {
    if (!missionId || p === current) return;
    setBusy(p);
    try {
      const r = await api<MissionProfileRead>('POST', `/v1/missions/${encodeURIComponent(missionId)}/profile`, { profile: p });
      q.reload();
      toast.success(`Mission profile: ${r.label_tr} · one way ${fmtDelay(r.one_way_delay_seconds.typical)} · ${r.escalation_owner_label_tr}`);
    } catch (e) {
      if (e instanceof ApiError && e.notFound) toast('The mission profile is not on this server yet.');
      else if (!(e instanceof ApiError && e.forbidden)) notifyError(e, 'Mission profile');
    } finally {
      setBusy(null);
    }
  };

  const title = unsupported
    ? 'The mission profile endpoint is not on this server yet (/v1/missions/{id}/profile).'
    : q.data
      ? `${q.data.note_tr} ${q.data.source_note_tr}`.trim()
      : undefined;

  return (
    <div className={`prof prof--${variant}`} title={title}>
      <span className="prof__label" id={`${uid}-l`}>
        Mission profile
      </span>
      <div className="prof__seg" role="radiogroup" aria-labelledby={`${uid}-l`}>
        {PROFILE_OPTIONS.map((o) => {
          const on = current === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`prof__opt${on ? ' is-on' : ''}`}
              disabled={disabled}
              aria-busy={busy === o.id}
              title={o.title}
              onClick={() => void choose(o.id)}
            >
              <span className="prof__name">{o.label}</span>
              <span className="prof__delay">{o.delay}</span>
            </button>
          );
        })}
      </div>
      <span className="prof__meta" aria-live="polite">
        {unsupported ? (
          <span className="prof__muted">not on server</span>
        ) : q.data ? (
          <>
            <Icon name="user" size={12} />
            <span>
              Escalation: <strong>{q.data.escalation_owner_label_tr}</strong>
            </span>
          </>
        ) : q.error ? (
          <span className="prof__muted">unavailable</span>
        ) : missionId ? (
          <span className="prof__muted">…</span>
        ) : null}
      </span>
    </div>
  );
}
