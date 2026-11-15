// Overall attention hero: the one thing an astronaut must read at a glance.
import { useEffect, useState } from 'react';
import { qs, usePolling } from '../lib/api';
import { useApp } from '../lib/store';
import {
  ATTENTION_ORDER,
  AttentionBadge,
  Chip,
  ErrorNote,
  Icon,
  Skeleton,
  attentionClass,
  attentionMeta,
  formatDateTime,
  formatRelative,
} from '../ui';
import type { CrewStatusRead } from './types';

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const STALE_MS = 10 * 60_000;

export function StatusHero({ scenarioId }: { scenarioId: string | null }) {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const envId = useApp((s) => s.environmentTargetId);
  const offline = useApp((s) => s.offline);
  const now = useNow();
  const path =
    missionId && crewId
      ? `/v1/crew/${encodeURIComponent(crewId)}/status${qs({ mission_id: missionId, environment_target_id: envId })}`
      : null;
  const { data, error, reload } = usePolling<CrewStatusRead>(path, 10_000);

  if (!path) return null;
  if (!data) {
    return (
      <section className="shell-hero att-unknown" aria-label="Genel durum" aria-busy={!error}>
        {error ? (
          <ErrorNote error={error} what="Genel durum" onRetry={reload} />
        ) : (
          <div className="shell-hero__loading">
            <Skeleton height={44} />
            <Skeleton lines={2} />
          </div>
        )}
      </section>
    );
  }

  const meta = attentionMeta(data.overall_attention);
  const counts = new Map<string, number>();
  for (const r of data.rules ?? []) counts.set(r.health_attention, (counts.get(r.health_attention) ?? 0) + 1);
  const generated = Date.parse(data.generated_at);
  const stale = offline || (Number.isFinite(generated) && now - generated > STALE_MS);
  const activity = data.current_activity;

  return (
    <section
      className={`shell-hero ${attentionClass(meta.level)}`}
      aria-labelledby="shell-hero-title"
      data-attention={meta.level}
    >
      <div className="shell-hero__main">
        <span className="shell-hero__glyph" aria-hidden="true">
          <Icon name={meta.icon} size={34} />
        </span>
        <div className="shell-hero__text">
          <h2 id="shell-hero-title" className="shell-hero__kicker">
            Genel durum · <span className="mono">{data.crew_member_id}</span>
            {scenarioId && <span className="shell-hero__scenario"> · {scenarioId}</span>}
          </h2>
          <p className="shell-hero__level" aria-live="polite">
            {meta.label}
          </p>
          <p className="shell-hero__desc">{meta.description}</p>
        </div>
      </div>

      <div className="shell-hero__side">
        {counts.size > 0 && (
          <ul className="shell-hero__counts" aria-label="Kural dağılımı">
            {ATTENTION_ORDER.filter((l) => counts.get(l)).map((l) => (
              <li key={l}>
                <AttentionBadge level={l} size="sm">
                  {attentionMeta(l).label}: {counts.get(l)}
                </AttentionBadge>
              </li>
            ))}
          </ul>
        )}
        <p className="shell-hero__time">
          <Icon name="clock" size={14} />
          <span>
            Son değerlendirme:{' '}
            <time dateTime={data.generated_at}>{formatDateTime(data.generated_at, true)}</time> (
            {formatRelative(data.generated_at, now)})
          </span>
          {stale && (
            <Chip tone="warn" icon="warning">
              {offline ? 'Son bilinen veri' : 'Veri eski'}
            </Chip>
          )}
        </p>
        {activity && activity.state !== 'NONE' && (
          <p className={`shell-hero__activity${activity.state === 'EXPIRED' ? ' is-expired' : ''}`}>
            <Icon name={activity.state === 'EXPIRED' ? 'question' : 'info'} size={14} />
            <span>{activity.message_tr}</span>
          </p>
        )}
        {data.limitations?.length > 0 && (
          <details className="shell-hero__limits">
            <summary>Sınırlamalar ({data.limitations.length})</summary>
            <ul>
              {data.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
