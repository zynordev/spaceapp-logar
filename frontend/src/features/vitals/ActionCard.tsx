// Action card V2: pre-written steps with reasons, "Yaptım", re-evaluation
// counter, escalation / closing conditions, possible explanations and the
// live situation. All texts come from the server and are rendered as text.
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { useApp } from '../../lib/store';
import { AttBadge, ThresholdSource } from './Badges';
import { EarthResponseLine } from '../profile/EarthResponse';
import { attInfo } from './copy';
import { useNow } from './data';
import { fmtClock, fmtDateTime, fmtDuration, safeUrl, toMs } from './format';
import type { ActionCard, Situation } from './types';
import { Icon } from '../../ui';

function ReassessCounter({ at, every }: { at: string; every: number | null }) {
  const now = useNow(1000);
  const t = toMs(at);
  if (t == null) return null;
  const left = t - now;
  const due = left <= 0;
  let clock: string;
  if (due) clock = '00:00';
  else if (left < 3600_000) {
    const s = Math.ceil(left / 1000);
    clock = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  } else clock = fmtDuration(left);
  return (
    <div className={`vt-reassess${due ? ' is-due' : ''}`}>
      <span className="vt-reassess-icon" aria-hidden="true"><Icon name="clock" size={14} /></span>
      <div>
        <div className="vt-reassess-label">{due ? 'Yeniden değerlendirme zamanı geldi' : 'Yeniden değerlendirmeye'}</div>
        <div className="vt-reassess-sub">
          {due
            ? `${fmtDateTime(at)} itibarıyla ölçümleri ve belirtileri tekrar kontrol et.`
            : `${fmtClock(at)}${every ? ` · her ${every} dk` : ''}`}
        </div>
      </div>
      <span className="vt-reassess-clock" aria-hidden={!due}>{clock}</span>
      {/* Screen readers get a calm, minute-resolution text instead of a ticking clock. */}
      <span className="vt-sr">{due ? 'Süre doldu.' : `${fmtDuration(left)} kaldı.`}</span>
    </div>
  );
}

