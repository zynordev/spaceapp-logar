// Flight-surgeon priority escalations (ALERT/CRITICAL), pending first.
import type { ApiError } from '../../lib/api';
import { formatAgo, formatTime, PRIORITY_INFO, shortHash } from './format';
import type { EscalationRead } from './types';
import { errorText } from './useGround';

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, ALERT: 1 };

export function Escalations(props: {
  items: EscalationRead[] | null;
  error: ApiError | null;
  loading: boolean;
}) {
  const { items, error, loading } = props;
  const sorted = [...(items ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'PENDING' ? -1 : 1;
    const p = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (p !== 0 && a.status === 'PENDING') return p;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
  const pending = sorted.filter((e) => e.status === 'PENDING').length;
  const err = errorText(error, '/v1/sync/escalations');

  return (
    <section className="gp-card gp-esc" aria-labelledby="gp-esc-title">
      <header className="gp-card-head">
        <h3 id="gp-esc-title">
          <span aria-hidden="true">✚ </span>Uçuş cerrahına öncelikli bildirimler
        </h3>
        {items && (
          <span className={`gp-count ${pending > 0 ? 'gp-count--hot' : ''}`}>
            {pending > 0 ? `${pending} bekliyor` : 'Bekleyen yok'}
          </span>
        )}
      </header>
      <p className="gp-muted gp-small">
        Uyarı veya Kritik seviyede açılan her uyarı için otomatik oluşur ve uçuş cerrahı paketine öncelikli girer.
      </p>

      {err && <p className={`gp-note ${error?.status === 404 ? '' : 'gp-note--warn'}`}>{err}</p>}
      {!items && !err && loading && <p className="gp-muted">Yükleniyor…</p>}
      {items && sorted.length === 0 && (
        <p className="gp-empty">Öncelikli bildirim yok. Uyarı/Kritik açıldığında burada görünür.</p>
      )}

      {sorted.length > 0 && (
        <ul className="gp-esc-list">
          {sorted.map((e) => {
            const pr = PRIORITY_INFO[e.priority] ?? { label: e.priority, icon: '▲' };
            const acked = e.status === 'ACKED';
            return (
              <li
                key={e.id}
                className={`gp-esc-item gp-pr--${e.priority.toLowerCase()} ${acked ? 'gp-esc-item--acked' : ''}`}
              >
                <div className="gp-esc-top">
                  <span className={`gp-badge gp-badge--${e.priority.toLowerCase()}`}>
                    <span aria-hidden="true">{pr.icon} </span>
                    {pr.label}
                  </span>
                  <span className={`gp-badge ${acked ? 'gp-badge--ok' : 'gp-badge--pending'}`}>
                    <span aria-hidden="true">{acked ? '✓ ' : '⧗ '}</span>
                    {acked ? 'Onaylandı' : 'Bekliyor'}
                  </span>
                  <span className="gp-esc-crew">
                    {e.crew_member_id ? `Ekip üyesi: ${e.crew_member_id}` : 'Ortam / modül'}
                  </span>
                </div>
                <p className="gp-esc-summary">{e.summary_tr}</p>
                <p className="gp-esc-meta gp-small">
                  <time dateTime={e.created_at}>{formatTime(e.created_at)}</time>
                  <span className="gp-muted"> ({formatAgo(e.created_at)})</span>
                  {acked && e.acked_at && (
                    <>
                      {' · onay '}
                      <time dateTime={e.acked_at}>{formatTime(e.acked_at)}</time>
                    </>
                  )}
                  {' · '}
                  <span className="gp-muted">SHA-256 </span>
                  <code title={e.packet_sha256} className="gp-hash">{shortHash(e.packet_sha256)}</code>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
