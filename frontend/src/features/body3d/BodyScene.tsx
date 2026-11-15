// 3D body map (lazy-loaded chunk). Realistic anatomy from the BodyParts3D
// GLB when it is served; a procedural body otherwise (and while it loads).
// Offline only: no HDR/preset downloads, no CDN decoders. Render loop is on
// demand — frames are drawn on interaction, camera easing or CRITICAL pulse.
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { GlbBody, probeModel } from './GlbBody';
import { RegionIcon } from './icons';
import { proceduralLayout, type Layout } from './layout';
import { BodyMaterials } from './materials';
import { ATTENTION, CHIP_ORDER, REGION_META } from './meta';
import { ProceduralBody } from './ProceduralBody';
import type { RegionKey, RegionStates } from './types';

export type ViewCommand = { kind: 'front' | 'back'; n: number };
export type ModelKind = 'glb' | 'procedural';

export interface LayerState {
  skin: boolean;
  organs: boolean;
  skeleton: boolean;
  /** 0.05 – 0.9 */
  skinOpacity: number;
}

export interface BodySceneProps {
  states: RegionStates;
  selected: RegionKey | null;
  hovered: RegionKey | null;
  onHover: (r: RegionKey | null) => void;
  onSelect: (r: RegionKey) => void;
  view: ViewCommand;
  reducedMotion: boolean;
  layers: LayerState;
  /** Which body is shown (GLB anatomy or procedural fallback). */
  onModel?: (kind: ModelKind) => void;
  /** WebGL context lost / unusable: the panel switches to the 2D body. */
  onFail: () => void;
  /** The floating detail card covers the right side: shift the view left. */
  detailOpen?: boolean;
}

const noRaycast = () => null;

// ---------------------------------------------------------------- picking

function visibleHit(obj: THREE.Object3D): boolean {
  const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  if (mat && !(Array.isArray(mat) ? mat.some((m) => m.visible) : mat.visible)) return false;
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** Most specific visible region under the pointer: organs/bones beat skin and cabin. */
function pick(e: ThreeEvent<PointerEvent | MouseEvent>): RegionKey | null {
  let outer: RegionKey | null = null;
  for (const hit of e.intersections) {
    const ud = hit.object.userData as { region?: RegionKey; layer?: string };
    if (!ud.region || !visibleHit(hit.object)) continue;
    if (ud.layer === 'organs' || ud.layer === 'skeleton') return ud.region;
    if (!outer) outer = ud.region;
  }
  return outer;
}

// ---------------------------------------------------------------- cabin (habitat)

const CABIN_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const CABIN_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBoost;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 4.0);
    gl_FragColor = vec4(uColor * (0.7 + f), clamp(f * (0.1 + uBoost * 0.25), 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface CabinMats {
  ring: THREE.MeshBasicMaterial;
  hit: THREE.MeshBasicMaterial;
  wall: THREE.ShaderMaterial;
}

const CABIN_GEO = {
  ring: new THREE.TorusGeometry(0.72, 0.01, 6, 96),
  ringHit: new THREE.TorusGeometry(0.72, 0.06, 4, 48),
  halo: new THREE.TorusGeometry(0.42, 0.008, 6, 72),
  haloHit: new THREE.TorusGeometry(0.42, 0.05, 4, 40),
  wall: new THREE.CylinderGeometry(0.74, 0.74, 2.1, 48, 1, true),
};

function Cabin({ mats }: { mats: CabinMats }) {
  const envTag = { region: 'cabin', layer: 'env' };
  const grid = useMemo(() => {
    const g = new THREE.PolarGridHelper(0.7, 12, 4, 64, '#2a4a66', '#1d3550');
    const m = g.material as THREE.Material;
    m.transparent = true;
    m.opacity = 0.5;
    m.depthWrite = false;
    return g;
  }, []);
  useEffect(
    () => () => {
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
    },
    [grid],
  );
  return (
    <group>
      <primitive object={grid} position={[0, 0.002, 0]} raycast={noRaycast} />
      <mesh geometry={CABIN_GEO.ring} material={mats.ring} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} />
      <mesh geometry={CABIN_GEO.ringHit} material={mats.hit} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} userData={envTag} />
      <group position={[0, 2.02, 0]} rotation={[Math.PI / 2 - 0.12, 0, 0]}>
        <mesh geometry={CABIN_GEO.halo} material={mats.ring} />
        <mesh geometry={CABIN_GEO.haloHit} material={mats.hit} userData={envTag} />
      </group>
      <mesh geometry={CABIN_GEO.wall} material={mats.wall} position={[0, 1.05, 0]} renderOrder={3} raycast={noRaycast} />
    </group>
  );
}

