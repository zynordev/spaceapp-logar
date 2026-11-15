// Region chips under the canvas: mirror the 3D state and are the keyboard /
// screen-reader path (roving tabindex, arrows move, Enter/Space select).
import { Icon } from '../../ui';
import { useRef, type KeyboardEvent } from 'react';
import { ATTENTION, CHIP_ORDER } from './meta';
import { RegionIcon } from './icons';
import type { BodyRegionRead, RegionKey } from './types';

interface Props {
  regions: Record<RegionKey, BodyRegionRead>;
  selected: RegionKey | null;
  hovered: RegionKey | null;
  onSelect: (r: RegionKey) => void;
  onHover: (r: RegionKey | null) => void;
  onClear: () => void;
}

export function RegionChips({ regions, selected, hovered, onSelect, onHover, onClear }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = selected ?? CHIP_ORDER[0];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % CHIP_ORDER.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + CHIP_ORDER.length) % CHIP_ORDER.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = CHIP_ORDER.length - 1;
    else if (e.key === 'Escape') {
      onClear();
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      const k = CHIP_ORDER[next];
      refs.current[k]?.focus();
      onHover(k);
    }
  };

  return (
    <div className="b3d-chips" role="toolbar" aria-label="Vücut bölgeleri — oklarla gezin, Enter ile seçin">
      {CHIP_ORDER.map((k, i) => {
        const r = regions[k];
        const att = ATTENTION[r.attention];
        const alerts = r.open_alert_ids.length;
        const isSel = selected === k;
        return (
          <button
            key={k}
            ref={(el) => {
              refs.current[k] = el;
            }}
            type="button"
            className={`b3d-chip att-${r.attention.toLowerCase()}${isSel ? ' is-selected' : ''}${hovered === k ? ' is-hover' : ''}`}
            style={{ ['--c' as string]: att.cssVar }}
            tabIndex={k === current ? 0 : -1}
            aria-pressed={isSel}
            aria-label={`${r.label_tr}: ${att.label}${alerts ? `, ${alerts} açık uyarı` : ''}`}
            onClick={() => onSelect(k)}
            onKeyDown={(e) => onKey(e, i)}
            onMouseEnter={() => onHover(k)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(k)}
            onBlur={() => onHover(null)}
          >
            <RegionIcon region={k} size={16} />
            <span className="b3d-chip-label">{r.label_tr}</span>
            <span className="b3d-chip-att" aria-hidden="true">
              <span className="b3d-chip-glyph"><Icon name={att.icon} size={11} /></span>
              {att.label}
            </span>
            {alerts > 0 && (
              <span className="b3d-chip-count" aria-hidden="true">
                {alerts}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Legend() {
  const order = ['CRITICAL', 'ALERT', 'WATCH', 'NORMAL', 'UNKNOWN'] as const;
  return (
    <ul className="b3d-legend" aria-label="Renk açıklaması">
      {order.map((a) => {
        const m = ATTENTION[a];
        return (
          <li key={a} style={{ ['--c' as string]: m.cssVar }} title={m.hint}>
            <span className="b3d-legend-sw" aria-hidden="true">
              <Icon name={m.icon} size={11} />
            </span>
            <strong>{m.label}</strong>
            <span className="b3d-sr">: {m.hint}</span>
          </li>
        );
      })}
    </ul>
  );
}
