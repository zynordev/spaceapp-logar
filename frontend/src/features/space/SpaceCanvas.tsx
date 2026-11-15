// Lazy chunk: the three.js mission link scene. Earth, the mission target
// (Moon / Mars) or a low-orbit station, and the downlink beam whose dots are
// the real ground queue. Positions and sizes are representative, not to scale.
// Rendering is on demand: a 30 fps ticker runs only while the panel is shown,
// visible and motion is allowed; reduced motion renders one still frame.
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { PLANET_FRAG, PLANET_VERT, STAR_FRAG, STAR_VERT } from './shaders';
import { BEAM_COLORS, MAX_PACKETS, packetCounts, type LinkView, type Profile } from './types';

export interface SpaceCanvasProps {
  link: LinkView;
  running: boolean;
  reduced: boolean;
  dpr: number;
  onFail: () => void;
}

type V3 = [number, number, number];
type Clock = MutableRefObject<number>;

const SUN = new THREE.Vector3(4, 1.6, 3).normalize();
const PACKET_PERIOD = 9; // seconds for one dot to cross the beam (representative)

interface Layout {
  cam: V3;
  look: V3;
  earth: { pos: V3; r: number; spin: number };
  target: { kind: 1 | 2; pos: V3; r: number } | null;
  station: V3 | null;
  from: THREE.Vector3; // habitat / station end
  to: THREE.Vector3; // ground end
  lift: number;
  habitatLabel: string;
  /** Where the habitat label hangs (the station's wings would cover it). */
  habitatLabelAt: THREE.Vector3;
  habitatLabelSide: 'right' | 'below';
  groundLabelAt: THREE.Vector3;
  groundLabelSide: 'left' | 'below';
}

const v = (a: V3) => new THREE.Vector3(...a);

function surfacePoint(center: V3, r: number, toward: THREE.Vector3): THREE.Vector3 {
  return v(center).add(toward.clone().normalize().multiplyScalar(r));
}

function layoutFor(profile: Profile): Layout {
  if (profile === 'ISS') {
    const earth = { pos: [-0.6, -6.6, -2] as V3, r: 5.6, spin: 0.012 };
    const station: V3 = [1.9, 0.75, 0.6];
    return {
      cam: [0, 0.5, 7],
      look: [0.2, -0.3, 0],
      earth,
      target: null,
      station,
      from: v(station).add(new THREE.Vector3(-0.1, -0.06, 0)),
      to: surfacePoint(earth.pos, earth.r * 1.003, new THREE.Vector3(-0.12, 1, 0.3)),
      lift: 0.55,
      habitatLabel: 'STATION · LOW EARTH ORBIT',
      habitatLabelAt: v(station).add(new THREE.Vector3(0, -0.5, 0)),
      habitatLabelSide: 'below',
      groundLabelAt: surfacePoint(earth.pos, earth.r * 1.003, new THREE.Vector3(-0.12, 1, 0.3)),
      groundLabelSide: 'left',
    };
  }
  const earth = { pos: [-3, -0.75, 0] as V3, r: 1.25, spin: 0.02 };
  const target = profile === 'MARS' ? { kind: 2 as const, pos: [3.2, 0.5, -0.6] as V3, r: 0.75 } : { kind: 1 as const, pos: [3.3, 0.55, -0.6] as V3, r: 0.45 };
  const dir = v(target.pos).sub(v(earth.pos));
  const from = surfacePoint(target.pos, target.r * 1.01, dir.clone().negate().add(new THREE.Vector3(0, 0.4, 0.9)));
  return {
    cam: [0, 0.25, 10.5],
    look: [0, 0, 0],
    earth,
    target,
    station: null,
    from,
    to: surfacePoint(earth.pos, earth.r * 1.01, dir.clone().add(new THREE.Vector3(0, 0.35, 0.6))),
    lift: 1.1,
    habitatLabel: profile === 'MARS' ? 'HABITAT · MARS' : 'HABITAT · MOON',
    habitatLabelAt: from,
    habitatLabelSide: 'right',
    groundLabelAt: v(earth.pos).add(new THREE.Vector3(0, -earth.r - 0.12, 0)),
    groundLabelSide: 'below',
  };
}

/* --------------------------------------------------------------- pieces */

function TimeKeeper({ clock, reduced }: { clock: Clock; reduced: boolean }) {
  useFrame((_, dt) => {
    if (!reduced) clock.current += Math.min(dt, 0.1);
  }, -1);
  return null;
}

function Ticker({ running, fps = 30 }: { running: boolean; fps?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (now - last >= 1000 / fps - 2) {
        last = now;
        invalidate();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running, fps, invalidate]);
  return null;
}

