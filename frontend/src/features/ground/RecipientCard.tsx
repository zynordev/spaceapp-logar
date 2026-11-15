// One ground team: what is routed there, pending count, packet prepare/download/ack.
import { useId, useState } from 'react';
import { api, ApiError, qs } from '../../lib/api';
import { useApp } from '../../lib/store';
import { formatAgo, formatTime, kindLabel, RECIPIENT_INFO, shortHash, slug } from './format';
import { mockAck, mockPacket } from './mock';
import type { Recipient, RecipientStatus, SyncAckRead, SyncPacketRead } from './types';
import { serverMessage } from './useGround';

type Phase =
  | { k: 'idle' }
  | { k: 'loading' }
  | { k: 'ready'; packet: SyncPacketRead }
  | { k: 'acking'; packet: SyncPacketRead }
  | { k: 'acked'; packet: SyncPacketRead; ack: SyncAckRead };

function ackError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return 'Yalnız yer ekibi onaylayabilir.';
    if (e.status === 409) return 'Paket değişti, yeniden hazırla.';
    if (e.status === 404) return 'Onay uç noktası sunucuda henüz yok (/v1/sync/ack).';
    if (e.status === 0) return 'Sunucuya ulaşılamıyor — onay gönderilemedi.';
    return serverMessage(e);
  }
  return String(e);
}

function packetError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return 'Paket uç noktası sunucuda henüz yok (/v1/sync/packet). Önizleme için ?mock=1 ekleyin.';
    if (e.status === 0) return 'Sunucuya ulaşılamıyor — paket hazırlanamadı.';
    if (e.status === 403) return 'Bu paketi hazırlama yetkiniz yok.';
    return serverMessage(e);
  }
  return String(e);
}

