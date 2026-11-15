// One side of the link: "Gemi (anlık)" or "Dünya (gecikmeli)".
import type { ReactNode } from 'react';
import { AttentionBadge, EmptyState, Icon, attentionClass } from '../../ui';
import { clock, formatCountdown } from './delay';
import { KIND_TEXT, shipAckState, type LinkEvent, type LocalAck } from './events';

export interface TimelineProps {
  side: 'ship' | 'earth';
  title: string;
  subtitle: string;
  status: ReactNode;
  events: LinkEvent[];
  /** All events (ship side looks up the ack of each escalation). */
  allEvents: LinkEvent[];
  acks: LocalAck[];
  empty: string;
}

function whenText(ev: LinkEvent, side: 'ship' | 'earth'): { label: string; time: string } {
  const own = side === 'ship' ? ev.dir === 'down' : ev.dir === 'up';
  if (own) return { label: ev.dir === 'down' ? 'Gemide' : 'Gönderildi', time: clock(ev.eventAt ?? ev.transit.departAt) };
  if (ev.transit.phase === 'before') return { label: 'Önceden ulaştı', time: clock(ev.transit.arriveAt) };
  return { label: 'Ulaştı', time: clock(ev.transit.arriveAt) };
}

function ShipAck({ ev, allEvents, acks }: { ev: LinkEvent; allEvents: LinkEvent[]; acks: LocalAck[] }) {
  if (!ev.escalation) return null;
  const t = shipAckState(ev.escalation, allEvents, acks);
  if (!t) {
    return (
      <p className="console-tl__note">
        <Icon name="hourglass" size={14} /> Yer onayı: henüz yok
      </p>
    );
  }
  if (t.phase === 'transit') {
    return (
      <p className="console-tl__note">
        <Icon name="arrow-up" size={14} /> Yer onayı yolda — gemiye kalan <span className="console-num">{formatCountdown(t.remainingMs)}</span>
      </p>
    );
  }
  return (
    <p className="console-tl__note console-tl__note--ok">
      <Icon name="check" size={14} /> Yer onayı gemiye ulaştı · {clock(t.arriveAt)}
    </p>
  );
}

export function Timeline({ side, title, subtitle, status, events, allEvents, acks, empty }: TimelineProps) {
  return (
    <section className={`console-side console-side--${side}`} aria-labelledby={`console-tl-${side}`}>
      <header className="console-side__head">
        <Icon name={side === 'ship' ? 'satellite' : 'signal'} size={20} />
        <div>
          <h2 id={`console-tl-${side}`} className="console-side__title">
            {title}
          </h2>
          <p className="console-side__sub">{subtitle}</p>
        </div>
      </header>
      <div className="console-side__status">{status}</div>
      {events.length === 0 ? (
        <EmptyState compact icon={side === 'ship' ? 'check' : 'hourglass'} title={empty} />
      ) : (
        <ol className="console-tl" tabIndex={0} aria-label={`${title} olay listesi`}>
          {events.map((ev) => {
            const w = whenText(ev, side);
            const incoming = side === 'ship' ? ev.dir === 'up' : ev.dir === 'down';
            return (
              <li key={ev.key} className={`console-tl__item ${ev.attention ? attentionClass(ev.attention) : 'console-tl__item--ack'}`}>
                <div className="console-tl__time">
                  <span className="console-tl__when">{w.label}</span>
                  <span className="console-num">{w.time}</span>
                </div>
                <div className="console-tl__body">
                  <div className="console-tl__row">
                    <span className="console-tl__kind">
                      <Icon name={ev.dir === 'down' ? 'arrow-down' : 'arrow-up'} size={14} />
                      {KIND_TEXT[ev.kind]}
                    </span>
                    {ev.attention && <AttentionBadge level={ev.attention} size="sm" />}
                    {incoming && ev.transit.phase === 'before' && <span className="console-tl__tag">konsol açılmadan önce ulaştı</span>}
                  </div>
                  <p className="console-tl__title">{ev.title}</p>
                  {ev.detail && <p className="console-tl__detail">{ev.detail}</p>}
                  {side === 'ship' && ev.kind === 'ESCALATION' && <ShipAck ev={ev} allEvents={allEvents} acks={acks} />}
                  {side === 'earth' && ev.escalation && ev.kind === 'ESCALATION' && (
                    <p className={`console-tl__note${ev.escalation.status === 'ACKED' ? ' console-tl__note--ok' : ''}`}>
                      <Icon name={ev.escalation.status === 'ACKED' ? 'check' : 'bell'} size={14} />
                      {ev.escalation.status === 'ACKED' ? 'Yer ekibi onayladı' : 'Onay bekliyor'}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
