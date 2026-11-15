// Small entry point to the ground console (#/yer) for the HUD / top bar.
// Import it from this file (not the folder index) to keep the console in its
// own lazily loaded chunk: import { GroundConsoleLink } from '../console/GroundConsoleLink';
import { Icon } from '../../ui';
import './console-link.css';

export const GROUND_CONSOLE_HASH = '#/yer';

export interface GroundConsoleLinkProps {
  /** Icon-only (the text becomes the accessible name + tooltip). */
  compact?: boolean;
  className?: string;
  /** Override the visible text. */
  label?: string;
}

export function GroundConsoleLink({ compact, className, label = 'Yer kontrol konsolu' }: GroundConsoleLinkProps) {
  return (
    <a
      href={GROUND_CONSOLE_HASH}
      className={`console-entry${compact ? ' console-entry--compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label={compact ? `${label} (ışık gecikmesi simülasyonu)` : undefined}
      title={compact ? label : 'Dünya görev kontrolünün gecikmeli görünümü'}
    >
      <Icon name="signal" size={16} />
      {!compact && <span>{label}</span>}
    </a>
  );
}
