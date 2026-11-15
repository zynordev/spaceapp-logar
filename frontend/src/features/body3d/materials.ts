// Shared materials for the 3D body (GLB and procedural fallback use the same
// set). Realistic base colours, tinted + emissive by attention level.
import * as THREE from 'three';
import { ATTENTION, CHIP_ORDER } from './meta';
import type { Attention, RegionKey } from './types';

export type Layer = 'skin' | 'organs' | 'skeleton' | 'env';

export function layerOf(region: RegionKey): Layer {
  if (region === 'skin') return 'skin';
  if (region === 'musculoskeletal') return 'skeleton';
  if (region === 'cabin') return 'env';
  return 'organs';
}

/** Realistic base colours (sRGB hex). */
const BASE: Record<RegionKey, string> = {
  head: '#e3b2a8', // brain
  eyes: '#f3efe6',
  inner_ear: '#e6cfa8',
  heart: '#a3212c',
  lungs: '#df8f98',
  torso: '#c46a55',
  musculoskeletal: '#e9e0c8', // ivory bone
  skin: '#efc4aa',
  cabin: '#7fd8ff',
};

/** Abdominal sub-organ colours, matched by mesh / node name keywords. */
const TORSO_VARIANTS: [RegExp, string][] = [
  [/liver|hepat/i, '#7a2c25'],
  [/stomach|gastr/i, '#d48a78'],
  [/intestin|colon|duoden|jejun|ileum|cecum|caecum|rectum|bowel/i, '#d9a38d'],
  [/kidney|renal/i, '#8c3836'],
  [/spleen|splen/i, '#6c2838'],
  [/pancrea/i, '#e2b386'],
  [/bladder|vesic/i, '#d8b49a'],
  [/gall/i, '#5f7a3a'],
];

/** How strongly the attention colour tints the realistic base colour. */
const TINT: Record<Attention, number> = { NORMAL: 0.1, UNKNOWN: 0.28, WATCH: 0.4, ALERT: 0.5, CRITICAL: 0.58 };
/** Resting emissive glow: only problems glow. */
const GLOW: Record<Attention, number> = { NORMAL: 0.03, UNKNOWN: 0.06, WATCH: 0.2, ALERT: 0.32, CRITICAL: 0.45 };

const RIM_BASE = new THREE.Color('#9fdcff');

interface Tracked {
  mat: THREE.MeshPhysicalMaterial;
  base: THREE.Color;
}

export interface RegionVisual {
  attention: Attention;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
}

/** Skin: physically based, semi-transparent x-ray shell with a fresnel rim. */
function makeSkin(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: BASE.skin,
    roughness: 0.55,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#ffd9c4'),
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const rim = {
    uRimColor: { value: RIM_BASE.clone() },
    uRimPower: { value: 2.4 },
    uRimStrength: { value: 0.9 },
  };
  m.userData.rim = rim;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, rim);
    shader.fragmentShader =
      'uniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float rimF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), uRimPower);
         outgoingLight += uRimColor * rimF * uRimStrength;
         diffuseColor.a = clamp(diffuseColor.a + rimF * uRimStrength * 0.5, 0.0, 1.0);
         #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'b3d-skin-rim';
  return m;
}

function makeOrgan(color: string, region: RegionKey): THREE.MeshPhysicalMaterial {
  const bone = region === 'musculoskeletal';
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: bone ? 0.62 : 0.38,
    metalness: 0,
    clearcoat: bone ? 0 : 0.35,
    clearcoatRoughness: 0.35,
    sheen: bone ? 0 : 0.25,
    sheenColor: new THREE.Color('#ffffff'),
    transparent: true,
    opacity: 1,
    emissive: new THREE.Color('#000000'),
  });
}