function Rig({ cam, look, clock }: { cam: V3; look: V3; clock: Clock }) {
  const target = useMemo(() => v(look), [look]);
  useFrame(({ camera }) => {
    const t = clock.current;
    camera.position.set(cam[0] + Math.sin(t * 0.035) * 0.3, cam[1] + Math.sin(t * 0.023) * 0.1, cam[2]);
    camera.lookAt(target);
  });
  return null;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Stars({ count = 1800 }: { count?: number }) {
  const geo = useMemo(() => {
    const rnd = mulberry32(20261115);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const col = new Float32Array(count * 3);
    const tints = [
      [1, 1, 1],
      [0.82, 0.92, 1],
      [1, 0.93, 0.82],
      [0.86, 1, 0.97],
    ];
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([90 * s * Math.cos(th), 90 * u, 90 * s * Math.sin(th) - 20], i * 3);
      const b = Math.pow(rnd(), 3);
      size[i] = 1.1 + b * 1.9;
      const k = 0.22 + b * 0.75;
      const tint = tints[Math.floor(rnd() * tints.length)];
      col.set([tint[0] * k, tint[1] * k, tint[2] * k], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        uniforms: { uPx: { value: Math.min(window.devicePixelRatio || 1, 2) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

function Planet({ kind, pos, r, spin, tilt, seed, clock, segments }: { kind: number; pos: V3; r: number; spin: number; tilt: number; seed: number; clock: Clock; segments: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        uniforms: { uKind: { value: kind }, uSun: { value: SUN }, uTime: { value: 0 }, uSeed: { value: seed } },
      }),
    [kind, seed],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const t = clock.current;
    if (ref.current) ref.current.rotation.y = 0.6 + t * spin;
    mat.uniforms.uTime.value = t;
  });
  return (
    <group position={pos} rotation={[0, 0, tilt]}>
      <mesh ref={ref} material={mat}>
        <sphereGeometry args={[r, segments, Math.round(segments * 0.66)]} />
      </mesh>
    </group>
  );
}

/** Generic low-orbit station: truss, pressurised modules, four solar wings. */
function Station({ pos, clock }: { pos: V3; clock: Clock }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = clock.current;
    const g = ref.current;
    if (!g) return;
    g.position.set(pos[0], pos[1] + Math.sin(t * 0.25) * 0.03, pos[2]);
    g.rotation.set(0.32, -0.55 + Math.sin(t * 0.05) * 0.06, 0.12);
  });
  const wing = (x: number, y: number) => (
    <mesh key={`${x}${y}`} position={[x, y, 0]}>
      <boxGeometry args={[0.13, 0.42, 0.006]} />
      <meshStandardMaterial color="#26394a" metalness={0.55} roughness={0.35} />
    </mesh>
  );
  return (
    <group ref={ref} position={pos}>
      <mesh>
        <boxGeometry args={[1.05, 0.035, 0.035]} />
        <meshStandardMaterial color="#a9b4b8" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.5, 16]} />
        <meshStandardMaterial color="#d9dedd" metalness={0.15} roughness={0.55} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0.17]}>
        <cylinderGeometry args={[0.038, 0.038, 0.26, 16]} />
        <meshStandardMaterial color="#cfd5d4" metalness={0.15} roughness={0.55} />
      </mesh>
      <mesh position={[0.18, -0.07, -0.05]}>
        <boxGeometry args={[0.16, 0.003, 0.09]} />
        <meshStandardMaterial color="#e8ecec" roughness={0.8} />
      </mesh>
      {wing(-0.44, 0.24)}
      {wing(-0.44, -0.24)}
      {wing(0.44, 0.24)}
      {wing(0.44, -0.24)}
    </group>
  );
}

