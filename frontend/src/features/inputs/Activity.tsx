// 2. Aktivite beyanı (contract B): what the crew member is doing right now and
// for how long. Rest-only rules use only data declared as rest.
import { useEffect, useRef, useState } from 'react';
import { api, qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { mockActivity } from './mock';
import { Segmented } from './Segmented';
import {
  InlineMsg, MOCK, NeedSelection, Notice, SOURCE_ID, Section, fmtClock, fmtDateTime, toMs, useAction, useNow,
} from './shared';
import type { ActivityCurrentRead, ActivityRead, ActivityState } from './types';

export const ACTIVITY_LABELS: Record<ActivityState, { label: string; icon: string; sub: string }> = {
  EXERCISE: { label: 'Egzersiz', icon: '🏃', sub: 'Antrenman' },
  LIGHT: { label: 'Hafif iş', icon: '🔧', sub: 'Görev, bakım' },
  REST: { label: 'Dinlenme', icon: '🪑', sub: 'Uyanık, sakin' },
  SLEEP: { label: 'Uyku', icon: '🌙', sub: 'Uyku dönemi' },
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
      setMsg({ kind: 'ok', text: `${ACTIVITY_LABELS[state].label} başladı: ${mins} dk (önizleme, sunucuya gönderilmedi).` });
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
      (r) => ({ kind: 'ok', text: `${ACTIVITY_LABELS[r.activity_state]?.label ?? r.activity_state} başladı; beklenen bitiş ${fmtDateTime(r.expected_end_at)}.` }),
      'aktivite başlatılamadı',
    );
  };

  const end = async (a: ActivityRead) => {
    if (MOCK) {
      mockActivity.end();
      setMockVer((v) => v + 1);
      setMsg({ kind: 'ok', text: 'Aktivite bitirildi (önizleme).' });
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
      hint="Neden önemli: dinlenme kuralları yalnızca “dinlenme” olarak beyan edilen döneme ait veriyi kullanır; egzersizdeki yüksek nabız yanlış alarm üretmez."
      badge={MOCK ? <span className="lgi-chip">Önizleme verisi</span> : null}
    >
      {!ready ? <NeedSelection /> : (
        <>
          {missing && (
            <Notice kind="warn">
              Aktivite beyanı sunucuda henüz yok. Arayüzü önizlemek için adrese <code>?mock=1</code> ekleyin.
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
              legend="Şu an ne yapıyorsunuz?"
              value={pick}
              onChange={setPick}
              options={STATES.map((s) => ({
                value: s,
                label: <><span aria-hidden="true">{ACTIVITY_LABELS[s].icon} </span>{ACTIVITY_LABELS[s].label}</>,
                aria: ACTIVITY_LABELS[s].label,
                sub: ACTIVITY_LABELS[s].sub,
              }))}
            />
            <Segmented<number>
              name="lgi-act-min"
              legend="Planlanan süre"
              value={custom !== '' ? null : minutes}
              onChange={(v) => { setMinutes(v); setCustom(''); }}
              compact
              options={PRESETS.map((m) => ({ value: m, label: `${m}`, sub: 'dk', aria: `${m} dakika` }))}
            />
            <div className="lgi-field lgi-field--inline">
              <label htmlFor="lgi-act-custom">Özel süre (5–240 dk)</label>
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
                {custom !== '' && !customValid ? '5 ile 240 arasında tam sayı girin.' : 'Boş bırakırsanız seçili hazır süre kullanılır.'}
              </span>
            </div>
            <div className="lgi-actions">
              <button
                type="submit"
                className="lgi-btn lgi-btn--primary"
                disabled={busy || missing || effectiveMinutes === null}
                aria-busy={busy}
              >
                {busy ? 'Gönderiliyor…' : `Başlat: ${ACTIVITY_LABELS[pick].label}${effectiveMinutes ? `, ${effectiveMinutes} dk` : ''}`}
              </button>
              {current?.activity && current.state !== 'NONE' && (
                <span className="lgi-muted">Yeni beyan, açık olanı otomatik bitirir.</span>
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
  if (loading) return <p className="lgi-muted">Güncel aktivite yükleniyor…</p>;
  if (!current || current.state === 'NONE' || !current.activity) {
    return (
      <div className="lgi-activity lgi-activity--none">
        <span className="lgi-activity__icon" aria-hidden="true">○</span>
        <div>
          <strong>Beyan edilmiş aktivite yok.</strong>
          <div className="lgi-muted">{current?.message_tr || 'Aktivite bağlamı bilinmiyor; aşağıdan seçin.'}</div>
        </div>
      </div>
    );
  }
  const a = current.activity;
  const meta = ACTIVITY_LABELS[a.activity_state] ?? { label: a.activity_state, icon: '•', sub: '' };
  const planned = plannedMinutes(a);

  if (expired) {
    return (
      <div className="lgi-activity lgi-activity--expired" role="alert">
        <span className="lgi-activity__icon" aria-hidden="true">⚠</span>
        <div className="lgi-activity__body">
          <strong className="lgi-activity__big">Beyan edilen süre doldu — aktivite bağlamı bilinmiyor</strong>
          {current.message_tr && current.state === 'EXPIRED' && !current.message_tr.startsWith('Beyan edilen süre doldu') && (
            <div>{current.message_tr}</div>
          )}
          <div className="lgi-muted">
            Son beyan: {meta.label}, {planned} dk · başlangıç {fmtDateTime(a.started_at)} · beklenen bitiş {fmtDateTime(a.expected_end_at)}
          </div>
          <div className="lgi-actions">
            <button type="button" className="lgi-btn lgi-btn--primary" disabled={busy} onClick={() => onRestart(a)}>
              <span aria-hidden="true">↻ </span>Yeniden başlat: {meta.label}, {planned} dk
            </button>
            <button type="button" className="lgi-btn" disabled={busy} onClick={() => onEnd(a)}>Bitir</button>
          </div>
        </div>
      </div>
    );
  }

  const total = planned * 60;
  const pct = remaining === null ? 0 : Math.max(0, Math.min(100, 100 - (remaining / total) * 100));
  return (
    <div className="lgi-activity lgi-activity--active">
      <span className="lgi-activity__icon" aria-hidden="true">{meta.icon}</span>
      <div className="lgi-activity__body">
        <div className="lgi-activity__row">
          <strong className="lgi-activity__big">{meta.label}</strong>
          <span className="lgi-countdown" aria-label={remaining === null ? 'Kalan süre bilinmiyor' : `Kalan süre ${Math.ceil(remaining / 60)} dakika`}>
            {remaining === null ? '—' : fmtClock(remaining)}
            <span className="lgi-muted"> kaldı</span>
          </span>
        </div>
        <div className="lgi-progress" role="progressbar" aria-label="Beyan edilen sürenin geçen kısmı" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className="lgi-progress__bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="lgi-muted">
          {planned} dk planlandı · başlangıç {fmtDateTime(a.started_at)} · beklenen bitiş {fmtDateTime(a.expected_end_at)}
        </div>
        {current.message_tr && <div className="lgi-muted">{current.message_tr}</div>}
        <div className="lgi-actions">
          <button type="button" className="lgi-btn" disabled={busy} onClick={() => onEnd(a)}>
            <span aria-hidden="true">■ </span>Bitir
          </button>
        </div>
      </div>
    </div>
  );
}
