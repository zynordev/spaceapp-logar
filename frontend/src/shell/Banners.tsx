import { useApp } from '../lib/store';
import { Icon } from '../ui';

export const DISCLAIMER =
  "Prototip karar-destek aracıdır. Teşhis koymaz, tedavi önermez. 'DEMO' etiketli eşikler uzman doğrulaması bekliyor.";

/** Always visible; never dismissable. */
export function DisclaimerBand() {
  return (
    <div className="shell-disclaimer" role="note">
      <Icon name="warning" size={16} />
      <span>{DISCLAIMER}</span>
    </div>
  );
}

export function OfflineBanner() {
  const offline = useApp((s) => s.offline);
  if (!offline) return null;
  return (
    <div className="shell-offline" role="alert">
      <Icon name="offline" size={18} />
      <span>
        <strong>Sunucuya ulaşılamıyor.</strong> Son bilinen veriler gösteriliyor; otomatik yeniden deneniyor.
      </span>
    </div>
  );
}