// ---------------------------------------------------------------- leaders + markers

function Leaders({ states, layout }: { states: RegionStates; layout: Layout }) {
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }),
    [],
  );
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (const k of CHIP_ORDER) pos.push(...layout[k].marker, ...layout[k].anchor);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3));
    return g;
  }, [layout]);
  useEffect(() => () => geom.dispose(), [geom]);
  useEffect(() => () => material.dispose(), [material]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const col = geom.getAttribute('color') as THREE.BufferAttribute;
    const c = new THREE.Color();
    CHIP_ORDER.forEach((k, i) => {
      c.set(ATTENTION[states[k].attention].hex);
      col.setXYZ(i * 2, c.r, c.g, c.b);
      col.setXYZ(i * 2 + 1, c.r, c.g, c.b);
    });
    col.needsUpdate = true;
    invalidate();
  }, [geom, states, invalidate]);
  return <lineSegments geometry={geom} material={material} raycast={noRaycast} />;
}

type MarkerEls = Partial<Record<RegionKey, HTMLDivElement | null>>;

/** Projects marker anchors to screen space each rendered frame; moves DOM pills directly. */
function Projector({ els, layout }: { els: MutableRefObject<MarkerEls>; layout: MutableRefObject<Layout> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const k of CHIP_ORDER) {
      const el = els.current[k];
      if (!el) continue;
      v.set(...layout.current[k].marker).project(camera);
      const hidden = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2;
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      el.style.visibility = hidden ? 'hidden' : 'visible';
    }
  });
  return null;
}