function download(packet: SyncPacketRead) {
  const stamp = packet.generated_at.replace(/[-:]/g, '').replace(/\.\d+/, '');
  const name = `logar-paket_${slug(packet.mission_id)}_${slug(packet.recipient)}_${slug(stamp)}.json`;
  const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RecipientCard(props: {
  recipient: Recipient;
  status: RecipientStatus | null;
  missionId: string;
  mock: boolean;
  canAck: boolean;
  ackHint: string | null;
}) {
  const { recipient, status, missionId, mock, canAck, ackHint } = props;
  const info = RECIPIENT_INFO[recipient];
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [msg, setMsg] = useState<{ text: string; tone: 'warn' | 'ok' | 'info' } | null>(null);
  const bumpData = useApp((s) => s.bumpData);
  const baseId = useId();
  const pending = status?.pending_items ?? null;

  const prepare = async () => {
    setPhase({ k: 'loading' });
    setMsg(null);
    try {
      const packet = mock
        ? await mockPacket(recipient)
        : await api<SyncPacketRead>('GET', `/v1/sync/packet${qs({ mission_id: missionId, recipient })}`);
      setPhase({ k: 'ready', packet });
    } catch (e) {
      setPhase({ k: 'idle' });
      setMsg({ text: packetError(e), tone: e instanceof ApiError && e.status === 404 ? 'info' : 'warn' });
    }
  };

  const ack = async (packet: SyncPacketRead) => {
    setPhase({ k: 'acking', packet });
    setMsg(null);
    const body = {
      mission_id: packet.mission_id,
      recipient: packet.recipient,
      packet_id: packet.packet_id,
      sha256: packet.sha256,
      until: packet.until,
    };
    try {
      const res = mock ? await mockAck(body) : await api<SyncAckRead>('POST', '/v1/sync/ack', body);
      if (mock) bumpData();
      setPhase({ k: 'acked', packet, ack: res });
      setMsg({ text: `Onaylandı: ${formatTime(res.acked_at)} · ${res.acked_by}`, tone: 'ok' });
    } catch (e) {
      const conflict = e instanceof ApiError && e.status === 409;
      setPhase(conflict ? { k: 'idle' } : { k: 'ready', packet });
      setMsg({ text: ackError(e), tone: 'warn' });
    }
  };

  const packet = phase.k === 'ready' || phase.k === 'acking' || phase.k === 'acked' ? phase.packet : null;
  const kinds = new Map<string, number>();
  for (const it of packet?.items ?? []) kinds.set(it.kind, (kinds.get(it.kind) ?? 0) + 1);

  return (
    <article className={`gp-card gp-rcp gp-rcp--${recipient.toLowerCase()}`} aria-labelledby={`${baseId}-t`}>
      <header className="gp-rcp-head">
        <span className="gp-rcp-icon" aria-hidden="true">{info.icon}</span>
        <div>
          <h4 id={`${baseId}-t`}>{status?.label_tr || info.label}</h4>
          <p className="gp-muted gp-small">{info.routed}</p>
        </div>
      </header>

      <dl className="gp-rcp-stats">
        <div>
          <dt>Bekleyen öğe</dt>
          <dd className={pending ? 'gp-hot' : undefined}>{pending ?? '—'}</dd>
        </div>
        <div>
          <dt>Son onay</dt>
          <dd className="gp-small">
            {status?.last_ack_at ? (
              <>
                <time dateTime={status.last_ack_at}>{formatTime(status.last_ack_at)}</time>
                <span className="gp-muted"> ({formatAgo(status.last_ack_at)})</span>
              </>
            ) : (
              'Henüz yok'
            )}
          </dd>
        </div>
      </dl>

      <div className="gp-actions">
        <button
          type="button"
          className="gp-btn"
          onClick={prepare}
          disabled={phase.k === 'loading' || phase.k === 'acking'}
          aria-describedby={`${baseId}-t`}
        >
          {phase.k === 'loading' ? 'Hazırlanıyor…' : packet ? 'Yeniden hazırla' : 'Paketi hazırla'}
        </button>
      </div>

      {packet && (
        <div className="gp-packet" role="group" aria-label={`${info.label} paket önizlemesi`}>
          <dl className="gp-packet-grid">
            <div>
              <dt>Öğe</dt>
              <dd>{packet.item_count}</dd>
            </div>
            <div>
              <dt>Aralık</dt>
              <dd className="gp-small">
                {packet.since ? formatTime(packet.since) : 'Başlangıçtan'} → {formatTime(packet.until)}
              </dd>
            </div>
            <div className="gp-packet-wide">
              <dt>SHA-256</dt>
              <dd>
                <code className="gp-hash" title={packet.sha256}>{shortHash(packet.sha256, 16)}</code>
              </dd>
            </div>
            <div className="gp-packet-wide">
              <dt>İmza</dt>
              <dd>
                {packet.signature ? (
                  <span className="gp-badge gp-badge--ok">
                    <span aria-hidden="true">✓ </span>
                    {packet.signature_alg ?? 'HMAC-SHA256'} imzalı
                  </span>
                ) : (
                  <span className="gp-badge gp-badge--muted">
                    <span aria-hidden="true">○ </span>İmzasız (demo)
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {kinds.size > 0 ? (
            <ul className="gp-kinds" aria-label="Öğe türleri">
              {[...kinds.entries()].map(([k, n]) => (
                <li key={k} className={`gp-kind gp-kind--${k.toLowerCase()}`}>
                  {kindLabel(k)} <strong>{n}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gp-empty gp-small">Paket boş — son onaydan bu yana yeni öğe yok.</p>
          )}

          {packet.items.length > 0 && (
            <details className="gp-items">
              <summary>Öğeleri göster ({packet.items.length})</summary>
              <ol>
                {packet.items.slice(0, 50).map((it) => (
                  <li key={`${it.kind}-${it.id}`}>
                    <span className="gp-kind-mini">{kindLabel(it.kind)}</span>{' '}
                    <time dateTime={it.occurred_at} className="gp-muted gp-small">{formatTime(it.occurred_at)}</time>
                    <div>{it.summary_tr}</div>
                  </li>
                ))}
              </ol>
              {packet.items.length > 50 && (
                <p className="gp-muted gp-small">İlk 50 öğe gösteriliyor; tamamı JSON dosyasında.</p>
              )}
            </details>
          )}

          <div className="gp-actions">
            <button type="button" className="gp-btn gp-btn--ghost" onClick={() => download(packet)}>
              <span aria-hidden="true">⇩ </span>JSON indir
            </button>
            <button
              type="button"
              className="gp-btn gp-btn--primary"
              onClick={() => ack(packet)}
              disabled={!canAck || phase.k === 'acking' || phase.k === 'acked'}
              aria-describedby={ackHint ? `${baseId}-hint` : undefined}
            >
              {phase.k === 'acking' ? 'Onaylanıyor…' : phase.k === 'acked' ? '✓ Onaylandı' : 'Yer ekibi onayı (ack)'}
            </button>
          </div>
          {ackHint && (
            <p id={`${baseId}-hint`} className="gp-muted gp-small">{ackHint}</p>
          )}
        </div>
      )}

      <p className={`gp-msg ${msg ? `gp-msg--${msg.tone}` : ''}`} role="status" aria-live="polite">
        {msg?.text ?? ''}
      </p>
    </article>
  );
}
