// 3. Rutinler (contract D): daily habits and periodic tests with light streaks.
// DEMO plan; never medication; no health claims.
import { useState } from 'react';
import { api, qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { ROUTINE_CATALOG_FALLBACK, mockRoutines } from './mock';
import {
  InlineMsg, MOCK, NeedSelection, Notice, Section, fmtDateTime, relTime, useAction, useNow,
} from './shared';
import type {
  RoutineCatalogItem, RoutineCategory, RoutineDueRead, RoutineKind, RoutineScheduleRead, RoutineState,
} from './types';

const STATE_META: Record<RoutineState, { label: string; icon: string }> = {
  OVERDUE: { label: 'Gecikti', icon: '⏰' },
  DUE: { label: 'Zamanı geldi', icon: '●' },
  UPCOMING: { label: 'Yaklaşan', icon: '○' },
};
const ORDER: Record<RoutineState, number> = { OVERDUE: 0, DUE: 1, UPCOMING: 2 };
const CATEGORY_LABEL: Record<RoutineCategory, string> = { DAILY: 'Günlük', PERIODIC_TEST: 'Periyodik test' };
const FALLBACK_CATEGORY = Object.fromEntries(
  ROUTINE_CATALOG_FALLBACK.map((c) => [c.kind, c.category]),
) as Record<RoutineKind, RoutineCategory>;

export function RoutinesSection() {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const now = useNow(30000);
  const [mockVer, setMockVer] = useState(0);
  const [justDone, setJustDone] = useState<string | null>(null);
  const { busy, msg, setMsg, run } = useAction();

  const ready = MOCK || (!!missionId && !!crewId);
  const duePath = !MOCK && missionId && crewId
    ? `/v1/routines/due${qs({ mission_id: missionId, crew_member_id: crewId })}`
    : null;
  const due = usePolling<RoutineDueRead[]>(duePath, 30000);
  const catalog = usePolling<RoutineCatalogItem[]>(MOCK ? null : '/v1/routines/catalog', 600000);

  void mockVer;
  const items = MOCK ? mockRoutines.due(now) : due.data;
  const missing = !MOCK && due.error?.notFound === true;
  const catMap = new Map<RoutineKind, RoutineCatalogItem>(
    (catalog.data ?? ROUTINE_CATALOG_FALLBACK).map((c) => [c.kind, c]),
  );
  const sorted = (items ?? []).slice().sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || Date.parse(a.next_due_at) - Date.parse(b.next_due_at),
  );
  const pending = sorted.filter((r) => r.state !== 'UPCOMING').length;

  const setupDefaults = async () => {
    if (MOCK) {
      mockRoutines.defaults();
      setMockVer((v) => v + 1);
      setMsg({ kind: 'ok', text: 'Örnek plan kuruldu (önizleme).' });
      return;
    }
    if (!missionId || !crewId) return;
    await run(
      () => api<RoutineScheduleRead[]>('POST', '/v1/routines/defaults', { mission_id: missionId, crew_member_id: crewId }),
      (r) => ({ kind: 'ok', text: `Örnek plan kuruldu: ${r.length} rutin.` }),
      'örnek plan kurulamadı',
    );
  };

  const complete = async (r: RoutineDueRead) => {
    const id = r.schedule.id;
    const title = r.schedule.title_tr;
    if (MOCK) {
      const res = mockRoutines.complete(id);
      setMockVer((v) => v + 1);
      setJustDone(id);
      setTimeout(() => setJustDone((x) => (x === id ? null : x)), 2500);
      setMsg({ kind: 'ok', text: `“${title}” işaretlendi. Seri: ${res?.current_streak ?? '—'} (önizleme).` });
      return;
    }
    const res = await run(
      () => api<RoutineDueRead>('POST', `/v1/routines/${encodeURIComponent(id)}/complete`, { crew_member_id: crewId ?? undefined }),
      (d) => ({ kind: 'ok', text: `“${title}” işaretlendi. Seri: ${d.current_streak}, en iyi: ${d.best_streak}. Sonraki: ${relTime(d.next_due_at)}.` }),
      'işaretlenemedi',
    );
    if (res) {
      setJustDone(id);
      setTimeout(() => setJustDone((x) => (x === id ? null : x)), 2500);
    }
  };

  return (
    <Section
      id="lgi-routines"
      title="Rutinler"
      hint="Günlük alışkanlıklar ve periyodik testler. Seri sayacı yalnızca motivasyon içindir; sağlık değerlendirmesi değildir. İlaç hatırlatması içermez."
      badge={<span className="lgi-chip lgi-chip--demo" title="Uçuş tıbbı tarafından doğrulanmamış örnek plan">DEMO plan</span>}
    >
      {!ready ? <NeedSelection /> : missing ? (
        <Notice kind="warn">
          Rutin servisi sunucuda henüz yok. Arayüzü önizlemek için adrese <code>?mock=1</code> ekleyin.
        </Notice>
      ) : (
        <>
          {!MOCK && due.loading && !due.data && <p className="lgi-muted">Rutinler yükleniyor…</p>}
          {!MOCK && due.error && !due.error.notFound && !due.data && (
            <Notice kind="err">Rutinler alınamadı ({due.error.forbidden ? 'yetki yok' : due.error.message}).</Notice>
          )}
          {items && items.length === 0 && (
            <div className="lgi-empty">
              <p>Henüz rutin planı yok.</p>
              <button type="button" className="lgi-btn lgi-btn--primary" onClick={setupDefaults} disabled={busy} aria-busy={busy}>
                {busy ? 'Kuruluyor…' : 'Örnek planı kur'}
              </button>
              <p className="lgi-muted">Su, egzersiz, uyku penceresi, öznel kayıt ve haftalık testlerden oluşan DEMO plan.</p>
            </div>
          )}
          {sorted.length > 0 && (
            <>
              <p className="lgi-muted" aria-live="polite">
                {pending ? `${pending} rutin bekliyor.` : 'Bekleyen rutin yok.'}
              </p>
              <ul className="lgi-routines">
                {sorted.map((r) => {
                  const meta = STATE_META[r.state];
                  const cat = catMap.get(r.schedule.kind)?.category ?? FALLBACK_CATEGORY[r.schedule.kind] ?? 'DAILY';
                  const desc = catMap.get(r.schedule.kind)?.description_tr;
                  const done = justDone === r.schedule.id;
                  return (
                    <li key={r.schedule.id} className={`lgi-routine lgi-routine--${r.state.toLowerCase()}${done ? ' is-done' : ''}`}>
                      <div className="lgi-routine__main">
                        <div className="lgi-routine__top">
                          <span className={`lgi-state lgi-state--${r.state.toLowerCase()}`}>
                            <span aria-hidden="true">{meta.icon} </span>{meta.label}
                          </span>
                          <span className="lgi-chip">{CATEGORY_LABEL[cat]}</span>
                          <Streak current={r.current_streak} best={r.best_streak} pulse={done} />
                        </div>
                        <strong className="lgi-routine__title">{r.schedule.title_tr}</strong>
                        {desc && <span className="lgi-muted">{desc}</span>}
                        <span className="lgi-muted">
                          {r.state === 'UPCOMING' ? 'Sırada: ' : 'Hedef zaman: '}
                          <time dateTime={r.next_due_at} title={fmtDateTime(r.next_due_at)}>{relTime(r.next_due_at, now)}</time>
                          {r.last_completed_at && <> · son: {relTime(r.last_completed_at, now)}</>}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`lgi-btn lgi-btn--done${done ? ' is-done' : ''}`}
                        onClick={() => complete(r)}
                        disabled={busy || done}
                        aria-label={done ? `${r.schedule.title_tr}: kaydedildi` : `${r.schedule.title_tr}: yaptım`}
                      >
                        <span aria-hidden="true">✓ </span>{done ? 'Kaydedildi' : 'Yaptım'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <InlineMsg msg={msg} />
        </>
      )}
    </Section>
  );
}

function Streak({ current, best, pulse }: { current: number; best: number; pulse: boolean }) {
  return (
    <span
      className={`lgi-streak${pulse ? ' is-pulse' : ''}`}
      aria-label={`Seri ${current}, en iyi ${best}`}
      title="Arka arkaya zamanında tamamlama sayısı"
    >
      <span aria-hidden="true">🔥 {current}</span>
      <span className="lgi-streak__best" aria-hidden="true">en iyi {best}</span>
    </span>
  );
}
