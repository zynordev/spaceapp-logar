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

      {/* Title and overall status live in the shell's HUD cards; keep the
          accessible name and the honesty notes (demo data / 2D fallback). */}
      <h2 id="b3d-title" className="b3d-sr">
        Vücut haritası
      </h2>
      {(data.note || fallbackReason || data.stale) && (
        <p className={`b3d-note is-${data.mode}`} role="status">
          {[data.stale && data.generatedAt ? `Son güncelleme ${formatWhen(data.generatedAt)} (eski).` : null, data.note, fallbackReason]
            .filter(Boolean)
            .join(' ')}
        </p>
      )}

      {/* right: region detail (only when a region is selected) */}
      {region && (
        <div className="b3d-hud-detail">
          <RegionDetail region={region} onClose={clear} />
        </div>
      )}

      {/* bottom: one compact toolbar (view, layers, regions list, data mode) */}
      <div className="b3d-hud-bottom">
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
                title="Sunucu verisi yerine örnek bölge verisi göster"
              >
                Örnek veri
              </button>
            </div>
          </div>
        )}
        <div className="b3d-bar" role="toolbar" aria-label="Vücut haritası denetimleri">
          <div className="b3d-bar__group" role="group" aria-label="Görünüm">
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
            <button type="button" aria-pressed={!use3d} onClick={toggle2d} disabled={!webgl || failed}>
              2B
            </button>
          </div>
          {use3d && (
            <div className="b3d-bar__group" role="group" aria-label="Katmanlar">
              {(
                [
                  ['skin', 'Deri'],
                  ['organs', 'Organlar'],
                  ['skeleton', 'İskelet'],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={layers[key]} onClick={() => toggleLayer(key)}>
                  <span className="b3d-check" aria-hidden="true">
                    {layers[key] && <Icon name="check" size={10} />}
                  </span>
                  {label}
                </button>
              ))}
              <label className="b3d-slider" title="Deri saydamlığı">
                <span className="b3d-sr">Deri saydamlığı</span>
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
          <div className="b3d-bar__group" role="group" aria-label="Bölgeler ve veri">
            <button
              type="button"
              aria-expanded={regionsOpen}
              aria-controls="b3d-regions"
              onClick={() => setRegionsOpen((o) => !o)}
            >
              Bölgeler
              {flagged > 0 && <span className="b3d-bar__count">{flagged}</span>}
            </button>
            <span className={`b3d-mode ${tag.cls}`} title="Bölge verisinin kaynağı">
              {tag.text}
            </span>
          </div>
        </div>
      </div>
      <p className="b3d-attrib">
        {modelKind === 'procedural' && use3d ? 'Basitleştirilmiş model · ' : ''}
        3D anatomi: BodyParts3D, © The Database Center for Life Science, CC BY 4.0
      </p>

      <span className="b3d-sr" aria-live="polite">
        {region ? `${region.label_tr} seçildi: ${ATTENTION[region.attention].label}` : ''}
      </span>
    </section>
  );
}
