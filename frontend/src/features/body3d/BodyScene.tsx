// 3D body map (lazy-loaded chunk). Procedurally generated stylised human —
// no model files, textures, HDRs or fonts. Feet at y=0, figure faces +z,
// the astronaut's left side is +x. Render loop is on demand: frames are only
// drawn on interaction, camera easing or the gentle CRITICAL pulse.
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ATTENTION, CHIP_ORDER, REGION_META } from './meta';
import { RegionIcon } from './icons';
import type { RegionKey, RegionStates } from './types';

export type ViewCommand = { kind: 'front' | 'back'; n: number };

export interface BodySceneProps {
  states: RegionStates;
  selected: RegionKey | null;
  hovered: RegionKey | null;
  onHover: (r: RegionKey | null) => void;
  onSelect: (r: RegionKey) => void;
  view: ViewCommand;
  reducedMotion: boolean;
  /** WebGL context lost / unusable: the panel switches to the 2D body. */
  onFail: () => void;
}

// ---------------------------------------------------------------- geometry
// Built once per module and shared by every mount (tiny, low poly).

const GEO = (() => {
  const torsoProfile = new THREE.SplineCurve(
    [
      [0.001, 0.84], [0.11, 0.85], [0.155, 0.9], [0.162, 0.97], [0.145, 1.05],
      [0.13, 1.12], [0.14, 1.2], [0.16, 1.29], [0.176, 1.36], [0.168, 1.41],
      [0.12, 1.45], [0.05, 1.47], [0.001, 1.475],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  ).getPoints(48);
  return {
    sphere: new THREE.SphereGeometry(1, 28, 18),
    sphereLo: new THREE.SphereGeometry(1, 12, 8),
    torso: new THREE.LatheGeometry(torsoProfile, 36),
    neck: new THREE.CapsuleGeometry(0.042, 0.08, 6, 16),
    upperArm: new THREE.CapsuleGeometry(0.042, 0.24, 6, 16),
    forearm: new THREE.CapsuleGeometry(0.035, 0.22, 6, 14),
    thigh: new THREE.CapsuleGeometry(0.068, 0.3, 6, 18),
    shin: new THREE.CapsuleGeometry(0.052, 0.3, 6, 16),
    foot: new THREE.CapsuleGeometry(0.036, 0.12, 4, 12),
    vertebra: new THREE.CylinderGeometry(0.017, 0.017, 0.019, 10),
    longBone: new THREE.CylinderGeometry(1, 1, 1, 8),
    pelvis: new THREE.TorusGeometry(0.085, 0.02, 8, 28),
    rib: new THREE.TorusGeometry(1, 0.035, 5, 32),
    cochlea: new THREE.TorusGeometry(0.013, 0.005, 6, 18),
    heartApex: new THREE.ConeGeometry(0.03, 0.05, 14),
    cabinRing: new THREE.TorusGeometry(0.72, 0.01, 6, 96),
    cabinHit: new THREE.TorusGeometry(0.72, 0.06, 4, 48),
    haloRing: new THREE.TorusGeometry(0.42, 0.008, 6, 72),
    haloHit: new THREE.TorusGeometry(0.42, 0.05, 4, 40),
    cabinWall: new THREE.CylinderGeometry(0.74, 0.74, 2.1, 48, 1, true),
  };
})();

// ---------------------------------------------------------------- materials

const VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vY = wp.y;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBase;
  uniform float uRim;
  uniform float uPower;
  uniform float uBoost;
  uniform float uScan;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    float f = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), uPower);
    float scan = 1.0 - uScan * step(0.5, fract(vY * 140.0));
    float a = clamp((uBase + f * uRim) * scan + uBoost * (0.06 + 0.35 * f), 0.0, 1.0);
    vec3 c = uColor * (0.6 + 1.2 * f + uBoost * 0.7);
    gl_FragColor = vec4(c, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeHolo(base: number, rim: number, power: number, scan: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#7fd8ff') },
      uBase: { value: base },
      uRim: { value: rim },
      uPower: { value: power },
      uBoost: { value: 0 },
      uScan: { value: scan },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
  });
}

