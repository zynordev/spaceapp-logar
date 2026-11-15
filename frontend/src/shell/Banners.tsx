import { useApp } from '../lib/store';
import { Icon } from '../ui';

export const DISCLAIMER =
  "Prototype decision-support tool. It does not diagnose or recommend treatment. 'DEMO'-labelled thresholds await expert validation.";

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
        <strong>Cannot reach the server.</strong> Showing the last known data; retrying automatically.
      </span>
    </div>
  );
}
