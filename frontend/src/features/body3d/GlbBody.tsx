// Realistic anatomy from a GLB (BodyParts3D, CC BY 4.0). Region groups are
// found by node name (case-insensitive prefix on the region keys); the model
// is normalised to y-up, feet at 0, ~1.75 m tall, facing +z.
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { layerOf, type BodyMaterials } from './materials';
import { measuredLayout, type Layout } from './layout';
import { CHIP_ORDER } from './meta';
import type { RegionKey } from './types';

export const MODEL_URL = `${import.meta.env.BASE_URL}models/body.glb`;
const TARGET_HEIGHT = 1.75;

let probe: Promise<boolean> | null = null;
/** True when the GLB is actually served (not 404 / SPA index.html fallback). */
export function probeModel(): Promise<boolean> {
  if (!probe) {
    probe = fetch(MODEL_URL, { method: 'HEAD' })
      .then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html'))
      .catch(() => false);
  }
  return probe;
}

// Offline meshopt decoder (bundled with three; no CDN). Draco is disabled so
// drei never reaches for its CDN decoder.
const extendLoader = (loader: unknown) => {
  (loader as { setMeshoptDecoder: (d: unknown) => void }).setMeshoptDecoder(MeshoptDecoder);
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const KEYS = [...CHIP_ORDER].sort((a, b) => norm(b).length - norm(a).length);

function regionOfName(name: string): RegionKey | null {
  const n = norm(name);
  if (!n) return null;
  for (const k of KEYS) if (n.startsWith(norm(k))) return k;
  return null;
}

interface Prepared {
  root: THREE.Group;
  layout: Layout;
  found: RegionKey[];
}

function prepare(source: THREE.Object3D, mats: BodyMaterials): Prepared {
  // Work on a clone: the cached gltf.scene must stay untouched (StrictMode runs
  // memo factories twice; re-parenting the shared scene would empty one result).
  const scene = source.clone(true);
  // 0. many meshes (full BodyParts3D export) → cheaper organ shading
  let meshCount = 0;
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshCount++;
  });
  if (meshCount > 250) mats.setLowCost();

  // 1. region tagging (nearest named ancestor wins) + materials
  const found = new Set<RegionKey>();
  const tagRec = (obj: THREE.Object3D, inherited: RegionKey | null, hint: string) => {
    const own = regionOfName(obj.name);
    const region = own ?? inherited;
    const h = `${hint} ${obj.name}`;
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (region) {
        found.add(region);
        mesh.material = mats.forRegion(region, h);
        mesh.userData = { region, layer: layerOf(region) };
        mesh.renderOrder = region === 'skin' ? 2 : 0;
      } else {
        mesh.material = mats.forRegion('musculoskeletal', h);
        mesh.userData = { layer: 'skeleton' };
      }
    }
    for (const c of obj.children) tagRec(c, region, h);
  };
  tagRec(scene, null, '');

  // 2. orientation: largest extent → y-up
  const up = new THREE.Group();
  up.add(scene);
  const box = new THREE.Box3().setFromObject(up);
  const size = box.getSize(new THREE.Vector3());
  if (size.z >= size.y && size.z >= size.x) up.rotation.x = -Math.PI / 2;
  else if (size.x >= size.y && size.x >= size.z) up.rotation.z = Math.PI / 2;

  const yaw = new THREE.Group();
  yaw.add(up);
  const outer = new THREE.Group();
  outer.add(yaw);
  outer.updateMatrixWorld(true);

  // 3. facing: eyes are in front of the brain → rotate so they face +z
  const centerOf = (k: RegionKey) => {
    const b = new THREE.Box3();
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.region === k) b.expandByObject(o);
    });
    return b.isEmpty() ? null : b.getCenter(new THREE.Vector3());
  };
  const eyes = centerOf('eyes');
  const head = centerOf('head');
  if (eyes && head) {
    const d = eyes.sub(head);
    if (Math.hypot(d.x, d.z) > 1e-6) yaw.rotation.y = -Math.atan2(d.x, d.z);
  }
  outer.updateMatrixWorld(true);

  // 4. scale to ~1.75 m, feet at y=0, centred
  const b2 = new THREE.Box3().setFromObject(outer);
  const s2 = b2.getSize(new THREE.Vector3());
  const k = s2.y > 0 ? TARGET_HEIGHT / s2.y : 1;
  outer.scale.setScalar(k);
  outer.updateMatrixWorld(true);
  const b3 = new THREE.Box3().setFromObject(outer);
  const c3 = b3.getCenter(new THREE.Vector3());
  outer.position.set(-c3.x, -b3.min.y, -c3.z);
  outer.updateMatrixWorld(true);

  // 5. measured layout per region
  const boxes: Partial<Record<RegionKey, THREE.Box3>> = {};
  outer.traverse((o) => {
    const r = o.userData.region as RegionKey | undefined;
    if (!r || !(o as THREE.Mesh).isMesh) return;
    (boxes[r] ??= new THREE.Box3()).expandByObject(o);
  });
  return { root: outer, layout: measuredLayout(boxes), found: [...found] };
}

export function GlbBody({
  mats,
  onReady,
}: {
  mats: BodyMaterials;
  onReady: (layout: Layout, found: RegionKey[]) => void;
}) {
  const gltf = useGLTF(MODEL_URL, false, false, extendLoader);
  const prepared = useMemo(() => prepare(gltf.scene, mats), [gltf, mats]);
  useEffect(() => {
    onReady(prepared.layout, prepared.found);
  }, [prepared, onReady]);
  return <primitive object={prepared.root} />;
}
