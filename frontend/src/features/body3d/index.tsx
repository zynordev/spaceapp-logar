// UI-body3d track. Export: BodyMapPanel (no props). Reads mission / crew /
// environment target from useApp(); polls GET /v1/crew/{crew}/body-map (contract C).
// The three.js scene is a lazy chunk; the SVG body covers loading and no-WebGL.
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import './body3d.css';
import { BodySvg } from './BodySvg';
import { ATTENTION, ATTENTION_RANK, CHIP_ORDER } from './meta';
import { Legend, RegionChips } from './RegionChips';
import { RegionDetail, formatWhen } from './RegionDetail';
import { Icon } from '../../ui';
import { useBodyMap } from './useBodyMap';
import { useBodySelection } from './selection';
import type { LayerState, ModelKind, ViewCommand } from './BodyScene';
import { isRegionKey, type RegionKey } from './types';

const BodyScene = lazy(() => import('./BodyScene'));

const PREF_KEY = 'logar.body3d.view';

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
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
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

const MODE_TAG = {
  live: { text: 'LIVE', cls: 'is-live' },
  demo: { text: 'DEMO', cls: 'is-demo' },
  neutral: { text: 'NEUTRAL', cls: 'is-neutral' },
} as const;

export interface BodyMapPanelProps {
  /** Design screens: body only (no toolbar, labels or detail card). The
   * BodyParts3D attribution line always stays. */
  bare?: boolean;
  /** Bare mode: allow rotating / zooming (person screen) or keep it still (crew window). */
  interactive?: boolean;
}

