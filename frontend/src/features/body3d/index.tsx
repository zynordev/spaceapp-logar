// UI-body3d track. Export: BodyMapPanel (no props). Reads mission / crew /
// environment target from useApp(); polls GET /v1/crew/{crew}/body-map (contract C).
// The three.js scene is a lazy chunk; the SVG body covers loading and no-WebGL.
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import './body3d.css';
import { BodySvg } from './BodySvg';
import { ATTENTION } from './meta';
import { Legend, RegionChips } from './RegionChips';
import { AttentionBadge, RegionDetail, formatWhen } from './RegionDetail';
import { useBodyMap } from './useBodyMap';
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
  live: { text: 'CANLI', cls: 'is-live' },
  demo: { text: 'DEMO', cls: 'is-demo' },
  neutral: { text: 'NÖTR', cls: 'is-neutral' },
} as const;

export function BodyMapPanel() {
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
  const [hovered, setHovered] = useState<RegionKey | null>(null);
  const [view, setView] = useState<ViewCommand>({ kind: 'front', n: 0 });
  const [layers, setLayers] = useState<LayerState>({ skin: true, organs: true, skeleton: true, skinOpacity: 0.22 });
  const [modelKind, setModelKind] = useState<ModelKind | null>(null);
  const onModel = useCallback((k: ModelKind) => setModelKind(k), []);
  const toggleLayer = (key: 'skin' | 'organs' | 'skeleton') => setLayers((l) => ({ ...l, [key]: !l[key] }));

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
    ? 'Bu cihazda WebGL yok — 2B görünüm kullanılıyor.'
    : failed
      ? '3B görünüm açılamadı — 2B görünüm kullanılıyor.'
      : null;

  return (
    <section
      className={`b3d-panel b3d-hud${region ? ' has-detail' : ''}`}
      aria-labelledby="b3d-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && selected) clear();
      }}
    >
      {/* full-bleed scene */}
      <div
        className={`b3d-stage${use3d ? ' is-3d' : ' is-2d'}`}
        role="img"
        aria-label={`Vücut modeli, genel durum ${ATTENTION[data.overall].label}. Bölgeler aşağıdaki listede.`}
      >
        {use3d ? (
          <SceneBoundary onError={onFail}>
            <Suspense fallback={svg('3B model yükleniyor…')}>
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
                detailOpen={!!region}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          svg()
        )}
      </div>

      {/* top: title + status (left), view controls (right) */}
      <header className="b3d-hud-top">
        <div className="b3d-glass b3d-hud-title">
          <div className="b3d-title-row">
            <h2 id="b3d-title">Vücut haritası</h2>
            <span className={`b3d-mode ${tag.cls}`}>{tag.text}</span>
            <AttentionBadge attention={data.overall} size="sm" />
          </div>
          <p className="b3d-sub">
            {data.generatedAt && (
              <span className={data.stale ? 'is-stale' : undefined}>Güncelleme: {formatWhen(data.generatedAt)} · </span>
            )}
            {use3d ? 'Bir bölgeye tıklayın · sürükle: döndür · tekerlek: yakınlaştır' : 'Bir bölgeye tıklayın'}
          </p>
          {(data.note || fallbackReason) && (
            <p className={`b3d-note is-${data.mode}`} role="status">
              {[data.note, fallbackReason].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
        <div className="b3d-glass b3d-toolbar" role="group" aria-label="Görünüm">
          <button type="button" onClick={() => setView((v) => ({ kind: 'front', n: v.n + 1 }))} disabled={!use3d}>
            Önden
          </button>
          <button type="button" onClick={() => setView((v) => ({ kind: 'back', n: v.n + 1 }))} disabled={!use3d}>
            Arkadan
          </button>
          <button
            type="button"
            onClick={() => {
              clear();
              setView((v) => ({ kind: 'front', n: v.n + 1 }));
            }}
          >
            Sıfırla
          </button>
          <span className="b3d-sep" aria-hidden="true" />
          <button type="button" aria-pressed={!use3d} onClick={toggle2d} disabled={!webgl || failed}>
            2B
          </button>
          <button type="button" aria-pressed={data.demoForced} onClick={() => data.setDemoForced(!data.demoForced)}>
            Demo
          </button>
        </div>
      </header>


      {/* right: region detail (only when a region is selected) */}
      {region && (
        <div className="b3d-hud-detail">
          <RegionDetail region={region} onClose={clear} />
        </div>
      )}

      {/* bottom: layers, region chips (keyboard path), legend, attribution */}
      <div className="b3d-hud-bottom">
        {use3d && (
          <div className="b3d-glass b3d-layers" role="group" aria-label="Katmanlar">
            {(
              [
                ['skin', 'Deri'],
                ['organs', 'Organlar'],
                ['skeleton', 'İskelet'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={layers[key]} onClick={() => toggleLayer(key)}>
                <span className="b3d-check" aria-hidden="true">
                  {layers[key] ? '✓' : ''}
                </span>
                {label}
              </button>
            ))}
            <label className="b3d-slider">
              <span>Deri saydamlığı</span>
              <input
                type="range"
                min={0.05}
                max={0.9}
                step={0.01}
                value={layers.skinOpacity}
                disabled={!layers.skin}
                onChange={(e) => setLayers((l) => ({ ...l, skinOpacity: Number(e.target.value) }))}
                aria-valuetext={`%${Math.round(layers.skinOpacity * 100)} opak`}
              />
            </label>
          </div>
        )}
        <div className="b3d-glass b3d-chips-wrap">
          <RegionChips
            regions={data.regions}
            selected={selected}
            hovered={hovered}
            onSelect={select}
            onHover={hover}
            onClear={clear}
          />
        </div>
        <div className="b3d-hud-foot">
          <Legend />
          <p className="b3d-attrib">
            {modelKind === 'procedural' && use3d ? 'Basitleştirilmiş model · ' : ''}
            3D anatomi: BodyParts3D, © The Database Center for Life Science, CC BY 4.0
          </p>
        </div>
      </div>

      <span className="b3d-sr" aria-live="polite">
        {region ? `${region.label_tr} seçildi: ${ATTENTION[region.attention].label}` : ''}
      </span>
    </section>
  );
}
