import { ALERT_STATUS, QUALITY, attInfo } from './copy';
import { Icon } from '../../ui';

export function AttBadge({ att, size = 'md' }: { att: string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const a = attInfo(att);
  return (
    <span className={`vt-badge vt-att-${a.cls} vt-badge-${size}`} title={a.desc}>
      <span className="vt-bi" aria-hidden="true"><Icon name={a.icon} size={12} /></span>
      {a.label}
    </span>
  );
}

export function QualityBadge({ q, prefix = 'Veri' }: { q: string | null | undefined; prefix?: string }) {
  const d = (q && QUALITY[q]) || { label: q || '—', icon: 'question' as const, cls: 'missing' };
  return (
    <span className={`vt-badge vt-q-${d.cls}`} title="Veri kalitesi">
      <span className="vt-bi" aria-hidden="true"><Icon name={d.icon} size={12} /></span>
      {prefix ? `${prefix}: ${d.label}` : d.label}
    </span>
  );
}

export function ValidationBadge({ v }: { v: string | null | undefined }) {
  if (!v) return null;
  if (v === 'APPROVED') {
    return (
      <span className="vt-badge vt-val-approved" title="Eşik ve kart kaynağıyla doğrulanmış">
        <span className="vt-bi" aria-hidden="true"><Icon name="check" size={12} /></span>Doğrulanmış
      </span>
    );
  }
  if (v.startsWith('DEMO')) {
    return (
      <span className="vt-badge vt-val-demo" title="DEMO eşik — uçuş tıbbı uzmanı doğrulaması bekliyor">
        <span className="vt-bi" aria-hidden="true"><Icon name="flask" size={12} /></span>DEMO
      </span>
    );
  }
  return <span className="vt-badge vt-q-missing">{v}</span>;
}

export function StatusBadge({ s }: { s: string }) {
  const d = ALERT_STATUS[s] || { label: s || '—', icon: 'question' as const, cls: 'res' };
  return (
    <span className={`vt-badge vt-st-${d.cls}`}>
      <span className="vt-bi" aria-hidden="true"><Icon name={d.icon} size={12} /></span>
      {d.label}
    </span>
  );
}

export function Skeleton({ lines = 3, height = 14 }: { lines?: number; height?: number }) {
  return (
    <div className="vt-skel-wrap" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="vt-skel" style={{ height, width: `${92 - i * 14}%` }} />
      ))}
    </div>
  );
}
