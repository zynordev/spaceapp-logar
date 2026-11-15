// Mission link view for the overview's main panel (no crew card selected).
// A cinematic but data-bound picture of the downlink: the beam's dots are the
// items the ground teams have not acknowledged (GET /v1/sync/status), larger
// dots are pending flight-surgeon escalations (GET /v1/sync/escalations), and
// the light delay is the server's mission-profile value. The 3D scene is a
// lazy chunk; the SVG covers loading, no WebGL and a lost context.
import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { attentionMeta } from '../../ui';
import { fmtAuto } from '../vitals/format';
import { SpaceSvg } from './SpaceSvg';
import { MAX_PACKETS, MAX_PRIORITY_PACKETS, type BeamLevel, type LinkView, type Profile } from './types';
import './space.css';

const SpaceCanvas = lazy(() => import('./SpaceCanvas'));

export interface MissionSpaceViewProps {
  /** False while the panel is covered (crew window open): the scene stops. */
  active: boolean;
  /** Opens the ground-station tab. */
  onOpenGround?: () => void;
}

interface SyncStatusLite {
  link_delay_seconds: number | null;
  profile?: string;
  recipients: { recipient: string; label_tr: string; pending_items: number }[];
  pending_escalations: number;
}
interface EscalationLite {
  id: string;
  priority: 'ALERT' | 'CRITICAL';
  status: string;
}

const PROFILE_TEXT: Record<Profile, string> = {
  ISS: 'ISS · LOW EARTH ORBIT',
  MOON: 'MOON MISSION',
  MARS: 'MARS MISSION',
};

function fmtDelay(s: number | null): string {
  if (s == null) return 'n/a';
  if (s < 1) return '<1 s';
  if (s < 120) return `${fmtAuto(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function useReducedMotion(): boolean {
  const q = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(q);
    } catch {
      return;
    }
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Page visible and the panel on screen (the details section is below it). */
function useShown(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    const el = ref.current;
    let io: IntersectionObserver | null = null;
    if (el && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)));
      io.observe(el);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      io?.disconnect();
    };
  }, [ref]);
  return inView && visible;
}

/** The panel lives in a CSS-scaled stage: render at the pixels actually shown. */
function useStageDpr(ref: RefObject<HTMLElement | null>): number {
  const [dpr, setDpr] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      const shown = el.getBoundingClientRect().width;
      const s = w ? shown / w : 1;
      const d = Math.min(1.75, Math.max(0.6, s * (window.devicePixelRatio || 1)));
      setDpr(Math.round(d * 20) / 20);
    };
    update();
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(el.closest('.dz-fit') ?? el);
    return () => {
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [ref]);
  return dpr;
}

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useLink(): { link: LinkView; failed: boolean; loading: boolean; recipients: SyncStatusLite['recipients'] } {
  const missionId = useApp((s) => s.missionId);
  const sync = usePolling<SyncStatusLite>(missionId ? `/v1/sync/status${qs({ mission_id: missionId })}` : null, 15_000);
  const escCount = sync.data?.pending_escalations ?? 0;
  const esc = usePolling<EscalationLite[]>(missionId && escCount > 0 ? `/v1/sync/escalations${qs({ mission_id: missionId, status: 'PENDING' })}` : null, 15_000);
  const raw = (sync.data?.profile ?? '').toUpperCase();
  const profile: Profile = raw === 'MOON' || raw === 'MARS' ? raw : 'ISS';
  const pending = sync.data ? sync.data.recipients.reduce((n, r) => n + r.pending_items, 0) : null;
  let level: BeamLevel = 'UNKNOWN';
  if (sync.data) level = escCount > 0 ? (esc.data?.some((e) => e.priority === 'CRITICAL') ? 'CRITICAL' : 'ALERT') : 'NORMAL';
  return {
    link: { profile, delay: sync.data?.link_delay_seconds ?? null, pending, escalations: escCount, level },
    failed: !!sync.error && !sync.data,
    loading: !sync.data && !sync.error,
    recipients: sync.data?.recipients ?? [],
  };
}

export function MissionSpaceView({ active, onOpenGround }: MissionSpaceViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const { link, failed, loading, recipients } = useLink();
  const [webgl] = useState(detectWebGL);
  const [lost, setLost] = useState(false);
  const reduced = useReducedMotion();
  const shown = useShown(root);
  const dpr = useStageDpr(root);
  const use3d = webgl && !lost;

  const delay = link.delay;
  const round = delay == null ? null : delay * 2;
  const levelWord = link.level === 'CRITICAL' || link.level === 'ALERT' ? attentionMeta(link.level).label : null;
  const breakdown = recipients.map((r) => `${r.label_tr}: ${r.pending_items}`).join('\n');
  const summary =
    `${PROFILE_TEXT[link.profile]}: habitat-to-Earth link. One-way light delay ${fmtDelay(delay)}. ` +
    (link.pending == null ? 'Queue data could not be loaded.' : `${link.pending} items waiting for the ground teams.`) +
    (link.escalations ? ` ${link.escalations} priority escalations waiting (${levelWord}).` : '');

  return (
    <div className="sp" ref={root}>
      <div className="sp__view" role="img" aria-label={summary}>
        {use3d ? (
          <SceneBoundary onError={() => setLost(true)}>
            <Suspense fallback={<SpaceSvg link={link} />}>
              <SpaceCanvas link={link} running={active && shown} reduced={reduced} dpr={dpr} onFail={() => setLost(true)} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <SpaceSvg link={link} />
        )}
      </div>

      <div className="sp__info">
        <h2 className="sp__title">GROUND LINK</h2>
        <p className="sp__route">{PROFILE_TEXT[link.profile]} → EARTH</p>
        <dl className="sp__rows">
          <div>
            <dt>One-way light delay</dt>
            <dd>
              {loading ? '…' : fmtDelay(delay)}
              {round != null && round >= 1 && <small> · round trip {fmtDelay(round)}</small>}
            </dd>
          </div>
          <div>
            <dt>Waiting for ground teams</dt>
            <dd>
              {failed ? (
                <span className="sp__muted">unavailable</span>
              ) : link.pending == null ? (
                '…'
              ) : onOpenGround ? (
                <button type="button" className="sp__link" onClick={onOpenGround} title={breakdown || undefined}>
                  {link.pending} items
                </button>
              ) : (
                `${link.pending} items`
              )}
            </dd>
          </div>
          <div>
            <dt>Priority escalations</dt>
            <dd>
              {link.escalations ? (
                <>
                  <span className={`sp__flag sp__flag--${link.level.toLowerCase()}`}>{levelWord?.toLocaleUpperCase('en-GB')}</span> {link.escalations} bekliyor
                </>
              ) : link.pending == null ? (
                '…'
              ) : (
                <span className="sp__muted">yok</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <p className="sp__note">
        Illustration only: scale and positions are representative; the delay value comes from the mission profile. Each point on the beam is one item waiting for the ground teams
        {link.escalations ? ', large points are priority escalations' : ''} (at most {MAX_PACKETS} points
        {link.escalations > MAX_PRIORITY_PACKETS ? `, ${MAX_PRIORITY_PACKETS} large points` : ''}); flow speed is representative.
      </p>
    </div>
  );
}