export class BodyMaterials {
  readonly skin = makeSkin();
  /** Invisible, pickable enlarger for tiny targets (eyes, inner ear). */
  readonly hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  private readonly byRegion = new Map<RegionKey, Tracked[]>();
  private readonly cache = new Map<string, THREE.MeshPhysicalMaterial>();
  private readonly tmp = new THREE.Color();
  private readonly hidden = new Set<Layer>();
  /** Resting emissive intensity per region (pulse adds on top). */
  readonly restGlow: Partial<Record<RegionKey, number>> = {};

  constructor() {
    this.track('skin', this.skin, BASE.skin);
  }

  private track(region: RegionKey, mat: THREE.MeshPhysicalMaterial, base: string) {
    const list = this.byRegion.get(region) ?? [];
    list.push({ mat, base: new THREE.Color(base) });
    this.byRegion.set(region, list);
  }

  /** Material for a mesh of `region`; `hint` (mesh/node names) picks organ variants. */
  forRegion(region: RegionKey, hint = ''): THREE.MeshPhysicalMaterial {
    if (region === 'skin') return this.skin;
    let color = BASE[region];
    let key: string = region;
    if (region === 'torso') {
      const v = TORSO_VARIANTS.find(([re]) => re.test(hint));
      if (v) {
        color = v[1];
        key = `torso:${v[1]}`;
      }
    }
    let m = this.cache.get(key);
    if (!m) {
      m = makeOrgan(color, region);
      this.cache.set(key, m);
      this.track(region, m, color);
      if (this.hidden.has(layerOf(region))) m.visible = false;
    }
    return m;
  }

  /** Show / hide a whole layer (material-level: also covers meshes loaded later). */
  setLayerVisible(layer: Layer, visible: boolean) {
    if (visible) this.hidden.delete(layer);
    else this.hidden.add(layer);
    for (const [region, list] of this.byRegion) {
      if (layerOf(region) !== layer) continue;
      for (const t of list) t.mat.visible = visible;
    }
  }

  setSkinOpacity(v: number) {
    this.skin.opacity = v;
  }

  /** Apply attention / hover / selection to every material of a region. */
  apply(region: RegionKey, v: RegionVisual) {
    const list = this.byRegion.get(region);
    if (!list) return;
    const att = ATTENTION[v.attention].hex;
    const attColor = this.tmp.set(att);
    const glow = GLOW[v.attention] + (v.selected ? 0.5 : v.hovered ? 0.35 : 0);
    this.restGlow[region] = glow;
    for (const t of list) {
      if (t.mat === this.skin) {
        const rim = t.mat.userData.rim as { uRimColor: { value: THREE.Color }; uRimStrength: { value: number } };
        rim.uRimColor.value.copy(RIM_BASE).lerp(attColor, v.attention === 'NORMAL' ? 0.2 : 0.6);
        rim.uRimStrength.value = 0.9 + (v.selected ? 0.8 : v.hovered ? 0.5 : 0);
        t.mat.emissive.copy(attColor);
        t.mat.emissiveIntensity = v.selected || v.hovered ? 0.12 : 0;
        continue;
      }
      t.mat.color.copy(t.base).lerp(attColor, TINT[v.attention]);
      t.mat.emissive.copy(attColor);
      t.mat.emissiveIntensity = glow;
      t.mat.opacity = v.dimmed ? 0.22 : 1;
      t.mat.depthWrite = !v.dimmed;
    }
  }

  /** CRITICAL pulse: s in [0,1]. */
  pulse(region: RegionKey, s: number) {
    const list = this.byRegion.get(region);
    if (!list) return;
    const rest = this.restGlow[region] ?? 0.4;
    for (const t of list) {
      if (t.mat === this.skin) {
        (t.mat.userData.rim as { uRimStrength: { value: number } }).uRimStrength.value = 0.9 + 0.9 * s;
      } else {
        t.mat.emissiveIntensity = rest + 0.55 * s;
      }
    }
  }

  regions(): RegionKey[] {
    return CHIP_ORDER.filter((k) => this.byRegion.has(k));
  }

  dispose() {
    this.skin.dispose();
    this.hit.dispose();
    for (const m of this.cache.values()) m.dispose();
  }
}
