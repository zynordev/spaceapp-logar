// Honest risk coverage map: NASA's 5 spaceflight hazards + data reliability.
import { useId, useState } from 'react';
import type { ApiError } from '../../lib/api';
import { Icon } from '../../ui';
import { COVERAGE_INFO, coverageOf } from './format';
import type { Coverage, CoverageRead, HazardRead } from './types';
import { errorText } from './useGround';

const ORDER: Coverage[] = ['RULE', 'DATA_ONLY', 'GAP'];

function counts(h: HazardRead): Record<Coverage, number> {
  const c: Record<Coverage, number> = { RULE: 0, DATA_ONLY: 0, GAP: 0 };
  for (const r of h.risks) c[coverageOf(r.coverage)] += 1;
  return c;
}

function HazardRow({ hazard }: { hazard: HazardRead }) {
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();
  const c = counts(hazard);
  const total = hazard.risks.length || 1;
  const sel = hazard.risks.find((r) => r.key === open) ?? null;
  const detailId = `${baseId}-detail`;

  return (
    <li className={`gp-hz ${hazard.key === 'DATA' ? 'gp-hz--cross' : ''}`}>
      <div className="gp-hz-head">
        <h4 id={`${baseId}-t`}>{hazard.title_tr}</h4>
        <p className="gp-hz-counts">
          {ORDER.map((k) => (
            <span key={k} className={`gp-cnt gp-cov--${k.toLowerCase()}`}>
              <Icon name={COVERAGE_INFO[k].icon} size={14} /> {c[k]}
              <span className="gp-sr"> {COVERAGE_INFO[k].label}</span>
            </span>
          ))}
        </p>
      </div>
      <div className="gp-hz-bar" aria-hidden="true">
        {ORDER.map((k) =>
          c[k] > 0 ? (
            <span key={k} className={`gp-hz-seg gp-cov--${k.toLowerCase()}`} style={{ flexGrow: c[k] / total }} />
          ) : null,
        )}
      </div>
      <ul className="gp-chips" aria-labelledby={`${baseId}-t`}>
        {hazard.risks.map((r) => {
          const cov = coverageOf(r.coverage);
          const ci = COVERAGE_INFO[cov];
          const isOpen = open === r.key;
          return (
            <li key={r.key}>
              <button
                type="button"
                className={`gp-chip gp-cov--${cov.toLowerCase()}`}
                aria-expanded={isOpen}
                aria-controls={detailId}
                onClick={() => setOpen(isOpen ? null : r.key)}
              >
                <span aria-hidden="true" className="gp-chip-icon"><Icon name={ci.icon} size={14} /></span>
                <span className="gp-chip-title">{r.title_tr}</span>
                <span className="gp-chip-cov">{ci.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div id={detailId} className="gp-hz-detail" hidden={!sel}>
        {sel && (
          <>
            <p>
              <strong>{sel.title_tr}</strong>
              {' — '}
              <span className={`gp-cov-text gp-cov--${coverageOf(sel.coverage).toLowerCase()}`}>
                {COVERAGE_INFO[coverageOf(sel.coverage)].label}
              </span>
            </p>
            {sel.indicators_tr.length > 0 && (
              <p className="gp-small">
                <span className="gp-muted">Indicators: </span>
                {sel.indicators_tr.join(', ')}
              </p>
            )}
            {sel.rules.length > 0 && (
              <p className="gp-small">
                <span className="gp-muted">Rules: </span>
                {sel.rules
                  .map((x) => `${x.title} (${x.validation_status === 'APPROVED' ? 'approved' : 'DEMO, awaiting expert validation'})`)
                  .join('; ')}
              </p>
            )}
            {sel.note_tr && <p className="gp-small gp-muted">{sel.note_tr}</p>}
          </>
        )}
      </div>
    </li>
  );
}

export function CoverageMap(props: { data: CoverageRead | null; error: ApiError | null; loading: boolean }) {
  const { data, error, loading } = props;
  const err = errorText(error, '/v1/risk-coverage');
  const sum = data?.summary ?? {};
  const total = (sum.RULE ?? 0) + (sum.DATA_ONLY ?? 0) + (sum.GAP ?? 0);

  return (
    <section className="gp-card gp-cov" aria-labelledby="gp-cov-title">
      <header className="gp-card-head">
        <h3 id="gp-cov-title">
          <Icon name="grid" size={16} />{' '}Risk coverage map
        </h3>
        {data && <span className="gp-count">{total} risk</span>}
      </header>

      {data && (
        <p className="gp-cov-summary">
          {total} risks: <strong>{sum.RULE ?? 0}</strong> have a decision support rule,{' '}
          <strong>{sum.DATA_ONLY ?? 0}</strong> have data collected only,{' '}
          <strong>{sum.GAP ?? 0}</strong> are not covered yet.
        </p>
      )}

      <ul className="gp-legend" aria-label="Legend">
        {ORDER.map((k) => (
          <li key={k} className={`gp-cov--${k.toLowerCase()}`}>
            <span className="gp-legend-key">
              <Icon name={COVERAGE_INFO[k].icon} size={14} /> {COVERAGE_INFO[k].label}
            </span>{' '}
            <span className="gp-muted gp-small">{COVERAGE_INFO[k].legend}</span>
          </li>
        ))}
      </ul>

      {err && <p className={`gp-note ${data ? 'gp-note--warn' : ''}`}>{err}</p>}
      {!data && !err && loading && <p className="gp-muted">Loading…</p>}

      {data && (
        <ul className="gp-hz-list">
          {data.hazards.map((h) => (
            <HazardRow key={h.key} hazard={h} />
          ))}
        </ul>
      )}
      {data?.note_tr && <p className="gp-muted gp-small gp-cov-note">{data.note_tr}</p>}
    </section>
  );
}