const HOLO_BASE = new THREE.Color('#7fd8ff');
const tmpColor = new THREE.Color();

interface Mats {
  organ: Record<RegionKey, THREE.MeshStandardMaterial>;
  shell: THREE.ShaderMaterial;
  wall: THREE.ShaderMaterial;
  ring: THREE.MeshBasicMaterial;
  hit: THREE.MeshBasicMaterial;
  leader: THREE.LineBasicMaterial;
}

function useMats(): Mats {
  const mats = useMemo<Mats>(() => {
    const organ = {} as Record<RegionKey, THREE.MeshStandardMaterial>;
    for (const k of CHIP_ORDER) {
      organ[k] = new THREE.MeshStandardMaterial({
        roughness: 0.42,
        metalness: 0.08,
        transparent: true,
        opacity: 1,
      });
    }
    return {
      organ,
      shell: makeHolo(0.035, 0.75, 2.2, 0.35),
      wall: makeHolo(0.0, 0.16, 3.0, 0.0),
      ring: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, toneMapped: false }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      leader: new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }),
    };
  }, []);
  useEffect(
    () => () => {
      for (const m of Object.values(mats.organ)) m.dispose();
      mats.shell.dispose();
      mats.wall.dispose();
      mats.ring.dispose();
      mats.hit.dispose();
      mats.leader.dispose();
    },
    [mats],
  );
  return mats;
}

// ---------------------------------------------------------------- picking

type Layer = 'inner' | 'shell' | 'env';
const noRaycast = () => null;

function tag(region: RegionKey, layer: Layer) {
  return { region, layer };
}

/** Most specific region under the pointer: organs/bones win over the skin shell. */
function pick(e: ThreeEvent<PointerEvent | MouseEvent>): RegionKey | null {
  let outer: RegionKey | null = null;
  for (const hit of e.intersections) {
    const ud = hit.object.userData as { region?: RegionKey; layer?: Layer };
    if (!ud.region) continue;
    if (ud.layer === 'inner') return ud.region;
    if (!outer) outer = ud.region;
  }
  return outer;
}

// ---------------------------------------------------------------- figure parts

function Limb({ side, mats }: { side: 1 | -1; mats: Mats }) {
  const bone = mats.organ.musculoskeletal;
  const shell = mats.shell;
  const skinTag = tag('skin', 'shell');
  return (
    <>
      {/* arm: shoulder pivot, A-pose */}
      <group position={[0.19 * side, 1.4, 0]} rotation={[0, 0, 0.14 * side]}>
        <mesh geometry={GEO.sphere} material={shell} scale={0.05} userData={skinTag} renderOrder={2} />
        <mesh geometry={GEO.upperArm} material={shell} position={[0, -0.15, 0]} userData={skinTag} renderOrder={2} />
        <mesh geometry={GEO.longBone} material={bone} position={[0, -0.15, 0]} scale={[0.012, 0.25, 0.012]} raycast={noRaycast} />
        <group position={[0, -0.3, 0]} rotation={[-0.12, 0, 0.04 * side]}>
          <mesh geometry={GEO.forearm} material={shell} position={[0, -0.14, 0]} userData={skinTag} renderOrder={2} />
          <mesh geometry={GEO.longBone} material={bone} position={[0, -0.14, 0]} scale={[0.01, 0.23, 0.01]} raycast={noRaycast} />
          <mesh geometry={GEO.sphere} material={shell} position={[0, -0.32, 0.005]} scale={[0.034, 0.068, 0.022]} userData={skinTag} renderOrder={2} />
        </group>
      </group>
      {/* leg: hip pivot */}
      <group position={[0.085 * side, 0.9, 0]} rotation={[0, 0, 0.025 * side]}>
        <mesh geometry={GEO.thigh} material={shell} position={[0, -0.21, 0]} userData={skinTag} renderOrder={2} />
        <mesh geometry={GEO.longBone} material={bone} position={[0, -0.21, 0]} scale={[0.018, 0.38, 0.018]} userData={tag('musculoskeletal', 'inner')} />
        <group position={[0, -0.43, 0]}>
          <mesh geometry={GEO.sphere} material={bone} position={[0, 0, 0.045]} scale={0.022} userData={tag('musculoskeletal', 'inner')} />
          <mesh geometry={GEO.shin} material={shell} position={[0, -0.2, 0]} userData={skinTag} renderOrder={2} />
          <mesh geometry={GEO.longBone} material={bone} position={[0, -0.2, 0]} scale={[0.015, 0.36, 0.015]} userData={tag('musculoskeletal', 'inner')} />
          <mesh geometry={GEO.foot} material={shell} position={[0, -0.425, 0.045]} rotation={[Math.PI / 2, 0, 0]} userData={skinTag} renderOrder={2} />
        </group>
      </group>
    </>
  );
}