export function ActionCardView({
  card, situation, alertId, completedKeys, context, readOnly = false,
}: {
  card: ActionCard;
  situation: Situation | null;
  alertId: string | null;
  completedKeys: string[];
  context?: string;
  readOnly?: boolean;
}) {
  const crewId = useApp((s) => s.crewId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const now = useNow(30000);
  const a = attInfo(card.attention);
  const doneMap = new Map((situation?.completed_steps ?? []).map((d) => [d.step_key, d]));
  const isDone = (k: string) => doneMap.has(k) || completedKeys.includes(k);
  const steps = card.steps ?? [];
  const doneCount = steps.filter((s) => isDone(s.key)).length;
  const since = toMs(situation?.level_since);

  const markDone = async (key: string) => {
    if (!alertId) return;
    setBusy(key);
    setErr(null);
    try {
      await api('POST', `/v1/alerts/${encodeURIComponent(alertId)}/steps`, { crew_member_id: crewId ?? undefined, step_key: key });
    } catch (e) {
      const ae = e instanceof ApiError ? e : null;
      setErr(
        ae?.network ? 'Sunucuya ulaşılamıyor; adım kaydedilmedi.'
          : ae?.status === 409 ? 'Alarm kapanmış; adım artık kaydedilemez.'
            : ae?.status === 422 && !crewId ? 'Adımı kaydetmek için ekip üyesi seçin.'
              : `Adım kaydedilemedi (${ae?.message ?? String(e)}).`,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={`vt-ac vt-ac-${a.cls}`} aria-labelledby={`ac-${card.card_id}`}>
      <div className="vt-ac-top">
        <AttBadge att={card.attention} size="lg" />
        <ThresholdSource r={card} />
        {since != null && <span className="vt-muted vt-small">Bu seviyede {fmtDuration(now - since)}</span>}
      </div>
      {context && <p className="vt-muted vt-small">{context}</p>}
      <h3 id={`ac-${card.card_id}`} className="vt-ac-title">{card.title_tr || card.title_key}</h3>
      {card.reason_tr && <p className="vt-ac-reason">{card.reason_tr}</p>}

      {situation && situation.facts_tr.length > 0 && (
        <div className="vt-ac-situation" role="group" aria-label="Şu anki durum">
          <h4><span className="vt-live-dot" aria-hidden="true" />Şu an ne oluyor?</h4>
          <ul>{situation.facts_tr.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}

      {situation?.reassess_at && <ReassessCounter at={situation.reassess_at} every={card.reassess_minutes} />}

      <EarthResponseLine er={situation?.earth_response} />

      {card.requires_mission_procedure && (
        <p className="vt-callout vt-callout-proc"><span aria-hidden="true"><Icon name="flag" size={14} /></span>Görev prosedürü önceliklidir.</p>
      )}

      {steps.length > 0 && (
        <div className="vt-ac-steps-wrap">
          <div className="vt-ac-steps-head">
            <h4>Ne yapmalıyım?</h4>
            <span className="vt-progress" aria-label={`${doneCount} / ${steps.length} adım tamamlandı`}>
              <span className="vt-progress-bar"><span style={{ width: `${(doneCount / steps.length) * 100}%` }} /></span>
              <span className="vt-small">{doneCount}/{steps.length}</span>
            </span>
          </div>
          <ol className="vt-steps">
            {steps.map((st, i) => {
              const d = doneMap.get(st.key);
              const done = isDone(st.key);
              return (
                <li key={st.key} className={`vt-step${done ? ' is-done' : ''}`}>
                  <span className="vt-step-num" aria-hidden="true">{done ? <Icon name="check" size={14} /> : i + 1}</span>
                  <div className="vt-step-body">
                    <div className="vt-step-text">{st.text_tr || st.key}</div>
                    {st.why_tr && <div className="vt-step-why"><b>Neden:</b> {st.why_tr}</div>}
                    {done && (
                      <div className="vt-step-done">
                        <span className="vt-sr">Tamamlandı. </span>
                        Yapıldı{d ? ` — ${fmtDateTime(d.done_at)} (${d.crew_member_id})` : ''}
                      </div>
                    )}
                  </div>
                  {!done && alertId && !readOnly && (
                    <button
                      type="button"
                      className="vt-btn vt-btn-sm"
                      disabled={busy != null}
                      aria-busy={busy === st.key}
                      aria-label={`Adımı yaptım olarak işaretle: ${st.text_tr || st.key}`}
                      onClick={() => markDone(st.key)}
                    >
                      {busy === st.key ? 'Kaydediliyor…' : 'Yaptım'}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {err && <p className="vt-inline-err" role="alert">{err}</p>}
          {readOnly && <p className="vt-muted vt-small">Bu kart açık bir alarma bağlı değil; adımlar bilgi amaçlıdır.</p>}
        </div>
      )}

      <div className="vt-ac-conds">
        {card.escalate_if_tr?.length > 0 && (
          <div className="vt-ac-cond vt-ac-escalate">
            <h4><span aria-hidden="true"><Icon name="alert" size={14} /></span> Seviye yükselir / acil durum</h4>
            <ul>{card.escalate_if_tr.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        {card.closes_when_tr && (
          <div className="vt-ac-cond vt-ac-closes">
            <h4><span aria-hidden="true"><Icon name="check" size={14} /></span> Ne zaman kapanır?</h4>
            <p>{card.closes_when_tr}</p>
          </div>
        )}
      </div>

      {card.considerations_tr?.length > 0 && (
        <details className="vt-ac-considerations">
          <summary>Olası açıklamalar <span className="vt-muted">(teşhis değildir)</span></summary>
          <ul>{card.considerations_tr.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </details>
      )}

      {card.allows_automatic_vehicle_command === false && (
        <p className="vt-callout vt-callout-info"><span aria-hidden="true"><Icon name="info" size={14} /></span>Yazılım araç/ekipman komutu vermez.</p>
      )}
      {card.footer_note_tr && <p className="vt-ac-footer">{card.footer_note_tr}</p>}
      {card.references?.length > 0 && (
        <p className="vt-ac-refs">
          Kaynak:{' '}
          {card.references.map((r, i) => {
            const u = safeUrl(r.uri);
            return (
              <span key={i}>
                {i > 0 && ' · '}
                {u ? <a href={u} target="_blank" rel="noopener noreferrer">{r.label}</a> : `${r.label} (${r.uri})`}
              </span>
            );
          })}
        </p>
      )}
      <p className="vt-ac-meta vt-mono">Kart: {card.card_id} v{card.version}</p>
    </article>
  );
}
