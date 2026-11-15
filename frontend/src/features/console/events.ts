// Turns API data (alerts, escalations) and this console's own acks into the
// link events both timelines render. No new data is invented: titles and
// times come straight from the API; only the arrival moment is simulated.
import { toAttention } from '../../ui';
import type { Attention } from '../../lib/store';
import { parseTime } from './delay';
import { transitOf, type SeenEntry, type Tracker, type Transit } from './transit';
import { ALERT_STATUS_LABEL, type AlertRead, type EscalationRead, type Recipient } from './types';

/** An acknowledgement this console sent (POST /v1/sync/ack response + packet facts). */
export interface LocalAck {
  id: string;
  recipient: Recipient;
  recipientLabel: string;
  itemCount: number;
  sha256: string;
  ackedAt: string;
  ackedBy: string;
  escalationIds: string[];
}

export type EventKind = 'ALERT' | 'ESCALATION' | 'PACKET_ACK' | 'ESCALATION_ACK';

export interface LinkEvent {
  key: string;
  /** down = ship -> Earth, up = Earth -> ship. */
  dir: 'down' | 'up';
  kind: EventKind;
  title: string;
  detail: string | null;
  attention: Attention | null;
  /** Server timestamp of the event itself (ms), if any. */
  eventAt: number | null;
  transit: Transit;
  escalation?: EscalationRead;
}

export const KIND_TEXT: Record<EventKind, string> = {
  ALERT: 'Alarm opened',
  ESCALATION: 'Flight surgeon notification',
  PACKET_ACK: 'Packet acknowledgement',
  ESCALATION_ACK: 'Notification acknowledgement',
};

function firstSentence(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  const i = t.search(/[.!?](\s|$)/);
  return i > 0 ? t.slice(0, i + 1) : t;
}

export function seenEntries(alerts: AlertRead[], escalations: EscalationRead[]): SeenEntry[] {
  const out: SeenEntry[] = [];
  for (const a of alerts) out.push({ key: `ALERT:${a.id}`, eventAt: parseTime(a.opened_at) });
  for (const e of escalations) {
    out.push({ key: `ESCALATION:${e.id}`, eventAt: parseTime(e.created_at) });
    if (e.status === 'ACKED') out.push({ key: `ESCACK:${e.id}`, eventAt: parseTime(e.acked_at) });
  }
  return out;
}

export function buildEvents(
  alerts: AlertRead[],
  escalations: EscalationRead[],
  acks: LocalAck[],
  tracker: Tracker,
  now: number,
  delaySeconds: number,
  compression: number,
): LinkEvent[] {
  const at = (key: string) => transitOf(tracker.get(key), now, delaySeconds, compression);
  const events: LinkEvent[] = [];

  for (const a of alerts) {
    const key = `ALERT:${a.id}`;
    const status = ALERT_STATUS_LABEL[a.status] ?? a.status;
    events.push({
      key,
      dir: 'down',
      kind: 'ALERT',
      title: firstSentence(a.explanation) ?? a.rule_id,
      detail: `${a.target_id} · ${a.rule_id} · ${status}`,
      attention: toAttention(a.health_attention),
      eventAt: parseTime(a.opened_at),
      transit: at(key),
    });
  }

  const ackedHere = new Set(acks.flatMap((k) => k.escalationIds));
  for (const e of escalations) {
    const key = `ESCALATION:${e.id}`;
    events.push({
      key,
      dir: 'down',
      kind: 'ESCALATION',
      title: e.summary_tr,
      detail: e.crew_member_id ? `Crew member: ${e.crew_member_id}` : null,
      attention: toAttention(e.priority),
      eventAt: parseTime(e.created_at),
      transit: at(key),
      escalation: e,
    });
    // Acked by someone else (or before this console opened): its ack travels too.
    if (e.status === 'ACKED' && !ackedHere.has(e.id)) {
      const ackKey = `ESCACK:${e.id}`;
      events.push({
        key: ackKey,
        dir: 'up',
        kind: 'ESCALATION_ACK',
        title: 'Ground team acknowledged the notification',
        detail: e.crew_member_id ? `Crew member: ${e.crew_member_id}` : null,
        attention: null,
        eventAt: parseTime(e.acked_at),
        transit: at(ackKey),
        escalation: e,
      });
    }
  }

  for (const k of acks) {
    const key = `ACK:${k.id}`;
    events.push({
      key,
      dir: 'up',
      kind: 'PACKET_ACK',
      title: `${k.recipientLabel}: packet receipt acknowledged`,
      detail: `${k.itemCount} items · sha256 ${k.sha256.slice(0, 12)} · ${k.ackedBy}${k.escalationIds.length ? ` · ${k.escalationIds.length} notifications acknowledged` : ''}`,
      attention: null,
      eventAt: parseTime(k.ackedAt),
      transit: at(key),
    });
  }
  return events;
}

/** Newest first by the event's own time (fallback: departure). */
export function byNewest(a: LinkEvent, b: LinkEvent): number {
  return (b.eventAt ?? b.transit.departAt) - (a.eventAt ?? a.transit.departAt);
}

/**
 * Ship-side view of an escalation's ground acknowledgement (display-only):
 * the ack reaches the ship only after the uplink delay.
 */
export function shipAckState(e: EscalationRead, events: LinkEvent[], acks: LocalAck[]): Transit | null {
  const local = acks.find((k) => k.escalationIds.includes(e.id));
  const key = local ? `ACK:${local.id}` : `ESCACK:${e.id}`;
  return events.find((ev) => ev.key === key)?.transit ?? null;
}