function Beam({ from, to, lift, link, clock, reduced }: { from: THREE.Vector3; to: THREE.Vector3; lift: number; link: LinkView; clock: Clock; reduced: boolean }) {
  const curve = useMemo(() => {
    const mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, lift, 0.25));
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  }, [from, to, lift]);
  const points = useMemo(() => curve.getPoints(72), [curve]);
  const { normal, priority } = packetCounts(link);
  const n = normal + priority;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const lineColor = BEAM_COLORS[link.level];

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < MAX_PACKETS; i++) {
      c.set(i < priority ? BEAM_COLORS[link.level] : BEAM_COLORS.NORMAL);
      m.setColorAt(i, c);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.count = n;
  }, [n, priority, link.level]);

  useFrame(() => {
    const m = mesh.current;
    if (!m || !n) return;
    const t = clock.current;
    for (let i = 0; i < n; i++) {
      // Priority items lead the queue; dots flow habitat -> ground.
      const u = reduced ? (i + 0.5) / n : (((t / PACKET_PERIOD + (n - i) / n) % 1) + 1) % 1;
      const fade = Math.min(1, u / 0.05, (1 - u) / 0.05);
      const s = (i < priority ? 1.7 : 1) * Math.max(0.001, fade);
      tmp.position.copy(curve.getPoint(u));
      tmp.scale.setScalar(s);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <Line
        points={points}
        color={lineColor}
        lineWidth={link.level === 'NORMAL' ? 2.2 : 3.2}
        transparent
        opacity={link.level === 'NORMAL' ? 0.42 : 0.7}
        dashed={link.level === 'UNKNOWN' || link.pending === 0}
        dashSize={0.1}
        gapSize={0.09}
        depthWrite={false}
      />
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX_PACKETS]} frustumCulled={false}>
        <sphereGeometry args={[0.04, 12, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}

function Marker({ at }: { at: THREE.Vector3 }) {
  return (
    <mesh position={at}>
      <sphereGeometry args={[0.035, 12, 8]} />
      <meshBasicMaterial color="#f3fbfa" toneMapped={false} />
    </mesh>
  );
}

/** Places the DOM labels (outside the canvas) over their 3D anchors. */
function Labels({ anchors }: { anchors: { at: THREE.Vector3; el: RefObject<HTMLSpanElement | null> }[] }) {
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const a of anchors) {
      const el = a.el.current;
      if (!el) continue;
      tmp.copy(a.at).project(camera);
      el.style.left = `${((tmp.x + 1) / 2) * size.width}px`;
      el.style.top = `${((1 - tmp.y) / 2) * size.height}px`;
      el.style.visibility = tmp.z < 1 ? 'visible' : 'hidden';
    }
  });
  return null;
}

function Scene({ link, reduced, L, groundEl, habitatEl }: { link: LinkView; reduced: boolean; L: Layout; groundEl: RefObject<HTMLSpanElement | null>; habitatEl: RefObject<HTMLSpanElement | null> }) {
  const clock = useRef(0);
  const anchors = useMemo(() => [{ at: L.groundLabelAt, el: groundEl }, { at: L.habitatLabelAt, el: habitatEl }], [L, groundEl, habitatEl]);
  const iss = link.profile === 'ISS';
  return (
    <>
      <TimeKeeper clock={clock} reduced={reduced} />
      <Rig cam={L.cam} look={L.look} clock={clock} />
      <ambientLight intensity={0.18} />
      <directionalLight position={SUN.clone().multiplyScalar(10)} intensity={2.4} />
      <Stars />
      <Planet kind={0} pos={L.earth.pos} r={L.earth.r} spin={L.earth.spin} tilt={0.41} seed={3.7} clock={clock} segments={iss ? 160 : 96} />
      {L.target && <Planet kind={L.target.kind} pos={L.target.pos} r={L.target.r} spin={0.008} tilt={L.target.kind === 2 ? 0.44 : 0.03} seed={L.target.kind === 2 ? 1.3 : 5.1} clock={clock} segments={72} />}
      {L.station && <Station pos={L.station} clock={clock} />}
      <Beam from={L.from} to={L.to} lift={L.lift} link={link} clock={clock} reduced={reduced} />
      <Marker at={L.to} />
      <Marker at={L.from} />
      <Labels anchors={anchors} />
    </>
  );
}

export default function SpaceCanvas({ link, running, reduced, dpr, onFail }: SpaceCanvasProps) {
  const L = useMemo(() => layoutFor(link.profile), [link.profile]);
  const groundEl = useRef<HTMLSpanElement>(null);
  const habitatEl = useRef<HTMLSpanElement>(null);
  return (
    <>
      <Canvas
        className="sp__canvas"
        frameloop="demand"
        dpr={dpr}
        resize={{ offsetSize: true }}
        camera={{ position: L.cam, fov: 35, near: 0.1, far: 300 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (ev) => {
            ev.preventDefault();
            onFail();
          });
        }}
      >
        <Ticker running={running && !reduced} />
        <Scene link={link} reduced={reduced} L={L} groundEl={groundEl} habitatEl={habitatEl} />
      </Canvas>
      <span ref={groundEl} className={`sp-label sp-label--${L.groundLabelSide}`}>
        EARTH · GROUND TEAMS
      </span>
      <span ref={habitatEl} className={`sp-label sp-label--${L.habitatLabelSide}`}>
        {L.habitatLabel}
      </span>
    </>
  );
}
