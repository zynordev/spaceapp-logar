// The link between ship and Earth: a quiet line with one dot per item in
// transit (position = real progress, not decoration) and the "yolda" queue.
import { AttentionBadge, Icon } from '../../ui';
import { clock, formatCountdown, formatDelay } from './delay';
import { KIND_TEXT, type LinkEvent } from './events';

const X0 = 64;
const X1 = 936;

export interface SignalLinkProps {
  inTransit: LinkEvent[];
  delaySeconds: number;
  compression: number;
  reducedMotion: boolean;
}

export function SignalLink({ inTransit, delaySeconds, compression, reducedMotion }: SignalLinkProps) {
  const down = inTransit.filter((e) => e.dir === 'down').length;
  const up = inTransit.length - down;
  const shown = delaySeconds / compression;
  return (
    <section className="console-link-band" aria-labelledby="console-link-title">
      <div className="console-link-band__head">
        <h2 id="console-link-title" className="console-side__title">
          Bağlantı — tek yön gecikme
        </h2>
        <p className="console-link-band__facts">
          <span className="console-num console-num--lg">{formatDelay(delaySeconds)}</span>
          {compression > 1 && (
            <span className="console-link-band__shown">
              gösterimde <span className="console-num">{formatDelay(shown)}</span> ({compression}× hızlı)
            </span>
          )}
        </p>
      </div>

      <svg
        className={`console-wire${reducedMotion ? ' console-wire--still' : ''}`}
        viewBox="0 0 1000 64"
        role="img"
        aria-label={`Yolda: gemiden Dünya'ya ${down}, Dünya'dan gemiye ${up} öğe`}
      >
        <line x1={X0} y1={24} x2={X1} y2={24} className="console-wire__line" />
        <line x1={X0} y1={40} x2={X1} y2={40} className="console-wire__line console-wire__line--up" />
        {!reducedMotion && inTransit.length > 0 && <line x1={X0} y1={24} x2={X1} y2={24} className="console-wire__flow" />}
        <rect x={X0 - 14} y={18} width={28} height={28} rx={6} className="console-wire__node" />
        <circle cx={X1} cy={32} r={14} className="console-wire__node" />
        {inTransit.map((e) => {
          const p = e.transit.progress;
          const x = e.dir === 'down' ? X0 + (X1 - X0) * p : X1 - (X1 - X0) * p;
          return (
            <circle
              key={e.key}
              cx={0}
              cy={e.dir === 'down' ? 24 : 40}
              r={5}
              className={`console-wire__dot console-wire__dot--${e.dir}`}
              style={{ transform: `translateX(${x}px)` }}
            />
          );
        })}
      </svg>
      <div className="console-wire__labels" aria-hidden="true">
        <span>
          <Icon name="satellite" size={14} /> Gemi
        </span>
        <span>
          Dünya <Icon name="signal" size={14} />
        </span>
      </div>

      <div className="console-queue">
        <h3 className="console-queue__title">
          <Icon name="clock" size={16} /> Yolda <span className="console-num">{inTransit.length}</span>
        </h3>
        {inTransit.length === 0 ? (
          <p className="console-muted">Şu an yolda öğe yok.</p>
        ) : (
          <ul className="console-queue__list">
            {inTransit.map((e) => (
              <li key={e.key} className="console-queue__item">
                <span className="console-queue__dir">
                  <Icon name={e.dir === 'down' ? 'arrow-down' : 'arrow-up'} size={14} />
                  {e.dir === 'down' ? "Gemi → Dünya" : 'Dünya → gemi'}
                </span>
                <span className="console-queue__what">
                  {KIND_TEXT[e.kind]}
                  {e.attention && <AttentionBadge level={e.attention} size="sm" />}
                </span>
                <span className="console-queue__eta">
                  kalan <span className="console-num console-num--md">{formatCountdown(e.transit.remainingMs)}</span>
                  <span className="console-muted"> · varış {clock(e.transit.arriveAt)}</span>
                </span>
                <span
                  className="console-queue__bar"
                  role="progressbar"
                  aria-label={`${KIND_TEXT[e.kind]} ilerleme`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(e.transit.progress * 100)}
                >
                  <span style={{ width: `${Math.round(e.transit.progress * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
