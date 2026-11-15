// 2D fallback body (no WebGL, user choice, or while the 3D chunk loads).
// Same regions, colours, glyphs and click behaviour as the 3D model.
import type { CSSProperties, ReactNode } from 'react';
import { ATTENTION, CHIP_ORDER, REGION_META } from './meta';
import type { RegionKey, RegionStates } from './types';

export interface BodySvgProps {
  states: RegionStates;
  selected: RegionKey | null;
  hovered: RegionKey | null;
  onHover: (r: RegionKey | null) => void;
  onSelect: (r: RegionKey) => void;
  /** Shown while the 3D module loads. */
  loadingNote?: string | null;
}

const SHAPES: Record<RegionKey, ReactNode> = {
  cabin: (
    <>
      <rect x="8" y="6" width="224" height="428" rx="44" className="b3d-svg-stroke" strokeDasharray="6 6" />
      <rect x="8" y="6" width="224" height="428" rx="44" className="b3d-svg-hit" />
    </>
  ),
  skin: (
    <>
      <path className="b3d-svg-limb" d="M159 100 L172 170 L182 242" strokeWidth="19" />
      <path className="b3d-svg-limb" d="M81 100 L68 170 L58 242" strokeWidth="19" />
      <path className="b3d-svg-limb" d="M134 232 L138 330 L141 418" strokeWidth="27" />
      <path className="b3d-svg-limb" d="M106 232 L102 330 L99 418" strokeWidth="27" />
      <rect x="111" y="76" width="18" height="18" rx="6" className="b3d-svg-fill" />
      <path className="b3d-svg-fill" d="M84 92 Q120 82 156 92 L162 150 Q152 180 157 210 L151 234 Q120 244 89 234 L83 210 Q88 180 78 150 Z" />
      <ellipse cx="120" cy="50" rx="24" ry="29" className="b3d-svg-fill" />
    </>
  ),
  musculoskeletal: (
    <>
      <path d="M120 96 L120 226" className="b3d-svg-bone" strokeWidth="5" strokeDasharray="3 2.5" />
      <ellipse cx="120" cy="226" rx="22" ry="8" className="b3d-svg-bone" strokeWidth="4" fill="none" />
      <path d="M136 238 L138 328 M138 336 L140 410 M104 238 L102 328 M102 336 L100 410" className="b3d-svg-bone" strokeWidth="5" />
      <path d="M120 106 Q100 104 94 124 M120 116 Q98 116 94 136 M120 106 Q140 104 146 124 M120 116 Q142 116 146 136" className="b3d-svg-bone" strokeWidth="2" fill="none" />
    </>
  ),
  torso: <ellipse cx="120" cy="188" rx="27" ry="20" className="b3d-svg-organ" />,
  lungs: (
    <>
      <ellipse cx="104" cy="130" rx="14" ry="25" className="b3d-svg-organ" />
      <ellipse cx="137" cy="132" rx="11" ry="22" className="b3d-svg-organ" />
    </>
  ),
  heart: <path className="b3d-svg-organ" d="M126 156 C112 146 112 132 120 130 C124 129 126 132 126 134 C126 132 128 129 132 130 C140 132 140 146 126 156 Z" />,
  head: <ellipse cx="120" cy="42" rx="17" ry="14" className="b3d-svg-organ" />,
  eyes: (
    <>
      <circle cx="111" cy="58" r="4.5" className="b3d-svg-organ" />
      <circle cx="129" cy="58" r="4.5" className="b3d-svg-organ" />
      <rect x="102" y="50" width="36" height="16" className="b3d-svg-hitarea" />
    </>
  ),
  inner_ear: (
    <>
      <circle cx="98" cy="54" r="5" className="b3d-svg-organ" />
      <circle cx="142" cy="54" r="5" className="b3d-svg-organ" />
    </>
  ),
};

/** Glyph badge positions (svg units) and leader anchors. */
const BADGE: Record<RegionKey, [number, number, number, number]> = {
  head: [62, 26, 106, 40],
  eyes: [184, 40, 131, 57],
  inner_ear: [190, 70, 146, 55],
  heart: [196, 142, 134, 142],
  lungs: [44, 120, 92, 128],
  torso: [44, 190, 94, 188],
  musculoskeletal: [196, 300, 139, 300],
  skin: [44, 300, 92, 300],
  cabin: [200, 22, 214, 30],
};

/** Draw order: environment and shell first, small organs on top. */
const DRAW_ORDER: RegionKey[] = ['cabin', 'skin', 'musculoskeletal', 'torso', 'lungs', 'heart', 'head', 'eyes', 'inner_ear'];

export function BodySvg({ states, selected, hovered, onHover, onSelect, loadingNote }: BodySvgProps) {
  return (
    <div className="b3d-svg-wrap">
      <svg
        className="b3d-svg"
        viewBox="0 0 240 440"
        role="img"
        aria-label="2B vücut haritası. Bölge durumları aşağıdaki listede."
        onMouseLeave={() => onHover(null)}
      >
        {DRAW_ORDER.map((k) => {
          const att = states[k].attention;
          const cls = [
            'b3d-svg-region',
            `att-${att.toLowerCase()}`,
            hovered === k ? 'is-hover' : '',
            selected === k ? 'is-selected' : '',
            selected && selected !== k && k !== 'cabin' && k !== 'skin' ? 'is-dim' : '',
          ].join(' ');
          return (
            <g
              key={k}
              className={cls}
              style={{ ['--c' as string]: ATTENTION[att].cssVar } as CSSProperties}
              onMouseEnter={() => onHover(k)}
              onMouseLeave={() => onHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(k);
              }}
            >
              {SHAPES[k]}
            </g>
          );
        })}
        {CHIP_ORDER.map((k) => {
          const att = ATTENTION[states[k].attention];
          const [bx, by, ax, ay] = BADGE[k];
          return (
            <g
              key={`b-${k}`}
              className={`b3d-svg-badge att-${states[k].attention.toLowerCase()}${selected === k ? ' is-selected' : ''}`}
              style={{ ['--c' as string]: att.cssVar } as CSSProperties}
              onClick={() => onSelect(k)}
              onMouseEnter={() => onHover(k)}
              onMouseLeave={() => onHover(null)}
            >
              <line x1={bx} y1={by} x2={ax} y2={ay} />
              <circle cx={bx} cy={by} r="10" />
              <text x={bx} y={by + 0.5} textAnchor="middle" dominantBaseline="middle">
                {att.glyph}
              </text>
              <title>{`${REGION_META[k].label}: ${att.label}`}</title>
            </g>
          );
        })}
      </svg>
      {loadingNote && <p className="b3d-svg-loading">{loadingNote}</p>}
    </div>
  );
}