function Spine({ material }: { material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 19;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 0.97 + t * 0.55;
      const z = -0.062 + 0.018 * Math.sin(t * Math.PI * 1.6 + 0.4);
      const s = 1.15 - t * 0.45;
      m.makeScale(s, 1, s).setPosition(0, y, z);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh
      ref={ref}
      args={[GEO.vertebra, material, count]}
      userData={tag('musculoskeletal', 'inner')}
    />
  );
}

function Figure({ mats }: { mats: Mats }) {
  const o = mats.organ;
  const shell = mats.shell;
  const skinTag = tag('skin', 'shell');
  const ribs = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5].map((i) => ({
        y: 1.39 - i * 0.042,
        r: 0.118 + Math.sin((i / 5) * Math.PI * 0.8) * 0.032,
      })),
    [],
  );
  return (
    <group>
      {/* --- skin shell (holographic) --- */}
      <mesh geometry={GEO.sphere} material={shell} position={[0, 1.635, 0]} scale={[0.095, 0.115, 0.105]} userData={skinTag} renderOrder={2} />
      <mesh geometry={GEO.neck} material={shell} position={[0, 1.49, -0.005]} userData={skinTag} renderOrder={2} />
      <mesh geometry={GEO.torso} material={shell} scale={[1, 1, 0.64]} userData={skinTag} renderOrder={2} />
      <Limb side={1} mats={mats} />
      <Limb side={-1} mats={mats} />

      {/* --- head: brain hemispheres --- */}
      <mesh geometry={GEO.sphere} material={o.head} position={[0.029, 1.665, -0.01]} scale={[0.05, 0.052, 0.07]} userData={tag('head', 'inner')} />
      <mesh geometry={GEO.sphere} material={o.head} position={[-0.029, 1.665, -0.01]} scale={[0.05, 0.052, 0.07]} userData={tag('head', 'inner')} />
      <mesh geometry={GEO.sphere} material={o.head} position={[0, 1.605, -0.045]} scale={[0.04, 0.026, 0.03]} userData={tag('head', 'inner')} />

      {/* --- eyes (+ generous invisible hit areas) --- */}
      {[1, -1].map((s) => (
        <group key={`eye${s}`} position={[0.036 * s, 1.628, 0.082]}>
          <mesh geometry={GEO.sphere} material={o.eyes} scale={0.018} userData={tag('eyes', 'inner')} />
          <mesh geometry={GEO.sphereLo} material={mats.hit} scale={0.03} userData={tag('eyes', 'inner')} />
        </group>
      ))}

      {/* --- inner ear: cochlea ring + vestibule, at the sides of the head --- */}
      {[1, -1].map((s) => (
        <group key={`ear${s}`} position={[0.078 * s, 1.618, -0.004]} rotation={[0, Math.PI / 2, 0]}>
          <mesh geometry={GEO.cochlea} material={o.inner_ear} userData={tag('inner_ear', 'inner')} />
          <mesh geometry={GEO.sphere} material={o.inner_ear} position={[0.012, 0.012, 0]} scale={0.008} userData={tag('inner_ear', 'inner')} />
          <mesh geometry={GEO.sphereLo} material={mats.hit} scale={0.032} userData={tag('inner_ear', 'inner')} />
        </group>
      ))}

      {/* --- lungs: two lobes, left one smaller to make room for the heart --- */}
      <mesh geometry={GEO.sphere} material={o.lungs} position={[-0.078, 1.29, -0.005]} scale={[0.068, 0.125, 0.066]} userData={tag('lungs', 'inner')} />
      <mesh geometry={GEO.sphere} material={o.lungs} position={[0.088, 1.29, -0.012]} scale={[0.058, 0.118, 0.062]} userData={tag('lungs', 'inner')} />

      {/* --- heart: in the chest, slightly to the astronaut's left --- */}
      <group position={[0.03, 1.265, 0.05]} rotation={[0.15, 0, 0.55]}>
        <mesh geometry={GEO.sphere} material={o.heart} scale={[0.043, 0.05, 0.04]} userData={tag('heart', 'inner')} />
        <mesh geometry={GEO.heartApex} material={o.heart} position={[0, -0.045, 0]} rotation={[Math.PI, 0, 0]} userData={tag('heart', 'inner')} />
        <mesh geometry={GEO.sphere} material={o.heart} position={[-0.018, 0.04, -0.005]} scale={0.016} userData={tag('heart', 'inner')} />
      </group>

      {/* --- torso / abdomen core --- */}
      <mesh geometry={GEO.sphere} material={o.torso} position={[0, 1.02, 0.012]} scale={[0.112, 0.082, 0.07]} userData={tag('torso', 'inner')} />
      <mesh geometry={GEO.sphere} material={o.torso} position={[0.05, 1.12, 0.03]} scale={[0.05, 0.032, 0.034]} userData={tag('torso', 'inner')} />

      {/* --- musculoskeletal: spine, pelvis, ribs (ribs are decorative, not pickable) --- */}
      <Spine material={o.musculoskeletal} />
      <mesh geometry={GEO.pelvis} material={o.musculoskeletal} position={[0, 0.925, -0.012]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.65, 1]} userData={tag('musculoskeletal', 'inner')} />
      {ribs.map((r, i) => (
        <mesh
          key={`rib${i}`}
          geometry={GEO.rib}
          material={o.musculoskeletal}
          position={[0, r.y, -0.004]}
          rotation={[Math.PI / 2 + 0.25, 0, 0]}
          scale={[r.r, r.r * 0.66, 0.09]}
          raycast={noRaycast}
        />
      ))}
    </group>
  );
}

