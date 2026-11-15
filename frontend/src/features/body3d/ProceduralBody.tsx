// Fallback body built from primitives (used until / unless the anatomical
// GLB is available). Feet at y=0, faces +z, astronaut's left is +x.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { layerOf, type BodyMaterials } from './materials';
import type { RegionKey } from './types';

const GEO = (() => {
  const torsoProfile = new THREE.SplineCurve(
    [
      [0.001, 0.84], [0.11, 0.85], [0.155, 0.9], [0.162, 0.97], [0.145, 1.05],
      [0.13, 1.12], [0.14, 1.2], [0.16, 1.29], [0.176, 1.36], [0.168, 1.41],
      [0.12, 1.45], [0.05, 1.47], [0.001, 1.475],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  ).getPoints(48);
  return {
    sphere: new THREE.SphereGeometry(1, 32, 20),
    sphereLo: new THREE.SphereGeometry(1, 12, 8),
    torso: new THREE.LatheGeometry(torsoProfile, 40),
    neck: new THREE.CapsuleGeometry(0.042, 0.08, 6, 16),
    upperArm: new THREE.CapsuleGeometry(0.042, 0.24, 8, 18),
    forearm: new THREE.CapsuleGeometry(0.035, 0.22, 8, 16),
    thigh: new THREE.CapsuleGeometry(0.068, 0.3, 8, 20),
    shin: new THREE.CapsuleGeometry(0.052, 0.3, 8, 18),
    foot: new THREE.CapsuleGeometry(0.036, 0.12, 6, 12),
    vertebra: new THREE.CylinderGeometry(0.017, 0.017, 0.019, 10),
    longBone: new THREE.CylinderGeometry(1, 1, 1, 10),
    pelvis: new THREE.TorusGeometry(0.085, 0.02, 10, 32),
    rib: new THREE.TorusGeometry(1, 0.035, 6, 36),
    cochlea: new THREE.TorusGeometry(0.013, 0.005, 8, 20),
    heartApex: new THREE.ConeGeometry(0.03, 0.05, 16),
  };
})();

const noRaycast = () => null;
const tag = (region: RegionKey) => ({ region, layer: layerOf(region) });

function Limb({ side, mats }: { side: 1 | -1; mats: BodyMaterials }) {
  const bone = mats.forRegion('musculoskeletal');
  const skin = mats.skin;
  const s = tag('skin');
  const b = tag('musculoskeletal');
  return (
    <>
      <group position={[0.19 * side, 1.4, 0]} rotation={[0, 0, 0.14 * side]}>
        <mesh geometry={GEO.sphere} material={skin} scale={0.05} userData={s} renderOrder={2} />
        <mesh geometry={GEO.upperArm} material={skin} position={[0, -0.15, 0]} userData={s} renderOrder={2} />
        <mesh geometry={GEO.longBone} material={bone} position={[0, -0.15, 0]} scale={[0.009, 0.25, 0.009]} userData={{ layer: 'skeleton' }} raycast={noRaycast} />
        <group position={[0, -0.3, 0]} rotation={[-0.12, 0, 0.04 * side]}>
          <mesh geometry={GEO.forearm} material={skin} position={[0, -0.14, 0]} userData={s} renderOrder={2} />
          <mesh geometry={GEO.longBone} material={bone} position={[0, -0.14, 0]} scale={[0.008, 0.23, 0.008]} userData={{ layer: 'skeleton' }} raycast={noRaycast} />
          <mesh geometry={GEO.sphere} material={skin} position={[0, -0.32, 0.005]} scale={[0.034, 0.068, 0.022]} userData={s} renderOrder={2} />
        </group>
      </group>
      <group position={[0.085 * side, 0.9, 0]} rotation={[0, 0, 0.025 * side]}>
        <mesh geometry={GEO.thigh} material={skin} position={[0, -0.21, 0]} userData={s} renderOrder={2} />
        <mesh geometry={GEO.longBone} material={bone} position={[0, -0.21, 0]} scale={[0.012, 0.38, 0.012]} userData={b} />
        <group position={[0, -0.43, 0]}>
          <mesh geometry={GEO.sphere} material={bone} position={[0, 0, 0.045]} scale={0.022} userData={b} />
          <mesh geometry={GEO.shin} material={skin} position={[0, -0.2, 0]} userData={s} renderOrder={2} />
          <mesh geometry={GEO.longBone} material={bone} position={[0, -0.2, 0]} scale={[0.01, 0.36, 0.01]} userData={b} />
          <mesh geometry={GEO.foot} material={skin} position={[0, -0.425, 0.045]} rotation={[Math.PI / 2, 0, 0]} userData={s} renderOrder={2} />
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
      const s = 1.15 - t * 0.45;
      m.makeScale(s, 1, s).setPosition(0, 0.97 + t * 0.55, -0.062 + 0.018 * Math.sin(t * Math.PI * 1.6 + 0.4));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return <instancedMesh ref={ref} args={[GEO.vertebra, material, count]} userData={tag('musculoskeletal')} />;
}

export function ProceduralBody({ mats }: { mats: BodyMaterials }) {
  const skin = mats.skin;
  const s = tag('skin');
  const o = (r: RegionKey) => mats.forRegion(r);
  const ribs = useMemo(
    () => [0, 1, 2, 3, 4, 5].map((i) => ({ y: 1.39 - i * 0.042, r: 0.118 + Math.sin((i / 5) * Math.PI * 0.8) * 0.032 })),
    [],
  );
  const liver = mats.forRegion('torso', 'liver');
  const stomach = mats.forRegion('torso', 'stomach');
  const intestine = mats.forRegion('torso', 'intestine');
  return (
    <group>
      {/* skin shell */}
      <mesh geometry={GEO.sphere} material={skin} position={[0, 1.635, 0]} scale={[0.095, 0.115, 0.105]} userData={s} renderOrder={2} />
      <mesh geometry={GEO.neck} material={skin} position={[0, 1.49, -0.005]} userData={s} renderOrder={2} />
      <mesh geometry={GEO.torso} material={skin} scale={[1, 1, 0.64]} userData={s} renderOrder={2} />
      <Limb side={1} mats={mats} />
      <Limb side={-1} mats={mats} />

      {/* brain */}
      <mesh geometry={GEO.sphere} material={o('head')} position={[0.029, 1.665, -0.01]} scale={[0.05, 0.052, 0.07]} userData={tag('head')} />
      <mesh geometry={GEO.sphere} material={o('head')} position={[-0.029, 1.665, -0.01]} scale={[0.05, 0.052, 0.07]} userData={tag('head')} />
      <mesh geometry={GEO.sphere} material={o('head')} position={[0, 1.605, -0.045]} scale={[0.04, 0.026, 0.03]} userData={tag('head')} />

      {/* eyes */}
      {[1, -1].map((x) => (
        <group key={`eye${x}`} position={[0.036 * x, 1.628, 0.082]}>
          <mesh geometry={GEO.sphere} material={o('eyes')} scale={0.018} userData={tag('eyes')} />
          <mesh geometry={GEO.sphereLo} material={mats.hit} scale={0.03} userData={tag('eyes')} />
        </group>
      ))}

      {/* inner ear */}
      {[1, -1].map((x) => (
        <group key={`ear${x}`} position={[0.078 * x, 1.618, -0.004]} rotation={[0, Math.PI / 2, 0]}>
          <mesh geometry={GEO.cochlea} material={o('inner_ear')} userData={tag('inner_ear')} />
          <mesh geometry={GEO.sphere} material={o('inner_ear')} position={[0.012, 0.012, 0]} scale={0.008} userData={tag('inner_ear')} />
          <mesh geometry={GEO.sphereLo} material={mats.hit} scale={0.032} userData={tag('inner_ear')} />
        </group>
      ))}

      {/* lungs */}
      <mesh geometry={GEO.sphere} material={o('lungs')} position={[-0.078, 1.29, -0.005]} scale={[0.068, 0.125, 0.066]} userData={tag('lungs')} />
      <mesh geometry={GEO.sphere} material={o('lungs')} position={[0.088, 1.29, -0.012]} scale={[0.058, 0.118, 0.062]} userData={tag('lungs')} />

      {/* heart */}
      <group position={[0.03, 1.265, 0.05]} rotation={[0.15, 0, 0.55]}>
        <mesh geometry={GEO.sphere} material={o('heart')} scale={[0.043, 0.05, 0.04]} userData={tag('heart')} />
        <mesh geometry={GEO.heartApex} material={o('heart')} position={[0, -0.045, 0]} rotation={[Math.PI, 0, 0]} userData={tag('heart')} />
        <mesh geometry={GEO.sphere} material={o('heart')} position={[-0.018, 0.04, -0.005]} scale={0.016} userData={tag('heart')} />
      </group>

      {/* abdomen */}
      <mesh geometry={GEO.sphere} material={liver} position={[-0.05, 1.12, 0.02]} scale={[0.075, 0.045, 0.06]} userData={tag('torso')} />
      <mesh geometry={GEO.sphere} material={stomach} position={[0.055, 1.11, 0.03]} scale={[0.048, 0.034, 0.034]} userData={tag('torso')} />
      <mesh geometry={GEO.sphere} material={intestine} position={[0, 1.0, 0.012]} scale={[0.105, 0.075, 0.065]} userData={tag('torso')} />

      {/* skeleton */}
      <Spine material={o('musculoskeletal')} />
      <mesh geometry={GEO.pelvis} material={o('musculoskeletal')} position={[0, 0.925, -0.012]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.65, 1]} userData={tag('musculoskeletal')} />
      {ribs.map((r, i) => (
        <mesh
          key={`rib${i}`}
          geometry={GEO.rib}
          material={o('musculoskeletal')}
          position={[0, r.y, -0.004]}
          rotation={[Math.PI / 2 + 0.25, 0, 0]}
          scale={[r.r, r.r * 0.66, 0.09]}
          userData={{ layer: 'skeleton' }}
          raycast={noRaycast}
        />
      ))}
    </group>
  );
}
