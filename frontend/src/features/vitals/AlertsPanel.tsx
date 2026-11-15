import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { useApp } from '../../lib/store';
import { ActionCardView } from './ActionCard';
import { AttBadge, Skeleton, StatusBadge } from './Badges';
import { RULE_TITLES } from './copy';
import { rank, useAlerts, useCrewStatus, useMetrics, useNow, useSelection, useVitalsUi, worst } from './data';
import { fmtClock, fmtDateTime, relTime, toMs } from './format';
import type { AlertRead, RuleStatus } from './types';
import { Freshness } from './VitalsPanel';
import { Icon } from '../../ui';

const NO_PERMISSION = 'You are not allowed to do this — the crew health officer can close it';

function actionError(e: unknown, kind: 'ack' | 'resolve'): string {
  const ae = e instanceof ApiError ? e : null;
  if (!ae) return String(e);
  if (ae.network) return 'Cannot reach the server; the action was not saved. Try again when the connection returns.';
  if (ae.status === 403) return NO_PERMISSION;
  if (ae.status === 409) {
    if (kind === 'resolve' && /automatic/i.test(ae.message)) {
      return 'This alarm is measurement-based: it closes by itself once a complete, valid measurement window returns to normal; it cannot be closed by hand.';
    }
    return 'The alarm is already closed.';
  }
  if (ae.status === 422) return 'A crew member must be selected for this action.';
  if (ae.status === 404) return 'Alarm not found; refreshing the list.';
  return `The action could not be completed (${ae.message}).`;
}

function ResolveDialog({
  alert, title, onCancel, onConfirm, busy,
}: { alert: AlertRead | null; title: string; onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (alert && !d.open) d.showModal?.();
    if (!alert && d.open) d.close();
  }, [alert]);
  return (
    <dialog ref={ref} className="vt-dialog" aria-labelledby="vt-resolve-title" onCancel={(e) => { e.preventDefault(); onCancel(); }}>
      <h3 id="vt-resolve-title"><span aria-hidden="true"><Icon name="warning" size={14} /></span> Close red flag</h3>
      <p><b>{title}</b></p>
      <p>Has this red flag event been reviewed by the crew health officer? The alarm will be closed and the person who closed it will be recorded.</p>
      <p className="vt-muted vt-small">Red flags do not close on their own from measurements. The mission procedure takes priority.</p>
      <div className="vt-dialog-actions">
        <button type="button" className="vt-btn vt-btn-ghost" onClick={onCancel} autoFocus>Cancel</button>
        <button type="button" className="vt-btn vt-btn-danger" onClick={onConfirm} disabled={busy} aria-busy={busy}>
          {busy ? 'Closing…' : 'Reviewed, close'}
        </button>
      </div>
    </dialog>
  );
}

function AlertRow({
  alert, title, active, onActivate, onAck, onResolve, onShowChart, busy, error, now,
}: {
  alert: AlertRead;
  title: string;
  active: boolean;
  onActivate: () => void;
  onAck: () => void;
  onResolve: () => void;
  onShowChart: (() => void) | null;
  busy: boolean;
  error: string | null;
  now: number;
}) {
  const resolved = alert.status === 'RESOLVED';
  return (
    <li className={`vt-alert vt-alert-${alert.health_attention.toLowerCase()}${active ? ' is-active' : ''}${resolved ? ' is-resolved' : ''}`}>
      <div className="vt-alert-top">
        <AttBadge att={alert.health_attention} />
        <StatusBadge s={alert.status} />
        <time className="vt-alert-time" dateTime={alert.opened_at} title={fmtDateTime(alert.opened_at, true)}>
          {fmtClock(alert.opened_at)} · {relTime(alert.opened_at, now)}
        </time>
      </div>
      {!resolved && alert.action_card ? (
        <button type="button" className="vt-alert-title vt-linklike" aria-pressed={active} onClick={onActivate}>
          {title}
        </button>
      ) : (
        <span className="vt-alert-title">{title}</span>
      )}
      {alert.explanation && <p className="vt-alert-exp">{alert.explanation}</p>}
      <p className="vt-alert-meta">
        {alert.acknowledged_at && <span>Acknowledged {fmtClock(alert.acknowledged_at)}{alert.acknowledged_by ? ` (${alert.acknowledged_by})` : ''}</span>}
        {alert.resolved_at && <span>Resolved {fmtDateTime(alert.resolved_at)}{alert.resolved_by ? ` (${alert.resolved_by})` : ''}</span>}
        {alert.manual_resolution && !resolved && <span>Does not close on its own from measurements; the crew health officer reviews and closes it.</span>}
        {!alert.manual_resolution && !resolved && <span>Closes by itself when the measurements return to normal.</span>}
      </p>
      {!resolved && (
        <div className="vt-alert-actions">
          {alert.status === 'OPEN' && (
            <button type="button" className="vt-btn vt-btn-primary vt-btn-sm" onClick={onAck} disabled={busy} aria-busy={busy}
              aria-label={`Mark alarm as acknowledged: ${title}`}>
              Acknowledge
            </button>
          )}
          {alert.manual_resolution && (
            <button type="button" className="vt-btn vt-btn-sm vt-btn-danger-ghost" onClick={onResolve} disabled={busy}
              aria-label={`Close as reviewed: ${title}`}>
              Reviewed, close
            </button>
          )}
          {alert.action_card && !active && (
            <button type="button" className="vt-btn vt-btn-ghost vt-btn-sm" onClick={onActivate}>Show action card</button>
          )}
          {onShowChart && (
            <button type="button" className="vt-btn vt-btn-ghost vt-btn-sm" onClick={onShowChart}>Show on chart</button>
          )}
        </div>
      )}
      {error && <p className="vt-inline-err" role="alert">{error}</p>}
    </li>
  );
}