function Cabin({ mats }: { mats: Mats }) {
  const envTag = tag('cabin', 'env');
  const grid = useMemo(() => {
    const g = new THREE.PolarGridHelper(0.7, 12, 4, 64, '#2a4a66', '#1d3550');
    const m = g.material as THREE.Material;
    m.transparent = true;
    m.opacity = 0.5;
    m.depthWrite = false;
    return g;
  }, []);
  useEffect(() => () => {
    grid.geometry.dispose();
    (grid.material as THREE.Material).dispose();
  }, [grid]);
  return (
    <group>
      <primitive object={grid} position={[0, 0.002, 0]} raycast={noRaycast} />
      <mesh geometry={GEO.cabinRing} material={mats.ring} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} />
      <mesh geometry={GEO.cabinHit} material={mats.hit} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} userData={envTag} />
      <group position={[0, 2.02, 0]} rotation={[Math.PI / 2 - 0.12, 0, 0]}>
        <mesh geometry={GEO.haloRing} material={mats.ring} />
        <mesh geometry={GEO.haloHit} material={mats.hit} userData={envTag} />
      </group>
      <mesh geometry={GEO.cabinWall} material={mats.wall} position={[0, 1.05, 0]} renderOrder={3} raycast={noRaycast} />
    </group>
  );
}

// ---------------------------------------------------------------- markers + leaders

const ANCHOR: Record<RegionKey, [number, number, number]> = {
  head: [-0.03, 1.69, 0],
  eyes: [0.036, 1.628, 0.095],
  inner_ear: [0.085, 1.618, 0],
  heart: [0.035, 1.265, 0.06],
  lungs: [-0.09, 1.31, 0.03],
  torso: [-0.06, 1.03, 0.05],
  musculoskeletal: [0.09, 0.62, 0.01],
  skin: [-0.14, 0.66, 0.05],
  cabin: [0.41, 2.02, 0.05],
};

