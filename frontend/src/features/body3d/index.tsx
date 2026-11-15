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
import type { ViewCommand } from './BodyScene';
import type { RegionKey } from './types';

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
  const [selected, setSelected] = useState<RegionKey | null>(null);
  const [hovered, setHovered] = useState<RegionKey | null>(null);
  const [view, setView] = useState<ViewCommand>({ kind: 'front', n: 0 });

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
      className="b3d-panel"
      aria-labelledby="b3d-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && selected) clear();
      }}
    >
      <header className="b3d-head">
        <div className="b3d-title-row">
          <h2 id="b3d-title">Vücut haritası</h2>
          <span className={`b3d-mode ${tag.cls}`}>{tag.text}</span>
          <span className="b3d-overall">
            Genel durum: <AttentionBadge attention={data.overall} />
          </span>
          {data.generatedAt && (
            <span className={`b3d-updated${data.stale ? ' is-stale' : ''}`}>Güncelleme: {formatWhen(data.generatedAt)}</span>
          )}
        </div>
        <div className="b3d-toolbar" role="group" aria-label="Görünüm">
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
            2B görünüm
          </button>
          <button type="button" aria-pressed={data.demoForced} onClick={() => data.setDemoForced(!data.demoForced)}>
            Demo verisi
          </button>
        </div>
      </header>

      {(data.note || fallbackReason) && (
        <p className={`b3d-note is-${data.mode}`} role="status">
          {[data.note, fallbackReason].filter(Boolean).join(' ')}
        </p>
      )}

      <div className="b3d-body">
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
                  onFail={onFail}
                />
              </Suspense>
            </SceneBoundary>
          ) : (
            svg()
          )}
          {use3d && <p className="b3d-stage-hint" aria-hidden="true">Sürükle: döndür · Tekerlek: yakınlaştır · Tıkla: seç</p>}
        </div>
        <RegionDetail region={region} onClose={clear} />
      </div>

      <RegionChips
        regions={data.regions}
        selected={selected}
        hovered={hovered}
        onSelect={select}
        onHover={hover}
        onClear={clear}
      />
      <Legend />
      <span className="b3d-sr" aria-live="polite">
        {region ? `${region.label_tr} seçildi: ${ATTENTION[region.attention].label}` : ''}
      </span>
    </section>
  );
}