export function AlertsPanel() {
  const { missionId } = useSelection();
  const crewId = useApp((s) => s.crewId);
  const alerts = useAlerts();
  const status = useCrewStatus();
  const metrics = useMetrics();
  const { activeAlertId, setActiveAlert, select } = useVitalsUi();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<AlertRead | null>(null);
  const now = useNow(30000);

  if (!missionId) {
    return (
      <section className="vt-panel" aria-label="Alarms and action card">
        <h2 className="vt-h2">Alarms and action card</h2>
        <div className="vt-empty-state"><span aria-hidden="true" className="vt-empty-icon"><Icon name="info" size={22} /></span><p>Select a mission to see alarms.</p></div>
      </section>
    );
  }

  const rules: RuleStatus[] = status.data?.rules ?? [];
  const ruleById = new Map(rules.map((r) => [r.rule_id, r]));
  const titleOf = (a: AlertRead) => ruleById.get(a.rule_id)?.title ?? RULE_TITLES[a.rule_id] ?? a.action_card?.title_tr ?? a.rule_id;
  const list = alerts.data ?? [];
  const byTime = (a: AlertRead, b: AlertRead) => (toMs(b.opened_at) ?? 0) - (toMs(a.opened_at) ?? 0);
  const activeList = list.filter((a) => a.status !== 'RESOLVED')
    .sort((a, b) => rank(b) - rank(a) || (a.status === 'OPEN' ? -1 : 0) - (b.status === 'OPEN' ? -1 : 0) || byTime(a, b));
  const resolvedList = list.filter((a) => a.status === 'RESOLVED').sort(byTime);
  const openCount = activeList.filter((a) => a.status === 'OPEN').length;

  const current = activeList.find((a) => a.id === activeAlertId && a.action_card) ?? activeList.find((a) => a.action_card) ?? null;
  const currentRule = current ? ruleById.get(current.rule_id) : undefined;
  const situation = currentRule?.situation && currentRule.situation.alert_id === current?.id ? currentRule.situation : null;
  // No alert with a card: show the card of the highest-attention rule (information only).
  const ruleCard = !current ? worst(rules.filter((r) => r.action_card)) : null;

  const run = async (a: AlertRead, kind: 'ack' | 'resolve') => {
    setBusy(a.id);
    setErrors((prev) => { const next = { ...prev }; delete next[a.id]; return next; });
    try {
      await api('POST', `/v1/alerts/${encodeURIComponent(a.id)}/${kind === 'ack' ? 'acknowledge' : 'resolve'}`, {
        crew_member_id: crewId ?? undefined,
      });
      if (kind === 'resolve') setConfirm(null);
      // Keep the card the person was looking at; the re-sorted list must not swap it.
      if (kind === 'ack' && current && a.action_card && !activeAlertId) setActiveAlert(current.id);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [a.id]: actionError(e, kind) }));
      if (kind === 'resolve') setConfirm(null);
      if (e instanceof ApiError && e.status === 404) alerts.reload();
    } finally {
      setBusy(null);
    }
  };

  const chartFor = (a: AlertRead) => {
    const r = ruleById.get(a.rule_id);
    if (!r || !metrics.some((m) => m.metric === r.metric)) return null;
    return () => {
      select(r.metric, r.rule_id);
      document.getElementById('vt-chart-title')?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center',
      });
    };
  };

  const rowProps = (a: AlertRead) => ({
    alert: a,
    title: titleOf(a),
    active: current?.id === a.id,
    onActivate: () => setActiveAlert(a.id),
    onAck: () => run(a, 'ack'),
    onResolve: () => setConfirm(a),
    onShowChart: chartFor(a),
    busy: busy === a.id,
    error: errors[a.id] ?? null,
    now,
  });

  return (
    <section className="vt-panel" aria-label="Alarms and action card">
      <header className="vt-panel-head">
        <div>
          <h2 className="vt-h2">
            Alarms and action card
            {openCount > 0 && <span className="vt-count vt-count-hot" aria-label={`${openCount} open alarms`}>{openCount}</span>}
          </h2>
          <p className="vt-muted vt-small">Cards are pre-written; they do not diagnose and do not replace the mission procedure.</p>
        </div>
        <Freshness at={status.data?.generated_at} error={!!alerts.error} />
      </header>

      {!crewId && (
        <p className="vt-note" role="status"><span aria-hidden="true"><Icon name="info" size={14} /></span>Select a crew member to take action.</p>
      )}

      <div className="vt-alerts-layout">
        <div className="vt-alerts-col">
          {!alerts.data ? (
            alerts.error ? (
              <p className="vt-note vt-note-warn" role="alert"><span aria-hidden="true"><Icon name="warning" size={14} /></span>Could not load alarms ({alerts.error.network ? 'no connection' : alerts.error.message}).</p>
            ) : <Skeleton lines={3} height={64} />
          ) : activeList.length === 0 ? (
            <div className="vt-empty-state vt-empty-small">
              <span aria-hidden="true" className="vt-empty-icon vt-ok"><Icon name="check" size={22} /></span>
              <p>No open alarms.</p>
              <p className="vt-muted vt-small">No alarms does not mean all data is valid; check the data quality in the rules list.</p>
            </div>
          ) : (
            <ul className="vt-alerts">{activeList.map((a) => <AlertRow key={a.id} {...rowProps(a)} />)}</ul>
          )}
          {resolvedList.length > 0 && (
            <details className="vt-resolved">
              <summary>Kapanan alarmlar ({resolvedList.length})</summary>
              <ul className="vt-alerts">{resolvedList.slice(0, 30).map((a) => <AlertRow key={a.id} {...rowProps(a)} />)}</ul>
            </details>
          )}
        </div>

        <div className="vt-card-col">
          {current?.action_card ? (
            <ActionCardView
              key={`${current.id}-${current.action_card.card_id}-${current.action_card.version}`}
              card={current.action_card}
              situation={situation}
              alertId={current.id}
              completedKeys={current.completed_step_keys}
              context={`Alarm: ${titleOf(current)} · opened ${fmtDateTime(current.opened_at)}`}
            />
          ) : ruleCard?.action_card ? (
            <ActionCardView
              card={ruleCard.action_card}
              situation={ruleCard.situation}
              alertId={null}
              completedKeys={[]}
              context={`Rule: ${ruleCard.title}`}
              readOnly
            />
          ) : alerts.data ? (
            <div className="vt-empty-state vt-empty-small">
              <span aria-hidden="true" className="vt-empty-icon"><Icon name="info" size={22} /></span>
              <p>No action card is active right now.</p>
              <p className="vt-muted vt-small">Cards appear, with pre-written text, only when a rule needs attention.</p>
            </div>
          ) : <Skeleton lines={6} height={18} />}
        </div>
      </div>

      <ResolveDialog
        alert={confirm}
        title={confirm ? titleOf(confirm) : ''}
        busy={!!confirm && busy === confirm.id}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { if (confirm) run(confirm, 'resolve'); }}
      />
    </section>
  );
}