function Markers({
  states,
  selected,
  hovered,
  onHover,
  onSelect,
  els,
}: Pick<BodySceneProps, 'states' | 'selected' | 'hovered' | 'onHover' | 'onSelect'> & {
  els: MutableRefObject<MarkerEls>;
}) {
  return (
    <div className="b3d-markers" aria-hidden="true">
      {CHIP_ORDER.map((k) => {
        const st = states[k];
        const att = ATTENTION[st.attention];
        const active = hovered === k || selected === k;
        return (
          <div
            key={k}
            ref={(el) => {
              els.current[k] = el;
            }}
            className={`b3d-marker att-${st.attention.toLowerCase()}${active ? ' is-active' : ''}${selected === k ? ' is-selected' : ''}`}
            style={{ ['--c' as string]: att.cssVar, visibility: 'hidden' }}
            onPointerEnter={() => onHover(k)}
            onPointerLeave={() => onHover(null)}
            onClick={() => onSelect(k)}
          >
            <RegionIcon region={k} size={14} />
            <span className="b3d-marker-label">{REGION_META[k].short}</span>
            <span className="b3d-marker-glyph">{att.glyph}</span>
            {active && (
              <span className="b3d-marker-extra">
                {att.label}
                {st.alerts > 0 ? ` · ${st.alerts} açık uyarı` : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- state → materials

function StateSync({
  mats,
  cabin,
  states,
  selected,
  hovered,
  reducedMotion,
  layers,
  modelKey,
}: { mats: BodyMaterials; cabin: CabinMats; modelKey: string } & Pick<
  BodySceneProps,
  'states' | 'selected' | 'hovered' | 'reducedMotion' | 'layers'
>) {
  const invalidate = useThree((s) => s.invalidate);
  const critical = useRef<RegionKey[]>([]);
  const cabinRest = useRef(0);

  useEffect(() => {
    const crit: RegionKey[] = [];
    for (const k of CHIP_ORDER) {
      const att = states[k].attention;
      if (att === 'CRITICAL') crit.push(k);
      const dimmed = selected !== null && selected !== k && k !== 'skin' && k !== 'cabin';
      mats.apply(k, { attention: att, hovered: hovered === k, selected: selected === k, dimmed });
      if (k === 'cabin') {
        const focus = selected === k || hovered === k;
        cabin.ring.color.set(ATTENTION[att].hex);
        cabin.ring.opacity = focus ? 1 : 0.75;
        (cabin.wall.uniforms.uColor.value as THREE.Color).set(ATTENTION[att].hex);
        cabinRest.current = focus ? 1 : 0;
        cabin.wall.uniforms.uBoost.value = cabinRest.current;
      }
    }
    critical.current = crit;
    invalidate();
    // modelKey: re-apply when the GLB replaces the procedural body
  }, [mats, cabin, states, selected, hovered, invalidate, modelKey]);

  useEffect(() => {
    mats.setLayerVisible('skin', layers.skin);
    mats.setLayerVisible('organs', layers.organs);
    mats.setLayerVisible('skeleton', layers.skeleton);
    mats.setSkinOpacity(layers.skinOpacity);
    invalidate();
  }, [mats, layers, invalidate, modelKey]);

  useFrame((state) => {
    const crit = critical.current;
    if (crit.length === 0 || reducedMotion) return;
    const s = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3.0);
    for (const k of crit) {
      if (k === 'cabin') {
        cabin.wall.uniforms.uBoost.value = cabinRest.current + 1.2 * s;
        cabin.ring.opacity = 0.55 + 0.45 * s;
      } else {
        mats.pulse(k, s);
      }
    }
    state.invalidate();
  });
  return null;
}

// ---------------------------------------------------------------- camera

const HOME_TARGET = new THREE.Vector3(0, 1.0, 0);
const HOME_DIST = 4.1;

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (t: string, f: () => void) => void;
  removeEventListener: (t: string, f: () => void) => void;
}

function CameraRig({
  selected,
  view,
  reducedMotion,
  layout,
}: Pick<BodySceneProps, 'selected' | 'view' | 'reducedMotion'> & { layout: Layout }) {
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ target: THREE.Vector3; sph: THREE.Spherical } | null>(null);
  const tmp = useMemo(() => ({ off: new THREE.Vector3(), sph: new THREE.Spherical() }), []);

  // Focus the selected region (its measured box), keeping the current side.
  useEffect(() => {
    if (!controls || !selected) return;
    const l = layout[selected];
    tmp.sph.setFromVector3(tmp.off.copy(camera.position).sub(controls.target));
    const phi = THREE.MathUtils.clamp(tmp.sph.phi, 1.1, 1.75);
    goal.current = { target: new THREE.Vector3(...l.focus), sph: new THREE.Spherical(l.distance, phi, tmp.sph.theta) };
    invalidate();
  }, [selected, controls, camera, invalidate, tmp, layout]);

  useEffect(() => {
    if (!controls || view.n === 0) return;
    goal.current = {
      target: HOME_TARGET.clone(),
      sph: new THREE.Spherical(HOME_DIST, 1.52, view.kind === 'back' ? Math.PI : 0),
    };
    invalidate();
  }, [view, controls, invalidate]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      goal.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, rawDt) => {
    const g = goal.current;
    if (!g || !controls) return;
    const dt = Math.min(rawDt, 0.1);
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 5.5);
    const cur = tmp.sph.setFromVector3(tmp.off.copy(camera.position).sub(controls.target));
    let dTheta = g.sph.theta - cur.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    cur.theta += dTheta * k;
    cur.phi += (g.sph.phi - cur.phi) * k;
    cur.radius += (g.sph.radius - cur.radius) * k;
    controls.target.lerp(g.target, k);
    camera.position.copy(controls.target).add(tmp.off.setFromSpherical(cur));
    controls.update();
    const done =
      Math.abs(dTheta) < 0.002 &&
      Math.abs(g.sph.phi - cur.phi) < 0.002 &&
      Math.abs(g.sph.radius - cur.radius) < 0.002 &&
      controls.target.distanceTo(g.target) < 0.002;
    if (done) goal.current = null;
    else invalidate();
  });
  return null;
}

/** Off-centre projection so the focused organ stays clear of the detail card. */
function ViewShift({ open }: { open: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const shift = open && size.width > 760 ? Math.min(190, size.width * 0.16) : 0;
  useEffect(() => {
    if (shift) camera.setViewOffset(size.width, size.height, shift, 0, size.width, size.height);
    else camera.clearViewOffset();
    invalidate();
  }, [camera, size.width, size.height, shift, invalidate]);
  return null;
}

// ---------------------------------------------------------------- GLB error boundary

class GlbBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[body3d] anatomy GLB could not be loaded, using the procedural body', err);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// ---------------------------------------------------------------- scene root

type ModelState = 'probe' | ModelKind;

function Scene(props: BodySceneProps & { els: MutableRefObject<MarkerEls>; layoutRef: MutableRefObject<Layout> }) {
  const { states, selected, hovered, onHover, onSelect, view, reducedMotion, layers, onModel, els, layoutRef } = props;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  const mats = useMemo(() => new BodyMaterials(), []);
  useEffect(() => () => mats.dispose(), [mats]);
  const cabin = useMemo<CabinMats>(
    () => ({
      ring: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, toneMapped: false }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      wall: new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#7fd8ff') }, uBoost: { value: 0 } },
        vertexShader: CABIN_VERT,
        fragmentShader: CABIN_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      cabin.ring.dispose();
      cabin.hit.dispose();
      cabin.wall.dispose();
    },
    [cabin],
  );

  const [model, setModel] = useState<ModelState>('probe');
  const [layout, setLayout] = useState<Layout>(proceduralLayout);
  const [modelKey, setModelKey] = useState('procedural');
  useEffect(() => {
    let alive = true;
    probeModel().then((ok) => {
      if (alive) setModel(ok ? 'glb' : 'procedural');
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (model === 'procedural') onModel?.('procedural');
  }, [model, onModel]);
  useEffect(() => {
    layoutRef.current = layout;
    invalidate();
  }, [layout, layoutRef, invalidate]);

  const onGlbReady = useCallback(
    (l: Layout) => {
      setLayout(l);
      setModelKey(`glb-${Date.now()}`);
      onModel?.('glb');
    },
    [onModel],
  );
  const onGlbError = useCallback(() => {
    setModel('procedural');
    setLayout(proceduralLayout());
  }, []);

  useEffect(() => {
    gl.domElement.style.cursor = hovered ? 'pointer' : 'grab';
  }, [gl, hovered]);

  const lastHover = useRef<RegionKey | null>(null);
  const setHover = (r: RegionKey | null) => {
    if (lastHover.current === r) return;
    lastHover.current = r;
    onHover(r);
  };

  return (
    <>
      {/* Offline studio lighting: local light-formers only, rendered once. */}
      <Environment resolution={128} frames={1} environmentIntensity={0.9}>
        <Lightformer form="rect" intensity={2.6} color="#ffffff" position={[0, 2.6, 3]} scale={[4, 1.6, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#a8dcff" position={[-3.2, 1.4, 0.5]} scale={[2.5, 3, 1]} />
        <Lightformer form="ring" intensity={2.2} color="#6fb6ff" position={[2.6, 1.6, -2.6]} scale={1.6} />
        <Lightformer form="rect" intensity={0.5} color="#1c2c44" position={[0, -1.5, 0]} scale={[5, 5, 1]} />
      </Environment>
      <hemisphereLight args={['#cfe8ff', '#0b1a2b', 0.35]} />
      <directionalLight position={[1.5, 3, 2.5]} intensity={1.6} />
      <directionalLight position={[-2, 1.6, -2.8]} intensity={1.1} color="#69b8ff" />

      <group
        onPointerMove={(e) => {
          e.stopPropagation();
          setHover(pick(e));
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          const r = pick(e);
          if (r) onSelect(r);
        }}
      >
        {model === 'procedural' && <ProceduralBody mats={mats} />}
        {model === 'glb' && (
          <GlbBoundary onError={onGlbError}>
            <Suspense fallback={<ProceduralBody mats={mats} />}>
              <GlbBody mats={mats} onReady={onGlbReady} />
            </Suspense>
          </GlbBoundary>
        )}
        <Cabin mats={cabin} />
      </group>

      <Leaders states={states} layout={layout} />
      <ContactShadows position={[0, 0.004, 0]} scale={1.8} blur={2.6} far={1.2} opacity={0.6} resolution={256} frames={1} color="#000814" />

      <StateSync
        mats={mats}
        cabin={cabin}
        states={states}
        selected={selected}
        hovered={hovered}
        reducedMotion={reducedMotion}
        layers={layers}
        modelKey={modelKey}
      />
      <OrbitControls
        makeDefault
        target={[0, 1.0, 0]}
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.12}
        minDistance={0.45}
        maxDistance={6}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI - 0.6}
        rotateSpeed={0.7}
        zoomSpeed={0.8}
      />
      <CameraRig selected={selected} view={view} reducedMotion={reducedMotion} layout={layout} />
      <ViewShift open={!!props.detailOpen} />
      <Projector els={els} layout={layoutRef} />
    </>
  );
}

export default function BodyScene(props: BodySceneProps) {
  const { onFail, states, selected, hovered, onHover, onSelect } = props;
  const els = useRef<MarkerEls>({});
  const layoutRef = useRef<Layout>(proceduralLayout());
  // R3F force-loses the context when the canvas unmounts (e.g. switching to
  // 2D); only a context loss while mounted counts as a failure.
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <div className="b3d-scene">
      <Canvas
        className="b3d-canvas"
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, 1.12, HOME_DIST], fov: 34, near: 0.03, far: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (ev) => {
            ev.preventDefault();
            if (mounted.current) onFail();
          });
        }}
      >
        <Scene {...props} els={els} layoutRef={layoutRef} />
      </Canvas>
      <Markers states={states} selected={selected} hovered={hovered} onHover={onHover} onSelect={onSelect} els={els} />
    </div>
  );
}
