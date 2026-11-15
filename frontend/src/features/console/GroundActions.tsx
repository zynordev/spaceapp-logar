// Flight-surgeon actions on the Earth side: escalations the ground already
// knows about (pending first) and per-recipient packet preview + ack.
// The ground can only act on what has (in the simulation) reached Earth.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, qs } from '../../lib/api';
import { AttentionBadge, Button, Chip, EmptyState, ErrorNote, Icon, describeError, formatDateTime, toast } from '../../ui';
import { clock, formatCountdown, parseTime } from './delay';
import type { LinkEvent, LocalAck } from './events';
import { transitOf, type Tracker } from './transit';
import { KIND_LABEL, type PacketItemKind, type Recipient, type RecipientStatus, type SyncAckRead, type SyncPacketRead } from './types';

/* ------------------------------------------------------------ Escalations */

export interface EscalationListProps {
  /** Escalation events (down), any phase. */
  events: LinkEvent[];
  onPrepare: () => void;
}

export function EscalationList({ events, onPrepare }: EscalationListProps) {
  const known = events.filter((e) => e.transit.phase !== 'transit' && e.escalation);
  const travelling = events.length - known.length;
  const sorted = [...known].sort((a, b) => {
    const pa = a.escalation!.status === 'PENDING' ? 0 : 1;
    const pb = b.escalation!.status === 'PENDING' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ca = a.escalation!.priority === 'CRITICAL' ? 0 : 1;
    const cb = b.escalation!.priority === 'CRITICAL' ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return (parseTime(b.escalation!.created_at) ?? 0) - (parseTime(a.escalation!.created_at) ?? 0);
  });
  const pending = known.filter((e) => e.escalation!.status === 'PENDING').length;

  return (
    <section className="console-card" aria-labelledby="console-esc-title">
      <header className="console-card__head">
        <h2 id="console-esc-title" className="console-side__title">
          <Icon name="bell" size={18} /> Flight surgeon notifications
        </h2>
        <span className="console-muted">
          Waiting on Earth <span className="console-num">{pending}</span>
        </span>
      </header>
      {travelling > 0 && (
        <p className="console-inline-note">
          <Icon name="clock" size={14} /> <span className="console-num">{travelling}</span> notifications still in transit — the ground team does not know yet.
        </p>
      )}
      {sorted.length === 0 ? (
        <EmptyState compact icon="check" title="No notifications have reached Earth" />
      ) : (
        <ul className="console-esc">
          {sorted.map((ev) => {
            const e = ev.escalation!;
            return (
              <li key={ev.key} className="console-esc__item">
                <div className="console-esc__row">
                  <AttentionBadge level={e.priority} size="sm" />
                  {e.status === 'PENDING' ? (
                    <Chip tone="warn" icon="hourglass">
                      Awaiting acknowledgement
                    </Chip>
                  ) : (
                    <Chip tone="ok" icon="check">
                      Acknowledged · {clock(parseTime(e.acked_at))}
                    </Chip>
                  )}
                  <span className="console-muted">Created on board {clock(parseTime(e.created_at))}</span>
                </div>
                <p className="console-esc__text">{e.summary_tr}</p>
                {e.status === 'PENDING' && (
                  <Button size="sm" variant="secondary" icon="download" onClick={onPrepare}>
                    Prepare flight surgeon packet
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- Packet */

export interface PacketPanelProps {
  missionId: string;
  recipients: RecipientStatus[] | null;
  recipient: Recipient;
  onRecipient: (r: Recipient) => void;
  /** Changes when the escalation list asks for a fresh packet. */
  prepareToken: number;
  tracker: Tracker;
  now: number;
  delaySeconds: number;
  compression: number;
  onAcked: (ack: LocalAck) => void;
}

type AckProblem = { kind: 'forbidden' | 'changed' | 'other'; title: string; detail?: string };

export function PacketPanel({
  missionId,
  recipients,
  recipient,
  onRecipient,
  prepareToken,
  tracker,
  now,
  delaySeconds,
  compression,
  onAcked,
}: PacketPanelProps) {
  const [packet, setPacket] = useState<SyncPacketRead | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [preparing, setPreparing] = useState(false);
  const [acking, setAcking] = useState(false);
  const [problem, setProblem] = useState<AckProblem | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wanted = useRef(recipient);
  wanted.current = recipient;

  // A new mission / recipient invalidates the preview.
  useEffect(() => {
    setPacket(null);
    setProblem(null);
    setLoadError(null);
  }, [missionId, recipient]);

  const prepare = async (who: Recipient = recipient) => {
    setPreparing(true);
    setProblem(null);
    setLoadError(null);
    try {
      const p = await api<SyncPacketRead>('GET', `/v1/sync/packet${qs({ mission_id: missionId, recipient: who })}`);
      if (p.recipient !== wanted.current) return; // recipient changed meanwhile
      // Packet items left the ship when they were recorded; the console can
      // only vouch for that from the moment it started watching this mission.
      tracker.register(
        p.items.map((i) => {
          const t = parseTime(i.occurred_at);
          return { key: `${i.kind}:${i.id}`, eventAt: t, seenAt: t ?? undefined };
        }),
      );
      setPacket(p);
    } catch (e) {
      setPacket(null);
      setLoadError(e);
    } finally {
      setPreparing(false);
    }
  };

  // Escalation list -> "Prepare flight surgeon packet".
  const lastToken = useRef(prepareToken);
  useEffect(() => {
    if (prepareToken === lastToken.current) return;
    lastToken.current = prepareToken;
    headingRef.current?.focus();
    void prepare('FLIGHT_SURGEON');
  }, [prepareToken]);

  const summary = useMemo(() => {
    if (!packet) return null;
    const kinds = new Map<PacketItemKind, number>();
    for (const i of packet.items) kinds.set(i.kind, (kinds.get(i.kind) ?? 0) + 1);
    return [...kinds.entries()].sort((a, b) => b[1] - a[1]);
  }, [packet]);

  // Items of this packet that (in the simulation) have not reached Earth yet.
  let travelling = 0;
  let lastArrival = 0;
  if (packet) {
    for (const i of packet.items) {
      const t = transitOf(tracker.get(`${i.kind}:${i.id}`), now, delaySeconds, compression);
      if (t.phase === 'transit') {
        travelling += 1;
        lastArrival = Math.max(lastArrival, t.arriveAt);
      }
    }
  }

  const ack = async () => {
    if (!packet) return;
    setAcking(true);
    setProblem(null);
    try {
      const res = await api<SyncAckRead>('POST', '/v1/sync/ack', {
        mission_id: packet.mission_id,
        recipient: packet.recipient,
        packet_id: packet.packet_id,
        sha256: packet.sha256,
        until: packet.until,
      });
      tracker.register([{ key: `ACK:${res.id}`, eventAt: null }]);
      const label = recipients?.find((r) => r.recipient === packet.recipient)?.label_tr ?? packet.recipient;
      onAcked({
        id: res.id,
        recipient: res.recipient,
        recipientLabel: label,
        itemCount: packet.item_count,
        sha256: res.sha256,
        ackedAt: res.acked_at,
        ackedBy: res.acked_by,
        escalationIds: packet.recipient === 'FLIGHT_SURGEON' ? packet.items.filter((i) => i.kind === 'ESCALATION').map((i) => i.id) : [],
      });
      toast.success(`${label}: acknowledgement recorded; it is now on its way to the ship.`);
      setPacket(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setProblem({ kind: 'forbidden', title: 'Only the ground team (GROUND) can acknowledge', detail: 'Sign in with the ground team role.' });
      } else if (e instanceof ApiError && e.status === 409) {
        setProblem({ kind: 'changed', title: 'Packet changed, prepare it again', detail: 'The integrity digest (sha256) did not match the packet on the server.' });
        setPacket(null);
      } else {
        const d = describeError(e, 'Acknowledgement');
        setProblem({ kind: 'other', title: d.title, detail: d.detail });
      }
    } finally {
      setAcking(false);
    }
  };

  const current = recipients?.find((r) => r.recipient === recipient) ?? null;

  return (
    <section className="console-card" aria-labelledby="console-packet-title">
      <header className="console-card__head">
        <h2 id="console-packet-title" ref={headingRef} tabIndex={-1} className="console-side__title">
          <Icon name="download" size={18} /> Packet preview and acknowledgement
        </h2>
      </header>

      <div className="console-recipients" role="radiogroup" aria-label="Recipient team">
        {(recipients ?? []).map((r) => (
          <label key={r.recipient} className={`console-recipient${r.recipient === recipient ? ' is-on' : ''}`}>
            <input
              type="radio"
              name="console-recipient"
              value={r.recipient}
              checked={r.recipient === recipient}
              onChange={() => onRecipient(r.recipient)}
            />
            <span className="console-recipient__name">{r.label_tr}</span>
            <span className="console-recipient__meta">
              pending <span className="console-num">{r.pending_items}</span>
            </span>
          </label>
        ))}
        {recipients === null && <p className="console-muted">Loading recipient list…</p>}
      </div>
      {current && (
        <p className="console-muted">Last acknowledgement: {current.last_ack_at ? formatDateTime(current.last_ack_at, true) : 'none yet'}</p>
      )}

      <div className="console-packet__actions">
        <Button variant="secondary" icon="refresh" loading={preparing} onClick={() => void prepare()}>
          {packet ? 'Prepare packet again' : 'Prepare packet'}
        </Button>
      </div>

      {loadError !== null && <ErrorNote error={loadError} what="Packet" compact />}

      {packet && summary && (
        <div className="console-packet" aria-live="polite">
          <dl className="console-packet__facts">
            <div>
              <dt>Item</dt>
              <dd className="console-num console-num--lg">{packet.item_count}</dd>
            </div>
            <div>
              <dt>sha256</dt>
              <dd className="console-mono" title={packet.sha256}>
                {packet.sha256.slice(0, 12)}…
              </dd>
            </div>
            <div>
              <dt>Signature</dt>
              <dd>
                {packet.signature ? (
                  <Chip tone="ok" icon="lock">
                    Signed ({packet.signature_alg})
                  </Chip>
                ) : (
                  <Chip tone="neutral" icon="info">
                    Unsigned
                  </Chip>
                )}
              </dd>
            </div>
            <div>
              <dt>Range</dt>
              <dd>
                {packet.since ? formatDateTime(packet.since, true) : 'start'} → {formatDateTime(packet.until, true)}
              </dd>
            </div>
          </dl>
          <ul className="console-packet__kinds" aria-label="Item types">
            {summary.map(([kind, n]) => (
              <li key={kind}>
                <span>{KIND_LABEL[kind] ?? kind}</span>
                <span className="console-num">{n}</span>
              </li>
            ))}
          </ul>

          {travelling > 0 ? (
            <p className="console-inline-note">
              <Icon name="clock" size={14} /> The packet has <span className="console-num">{travelling}</span> items have not reached Earth yet;
              the acknowledgement opens when all have arrived (remaining <span className="console-num">{formatCountdown(lastArrival - now)}</span>, simulated).
            </p>
          ) : null}
          <Button variant="primary" icon="check" loading={acking} disabled={travelling > 0 || packet.item_count === 0} onClick={() => void ack()}>
            Acknowledge (ack)
          </Button>
          {packet.item_count === 0 && <p className="console-muted">No new items to acknowledge.</p>}
        </div>
      )}

      {problem && (
        <div className={`console-problem console-problem--${problem.kind}`} role="alert">
          <Icon name={problem.kind === 'forbidden' ? 'lock' : 'warning'} size={16} />
          <div>
            <strong>{problem.title}</strong>
            {problem.detail && <p>{problem.detail}</p>}
          </div>
          {problem.kind === 'changed' && (
            <Button size="sm" variant="secondary" icon="refresh" onClick={() => void prepare()}>
              Prepare again
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
