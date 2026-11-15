// Big-target segmented control built on native radio inputs: arrow keys move
// the choice, the group has a real <legend>, and the selected option carries a
// check mark + border (colour is never the only signal).
import type { ReactNode } from 'react';

export interface SegOption<V extends string | number> {
  value: V;
  label: ReactNode;
  sub?: ReactNode;
  /** Accessible name if `label` is not plain text. */
  aria?: string;
}

export function Segmented<V extends string | number>({
  name, legend, legendHidden, options, value, onChange, tone, disabled, compact,
}: {
  name: string;
  legend: ReactNode;
  legendHidden?: boolean;
  options: SegOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  /** Optional visual intensity per option (0..4) for severity scales. */
  tone?: (v: V) => number;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <fieldset className={`lgi-seg${compact ? ' lgi-seg--compact' : ''}`} disabled={disabled}>
      <legend className={legendHidden ? 'lgi-sr' : 'lgi-seg__legend'}>{legend}</legend>
      <div className="lgi-seg__row">
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          const checked = value === o.value;
          return (
            <label
              key={String(o.value)}
              htmlFor={id}
              className={`lgi-seg__opt${checked ? ' is-on' : ''}`}
              data-tone={tone ? tone(o.value) : undefined}
            >
              <input
                type="radio"
                id={id}
                name={name}
                value={String(o.value)}
                checked={checked}
                onChange={() => onChange(o.value)}
                aria-label={o.aria}
              />
              <span className="lgi-seg__label">
                {checked && <span className="lgi-seg__tick" aria-hidden="true">✓ </span>}
                {o.label}
              </span>
              {o.sub !== undefined && <span className="lgi-seg__sub">{o.sub}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