export function BodyMapPanel({ bare = false, interactive = true }: BodyMapPanelProps = {}) {
  const data = useBodyMap();
  const reducedMotion = useReducedMotion();
  const webgl = useMemo(detectWebGL, []);
  const [failed, setFailed] = useState(false);
  const [prefer2d, setPrefer2d] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(PREF_KEY) === '2d';
    } catch {
      return false;
    }
  });
  // `?region=heart` preselects a region (deep link for demos / screenshots).
  const [selected, setSelected] = useState<RegionKey | null>(() => {
    try {
      const r = new URLSearchParams(window.location.search).get('region');
      return isRegionKey(r) ? r : null;
    } catch {
      return null;
    }
  });
  // External selection (guided tour): applied like a click on the region.
  const request = useBodySelection((s) => s.request);
  useEffect(() => {
    if (request) setSelected(request.region);
  }, [request]);
  const [hovered, setHovered] = useState<RegionKey | null>(null);
  const [view, setView] = useState<ViewCommand>({ kind: 'front', n: 0 });
  const [layers, setLayers] = useState<LayerState>({ skin: true, organs: true, skeleton: true, skinOpacity: 0.22 });
  const [modelKind, setModelKind] = useState<ModelKind | null>(null);
  const onModel = useCallback((k: ModelKind) => setModelKind(k), []);
  const toggleLayer = (key: 'skin' | 'organs' | 'skeleton') => setLayers((l) => ({ ...l, [key]: !l[key] }));
  const [regionsOpen, setRegionsOpen] = useState(false);

  const use3d = webgl && !failed && !prefer2d;

  const toggle2d = () => {
    const next = !prefer2d;
    setPrefer2d(next);
    try {
      sessionStorage.setItem(PREF_KEY, next ? '2d' : '3d');
    } catch {
      /* ignore */
    }
  };

  const select = useCallback((r: RegionKey) => setSelected(r), []);
  const clear = useCallback(() => setSelected(null), []);
  const hover = useCallback((r: RegionKey | null) => setHovered(r), []);
  const onFail = useCallback(() => setFailed(true), []);

  const region = selected ? data.regions[selected] : null;
  const tag = MODE_TAG[data.mode];
  // Regions that need attention (watch or worse): shown on the toolbar button.
  const flagged = CHIP_ORDER.filter((k) => ATTENTION_RANK[data.regions[k].attention] >= ATTENTION_RANK.WATCH).length;

  const svg = (note: string | null = null) => (
    <BodySvg
      states={data.states}
      selected={selected}
      hovered={hovered}
      onHover={hover}
      onSelect={select}
      loadingNote={note}
    />
  );

  const fallbackReason = !webgl
    ? 'WebGL is not available on this device — using the 2D view.'
    : failed
      ? 'The 3D view could not open — using the 2D view.'
      : null;

  return (
    <section
      className={`b3d-panel b3d-hud${region && !bare ? ' has-detail' : ''}${bare ? ' is-bare' : ''}${bare && !interactive ? ' is-still' : ''}`}
      aria-labelledby="b3d-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && selected) clear();
      }}
    >
      {/* full-bleed scene */}
      <div
        className={`b3d-stage${use3d ? ' is-3d' : ' is-2d'}`}
        role="img"
        aria-label={`Body model, overall status ${ATTENTION[data.overall].label}. Regions are in the list below.`}
      >
        {use3d ? (
          <SceneBoundary onError={onFail}>
            <Suspense fallback={svg('3D model loading…')}>
              <BodyScene
                states={data.states}
                selected={selected}
                hovered={hovered}
                onHover={hover}
                onSelect={select}
                view={view}
                reducedMotion={reducedMotion}
                layers={layers}
                onModel={onModel}
                onFail={onFail}
                detailOpen={!!region && !bare}
                bare={bare}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          svg()
        )}
      </div>

      {/* Title and overall status live in the shell's HUD cards; keep the
          accessible name and the honesty notes (demo data / 2D fallback). */}
      <h2 id="b3d-title" className="b3d-sr">
        Body map
      </h2>
      {!bare && (data.note || fallbackReason || data.stale) && (
        <p className={`b3d-note is-${data.mode}`} role="status">
          {[data.stale && data.generatedAt ? `Last updated ${formatWhen(data.generatedAt)} (stale).` : null, data.note, fallbackReason]
            .filter(Boolean)
            .join(' ')}
        </p>
      )}

      {/* right: region detail (only when a region is selected) */}
      {region && !bare && (
        <div className="b3d-hud-detail">
          <RegionDetail region={region} onClose={clear} />
        </div>
      )}

      {/* bottom: one compact toolbar (view, layers, regions list, data mode) */}
      <div className="b3d-hud-bottom" hidden={bare}>
        {regionsOpen && (
          <div className="b3d-regions" id="b3d-regions">
            <RegionChips
              regions={data.regions}
              selected={selected}
              hovered={hovered}
              onSelect={(r) => {
                select(r);
              }}
              onHover={hover}
              onClear={() => {
                clear();
                setRegionsOpen(false);
              }}
            />
            <div className="b3d-regions__foot">
              <Legend />
              <button
                type="button"
                className="b3d-regions__demo"
                aria-pressed={data.demoForced}
                onClick={() => data.setDemoForced(!data.demoForced)}
                title="Show sample region data instead of server data"
              >
                Sample data
              </button>
            </div>
          </div>
        )}
        <div className="b3d-bar" role="toolbar" aria-label="Body map controls">
          <div className="b3d-bar__group" role="group" aria-label="View">
            <button type="button" onClick={() => setView((v) => ({ kind: 'front', n: v.n + 1 }))} disabled={!use3d}>
              Front
            </button>
            <button type="button" onClick={() => setView((v) => ({ kind: 'back', n: v.n + 1 }))} disabled={!use3d}>
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                clear();
                setView((v) => ({ kind: 'front', n: v.n + 1 }));
              }}
            >
              Reset
            </button>
            <button type="button" aria-pressed={!use3d} onClick={toggle2d} disabled={!webgl || failed}>
              2D
            </button>
          </div>
          {use3d && (
            <div className="b3d-bar__group" role="group" aria-label="Layers">
              {(
                [
                  ['skin', 'Skin'],
                  ['organs', 'Organs'],
                  ['skeleton', 'Skeleton'],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={layers[key]} onClick={() => toggleLayer(key)}>
                  <span className="b3d-check" aria-hidden="true">
                    {layers[key] && <Icon name="check" size={10} />}
                  </span>
                  {label}
                </button>
              ))}
              <label className="b3d-slider" title="Skin transparency">
                <span className="b3d-sr">Skin transparency</span>
                <input
                  type="range"
                  min={0.05}
                  max={0.9}
                  step={0.01}
                  value={layers.skinOpacity}
                  disabled={!layers.skin}
                  onChange={(e) => setLayers((l) => ({ ...l, skinOpacity: Number(e.target.value) }))}
                  aria-valuetext={`${Math.round(layers.skinOpacity * 100)}% opaque`}
                />
              </label>
            </div>
          )}
          <div className="b3d-bar__group" role="group" aria-label="Regions and data">
            <button
              type="button"
              aria-expanded={regionsOpen}
              aria-controls="b3d-regions"
              onClick={() => setRegionsOpen((o) => !o)}
            >
              Regions
              {flagged > 0 && <span className="b3d-bar__count">{flagged}</span>}
            </button>
            <span className={`b3d-mode ${tag.cls}`} title="Source of region data">
              {tag.text}
            </span>
          </div>
        </div>
      </div>
      <p className="b3d-attrib">
        {modelKind === 'procedural' && use3d ? 'Simplified model · ' : ''}
        3D anatomy: BodyParts3D, © The Database Center for Life Science, CC BY 4.0
      </p>

      <span className="b3d-sr" aria-live="polite">
        {region ? `${region.label_tr} selected: ${ATTENTION[region.attention].label}` : ''}
      </span>
    </section>
  );
}
