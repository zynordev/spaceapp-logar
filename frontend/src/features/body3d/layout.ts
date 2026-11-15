// Where each region sits in the scene: anchor (organ), marker (label pill),
// camera focus point and distance. Static for the procedural body, measured
// from bounding boxes for the GLB anatomy.
import * as THREE from 'three';
import { CHIP_ORDER, REGION_META } from './meta';
import type { RegionKey } from './types';

export type Vec3 = [number, number, number];

export interface RegionLayout {
  anchor: Vec3;
  marker: Vec3;
  focus: Vec3;
  distance: number;
}

export type Layout = Record<RegionKey, RegionLayout>;

const PROCEDURAL_ANCHOR: Record<RegionKey, Vec3> = {
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

export function proceduralLayout(): Layout {
  const out = {} as Layout;
  for (const k of CHIP_ORDER) {
    const m = REGION_META[k];
    out[k] = { anchor: PROCEDURAL_ANCHOR[k], marker: m.marker, focus: m.focus, distance: m.distance };
  }
  return out;
}

/** Regions present on both sides of the body: anchor on the label's side. */
const BILATERAL: Partial<Record<RegionKey, number>> = { eyes: 0.28, inner_ear: 0.45, lungs: 0.25 };

/**
 * Layout from measured world-space boxes (model already normalised: feet at
 * y=0, ~1.75 tall, facing +z). Missing regions keep the procedural values.
 */
export function measuredLayout(boxes: Partial<Record<RegionKey, THREE.Box3>>): Layout {
  const out = proceduralLayout();
  const c = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const k of CHIP_ORDER) {
    const box = boxes[k];
    if (!box || box.isEmpty() || k === 'cabin') continue;
    box.getCenter(c);
    box.getSize(s);
    const meta = REGION_META[k];
    const side = Math.sign(meta.marker[0]) || 1;
    const anchor: Vec3 = [c.x, c.y, box.max.z - s.z * 0.25];
    const bil = BILATERAL[k];
    if (bil) anchor[0] = c.x + side * s.x * bil;
    if (k === 'skin' || k === 'musculoskeletal') {
      // whole-body regions: keep the hand-placed thigh anchor, scaled to the model
      anchor[0] = PROCEDURAL_ANCHOR[k][0];
      anchor[1] = box.min.y + s.y * (PROCEDURAL_ANCHOR[k][1] / 1.75);
      anchor[2] = c.z + (k === 'skin' ? 0.05 : 0);
    }
    const dy = meta.marker[1] - meta.focus[1];
    const marker: Vec3 = [meta.marker[0], anchor[1] + dy * 0.8, anchor[2]];
    const whole = k === 'skin' || k === 'musculoskeletal';
    out[k] = {
      anchor,
      marker,
      focus: [c.x, c.y, c.z],
      distance: whole ? meta.distance : THREE.MathUtils.clamp(Math.max(s.x, s.y, s.z) * 2.6, 0.5, 2.4),
    };
  }
  return out;
}