function Leaders({ states, material }: { states: RegionStates; material: THREE.LineBasicMaterial }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (const k of CHIP_ORDER) pos.push(...REGION_META[k].marker, ...ANCHOR[k]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3));
    return g;
  }, []);
  useEffect(() => () => geom.dispose(), [geom]);
  useEffect(() => {
    const col = geom.getAttribute('color') as THREE.BufferAttribute;
    CHIP_ORDER.forEach((k, i) => {
      tmpColor.set(ATTENTION[states[k].attention].hex);
      col.setXYZ(i * 2, tmpColor.r, tmpColor.g, tmpColor.b);
      col.setXYZ(i * 2 + 1, tmpColor.r, tmpColor.g, tmpColor.b);
    });
    col.needsUpdate = true;
  }, [geom, states]);
  return <lineSegments geometry={geom} material={material} raycast={noRaycast} />;
}

function Markers({
  states,
  selected,
  hovered,
  onHover,
  onSelect,
}: Pick<BodySceneProps, 'states' | 'selected' | 'hovered' | 'onHover' | 'onSelect'>) {
  return (
    <>
      {CHIP_ORDER.map((k) => {
        const st = states[k];
        const att = ATTENTION[st.attention];
        const active = hovered === k || selected === k;
        return (
          <Html key={k} position={REGION_META[k].marker} center zIndexRange={[30, 10]}>
            <div
              aria-hidden="true"
              className={`b3d-marker att-${st.attention.toLowerCase()}${active ? ' is-active' : ''}${selected === k ? ' is-selected' : ''}`}
              style={{ ['--c' as string]: att.cssVar }}
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
          </Html>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- state → materials

function StateSync({
  mats,
  states,
  selected,
  hovered,
  reducedMotion,
}: { mats: Mats } & Pick<BodySceneProps, 'states' | 'selected' | 'hovered' | 'reducedMotion'>) {
  const invalidate = useThree((s) => s.invalidate);
  const critical = useRef<RegionKey[]>([]);
  const base = useRef<Record<string, number>>({});

  useEffect(() => {
    const crit: RegionKey[] = [];
    for (const k of CHIP_ORDER) {
      const att = states[k].attention;
      if (att === 'CRITICAL') crit.push(k);
      const hex = ATTENTION[att].hex;
      const focus = selected === k || hovered === k;
      const dim = selected !== null && selected !== k && k !== 'skin' && k !== 'cabin';
      const m = mats.organ[k];
      m.color.set(hex);
      m.emissive.set(hex);
      const e = selected === k ? 1.15 : hovered === k ? 0.85 : att === 'UNKNOWN' ? 0.18 : 0.38;
      base.current[k] = e;
      m.emissiveIntensity = e;
      m.opacity = dim ? 0.28 : 1;
      m.depthWrite = !dim;
      if (k === 'skin') {
        tmpColor.copy(HOLO_BASE).lerp(new THREE.Color(hex), att === 'UNKNOWN' ? 0.25 : 0.6);
        (mats.shell.uniforms.uColor.value as THREE.Color).copy(tmpColor);
        mats.shell.uniforms.uBoost.value = focus ? 0.6 : 0;
        base.current.shell = focus ? 0.6 : 0;
      }
      if (k === 'cabin') {
        mats.ring.color.set(hex);
        mats.ring.opacity = focus ? 1 : 0.75;
        (mats.wall.uniforms.uColor.value as THREE.Color).set(hex);
        mats.wall.uniforms.uBoost.value = focus ? 0.35 : 0;
        base.current.wall = focus ? 0.35 : 0;
      }
    }
    critical.current = crit;
    invalidate();
  }, [mats, states, selected, hovered, invalidate]);

  useFrame((state) => {
    const crit = critical.current;
    if (crit.length === 0 || reducedMotion) return;
    const s = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3.0);
    for (const k of crit) {
      mats.organ[k].emissiveIntensity = (base.current[k] ?? 0.4) + 0.9 * s;
      if (k === 'skin') mats.shell.uniforms.uBoost.value = (base.current.shell ?? 0) + 0.45 * s;
      if (k === 'cabin') {
        mats.wall.uniforms.uBoost.value = (base.current.wall ?? 0) + 0.5 * s;
        mats.ring.opacity = 0.55 + 0.45 * s;
      }
    }
    state.invalidate();
  });
  return null;
}

// ---------------------------------------------------------------- camera

const HOME_TARGET = new THREE.Vector3(0, 1.0, 0);
const HOME_DIST = 3.4;

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (t: string, f: () => void) => void;
  removeEventListener: (t: string, f: () => void) => void;
}

function CameraRig({ selected, view, reducedMotion }: Pick<BodySceneProps, 'selected' | 'view' | 'reducedMotion'>) {
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ target: THREE.Vector3; sph: THREE.Spherical } | null>(null);
  const tmp = useMemo(() => ({ off: new THREE.Vector3(), sph: new THREE.Spherical() }), []);

  // Focus the selected region, keeping the current viewing side.
  useEffect(() => {
    if (!controls || !selected) return;
    const m = REGION_META[selected];
    tmp.sph.setFromVector3(tmp.off.copy(camera.position).sub(controls.target));
    const phi = THREE.MathUtils.clamp(tmp.sph.phi, 1.1, 1.75);
    goal.current = { target: new THREE.Vector3(...m.focus), sph: new THREE.Spherical(m.distance, phi, tmp.sph.theta) };
    invalidate();
  }, [selected, controls, camera, invalidate, tmp]);

  // View buttons: front / back (reset = front + deselect, handled by the panel).
  useEffect(() => {
    if (!controls || view.n === 0) return;
    goal.current = {
      target: HOME_TARGET.clone(),
      sph: new THREE.Spherical(HOME_DIST, 1.52, view.kind === 'back' ? Math.PI : 0),
    };
    invalidate();
  }, [view, controls, invalidate]);

  // Any manual drag/zoom cancels the easing.
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
    const dt = Math.min(rawDt, 1 / 30);
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 5.5);
    const cur = tmp.sph.setFromVector3(tmp.off.copy(camera.position).sub(controls.target));
    let dTheta = g.sph.theta - cur.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta)); // shortest way round
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

// ---------------------------------------------------------------- scene root

function Scene(props: BodySceneProps) {
  const { states, selected, hovered, onHover, onSelect, view, reducedMotion } = props;
  const mats = useMats();
  const gl = useThree((s) => s.gl);

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
      <color attach="background" args={['#050b16']} />
      <fog attach="fog" args={['#050b16', 4.5, 9]} />
      <hemisphereLight args={['#bfe3ff', '#0b1a2b', 0.9]} />
      <directionalLight position={[1.5, 3, 2.5]} intensity={1.4} />
      <directionalLight position={[-2, 1.5, -2.5]} intensity={0.8} color="#5fb4ff" />

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
        <Figure mats={mats} />
        <Cabin mats={mats} />
      </group>

      <Leaders states={states} material={mats.leader} />
      <Markers states={states} selected={selected} hovered={hovered} onHover={onHover} onSelect={onSelect} />
      <ContactShadows position={[0, 0.004, 0]} scale={1.6} blur={2.4} far={1.2} opacity={0.55} resolution={256} frames={1} color="#000814" />

      <StateSync mats={mats} states={states} selected={selected} hovered={hovered} reducedMotion={reducedMotion} />
      <OrbitControls
        makeDefault
        target={[0, 1.0, 0]}
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.12}
        minDistance={0.6}
        maxDistance={6}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI - 0.6}
        rotateSpeed={0.7}
        zoomSpeed={0.8}
      />
      <CameraRig selected={selected} view={view} reducedMotion={reducedMotion} />
    </>
  );
}

export default function BodyScene(props: BodySceneProps) {
  const { onFail } = props;
  return (
    <Canvas
      className="b3d-canvas"
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 1.15, HOME_DIST], fov: 34, near: 0.05, far: 30 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (ev) => {
          ev.preventDefault();
          onFail();
        });
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
