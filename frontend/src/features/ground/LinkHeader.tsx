// Link + light-delay header with a small Earth <-> habitat signal visual.
import type { ApiError } from '../../lib/api';
import { Icon, type IconName } from '../../ui';
import { formatDuration, formatTime } from './format';
import type { SyncStatusRead } from './types';

type LinkState = 'UP' | 'LOCAL' | 'NO_SERVICE' | 'OFFLINE' | 'WAIT';

const STATE_INFO: Record<LinkState, { label: string; icon: IconName; detail: string }> = {
  UP: {
    label: 'Delayed link',
    icon: 'signal',
    detail: 'The system runs autonomously on board; packets go to the ground teams during the link window.',
  },
  LOCAL: {
    label: 'Local demo',
    icon: 'offline',
    detail: 'Earth link is not simulated; packets can be prepared and downloaded manually.',
  },
  NO_SERVICE: {
    label: 'No sync service',
    icon: 'offline',
    detail: '/v1/sync is not on this server yet. To preview, add ?mock=1 to the address.',
  },
  OFFLINE: {
    label: 'Cannot reach the ship server',
    icon: 'x',
    detail: 'The interface shows the last known data; it refreshes when the connection returns.',
  },
  WAIT: { label: 'Getting status…', icon: 'hourglass', detail: 'Querying sync status.' },
};

export function LinkHeader(props: {
  status: SyncStatusRead | null;
  error: ApiError | null;
  offline: boolean;
  mock: boolean;
}) {
  const { status, error, offline, mock } = props;
  let state: LinkState = 'WAIT';
  if (offline) state = 'OFFLINE';
  else if (error?.status === 404) state = 'NO_SERVICE';
  else if (status) state = status.link_delay_seconds == null ? 'LOCAL' : 'UP';
  const info = STATE_INFO[state];
  const delay = status?.link_delay_seconds ?? null;
  // Signal pulse speed follows the delay (clamped so it stays readable).
  const pulse = delay == null ? 4 : Math.min(9, Math.max(2.5, delay / 120));
  const pendingTotal = status?.recipients.reduce((a, r) => a + (r.pending_items || 0), 0) ?? null;

  return (
    <div className={`gp-link gp-link--${state.toLowerCase()}`}>
      <svg
        className="gp-signal"
        viewBox="0 0 240 64"
        aria-hidden="true"
        focusable="false"
        style={{ ['--gp-pulse' as string]: `${pulse}s` }}
      >
        {/* Flat outlines: Earth (left) and habitat (right); no gradients. */}
        <circle cx="26" cy="32" r="18" className="gp-signal-body" />
        <path d="M10 28h32M10 36h32M26 14c-6 6-6 30 0 36M26 14c6 6 6 30 0 36" className="gp-signal-grid" />
        <circle cx="214" cy="32" r="16" className="gp-signal-body" />
        <rect x="204" y="10" width="20" height="8" rx="2" className="gp-signal-hab" />
        <line x1="44" y1="32" x2="198" y2="32" className="gp-signal-path" />
        {state === 'UP' || state === 'LOCAL' ? (
          <>
            <circle r="3.2" cx="44" cy="32" className="gp-signal-dot gp-signal-dot--down" />
            <circle r="3.2" cx="198" cy="32" className="gp-signal-dot gp-signal-dot--up" />
          </>
        ) : (
          <g className="gp-signal-cut">
            <line x1="114" y1="22" x2="126" y2="42" />
            <line x1="126" y1="22" x2="114" y2="42" />
          </g>
        )}
        <text x="26" y="62" textAnchor="middle" className="gp-signal-label">Earth</text>
        <text x="214" y="62" textAnchor="middle" className="gp-signal-label">Habitat</text>
      </svg>

      <div className="gp-link-text">
        <p className="gp-link-state" role="status">
          <span aria-hidden="true" className="gp-link-icon"><Icon name={info.icon} size={16} /></span>
          <strong>{info.label}</strong>
          {mock && <span className="gp-tag">Sample data (?mock=1)</span>}
        </p>
        <p className="gp-link-delay">
          {state === 'NO_SERVICE' || state === 'WAIT' || (state === 'OFFLINE' && !status)
            ? 'Delay data could not be loaded'
            : delay == null
              ? 'No delay data (local demo)'
              : (
                <>
                  One-way delay ≈ <strong>{formatDuration(delay)}</strong>
                  <span className="gp-muted"> · round trip ≈ {formatDuration(delay * 2)}</span>
                </>
              )}
        </p>
        <p className="gp-muted gp-small">{info.detail}</p>
      </div>

      {status && (
        <dl className="gp-link-stats">
          <div>
            <dt>Pending priority</dt>
            <dd className={status.pending_escalations > 0 ? 'gp-hot' : undefined}>{status.pending_escalations}</dd>
          </div>
          <div>
            <dt>Unsent items</dt>
            <dd>{pendingTotal}</dd>
          </div>
          <div>
            <dt>Status time</dt>
            <dd className="gp-small">{formatTime(status.generated_at)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
