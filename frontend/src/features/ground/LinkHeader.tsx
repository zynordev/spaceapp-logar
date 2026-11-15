// Link + light-delay header with a small Earth <-> habitat signal visual.
import type { ApiError } from '../../lib/api';
import { Icon, type IconName } from '../../ui';
import { formatDuration, formatTime } from './format';
import type { SyncStatusRead } from './types';

type LinkState = 'UP' | 'LOCAL' | 'NO_SERVICE' | 'OFFLINE' | 'WAIT';

const STATE_INFO: Record<LinkState, { label: string; icon: IconName; detail: string }> = {
  UP: {
    label: 'Gecikmeli bağlantı',
    icon: 'signal',
    detail: 'Sistem gemide otonom çalışıyor; paketler bağlantı penceresinde yer ekiplerine gider.',
  },
  LOCAL: {
    label: 'Yerel demo',
    icon: 'offline',
    detail: 'Dünya bağlantısı simüle edilmiyor; paketler hazırlanıp elle indirilebilir.',
  },
  NO_SERVICE: {
    label: 'Senkronizasyon servisi yok',
    icon: 'offline',
    detail: 'Bu sunucuda /v1/sync henüz yok. Önizleme için adrese ?mock=1 ekleyin.',
  },
  OFFLINE: {
    label: 'Gemi sunucusuna ulaşılamıyor',
    icon: 'x',
    detail: 'Arayüz son bilinen verileri gösteriyor; bağlantı dönünce yenilenir.',
  },
  WAIT: { label: 'Durum alınıyor…', icon: 'hourglass', detail: 'Senkronizasyon durumu sorgulanıyor.' },
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
        <defs>
          <radialGradient id="gp-earth" cx="35%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#7cc4ff" />
            <stop offset="60%" stopColor="#2a6fd6" />
            <stop offset="100%" stopColor="#0d2c63" />
          </radialGradient>
          <radialGradient id="gp-mars" cx="35%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#ffb38a" />
            <stop offset="60%" stopColor="#c8512a" />
            <stop offset="100%" stopColor="#5a1f0e" />
          </radialGradient>
        </defs>
        <circle cx="26" cy="32" r="18" fill="url(#gp-earth)" />
        <path d="M14 26 q8 -6 14 0 t12 2" stroke="#9fe3b0" strokeWidth="2.4" fill="none" opacity=".7" />
        <circle cx="214" cy="32" r="16" fill="url(#gp-mars)" />
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
        <text x="26" y="62" textAnchor="middle" className="gp-signal-label">Dünya</text>
        <text x="214" y="62" textAnchor="middle" className="gp-signal-label">Habitat</text>
      </svg>

      <div className="gp-link-text">
        <p className="gp-link-state" role="status">
          <span aria-hidden="true" className="gp-link-icon"><Icon name={info.icon} size={16} /></span>
          <strong>{info.label}</strong>
          {mock && <span className="gp-tag">Örnek veri (?mock=1)</span>}
        </p>
        <p className="gp-link-delay">
          {state === 'NO_SERVICE' || state === 'WAIT' || (state === 'OFFLINE' && !status)
            ? 'Gecikme bilgisi alınamadı'
            : delay == null
              ? 'Gecikme bilgisi yok (yerel demo)'
              : (
                <>
                  Tek yön gecikme ≈ <strong>{formatDuration(delay)}</strong>
                  <span className="gp-muted"> · gidiş-dönüş ≈ {formatDuration(delay * 2)}</span>
                </>
              )}
        </p>
        <p className="gp-muted gp-small">{info.detail}</p>
      </div>

      {status && (
        <dl className="gp-link-stats">
          <div>
            <dt>Bekleyen öncelikli</dt>
            <dd className={status.pending_escalations > 0 ? 'gp-hot' : undefined}>{status.pending_escalations}</dd>
          </div>
          <div>
            <dt>Gönderilmemiş öğe</dt>
            <dd>{pendingTotal}</dd>
          </div>
          <div>
            <dt>Durum zamanı</dt>
            <dd className="gp-small">{formatTime(status.generated_at)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
