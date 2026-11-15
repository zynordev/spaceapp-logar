// 2D fallback (no WebGL, lost context, or while the 3D chunk loads). Same
// story in flat shapes: Earth, the target, the beam and the queue dots.
// Drawn in the panel's design pixels (1246 x 702).
import { useMemo } from 'react';
import { BEAM_COLORS, packetCounts, type LinkView } from './types';

const W = 1246;
const H = 702;

export function SpaceSvg({ link }: { link: LinkView }) {
  const stars = useMemo(() => {
    let a = 977;
    const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 140 }, () => ({ x: rnd() * W, y: rnd() * H, r: 0.6 + Math.pow(rnd(), 3) * 1.4, o: 0.25 + rnd() * 0.5 }));
  }, []);
  const iss = link.profile === 'ISS';
  const earth = iss ? { cx: 560, cy: 1500, r: 1080 } : { cx: 300, cy: 440, r: 140 };
  const target = iss ? null : link.profile === 'MARS' ? { cx: 960, cy: 300, r: 84, fill: '#9a4a28' } : { cx: 970, cy: 290, r: 52, fill: '#7a7a76' };
  const from = iss ? { x: 905, y: 250 } : { x: target!.cx - target!.r * 0.9, y: target!.cy + target!.r * 0.3 };
  const to = iss ? { x: 330, y: 470 } : { x: earth.cx + earth.r * 0.85, y: earth.cy - earth.r * 0.45 };
  const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - (iss ? 70 : 120) };
  const { normal, priority } = packetCounts(link);
  const n = normal + priority;
  const at = (u: number) => ({
    x: (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * ctrl.x + u * u * to.x,
    y: (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * ctrl.y + u * u * to.y,
  });
  const color = BEAM_COLORS[link.level];
  return (
    <svg className="sp__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="sp-earth" cx="0.65" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#2f6a86" />
          <stop offset="0.6" stopColor="#123c55" />
          <stop offset="1" stopColor="#06141c" />
        </radialGradient>
      </defs>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#e8f4f2" opacity={s.o} />
      ))}
      <circle cx={earth.cx} cy={earth.cy} r={earth.r} fill="url(#sp-earth)" />
      {target && <circle cx={target.cx} cy={target.cy} r={target.r} fill={target.fill} />}
      {iss && (
        <g transform={`translate(${from.x + 10} ${from.y - 6})`} fill="#c9d1d1">
          <rect x={-50} y={-1.5} width={100} height={3} />
          <rect x={-46} y={-22} width={12} height={44} fill="#2b3f50" />
          <rect x={34} y={-22} width={12} height={44} fill="#2b3f50" />
          <rect x={-5} y={-12} width={10} height={24} />
        </g>
      )}
      <path
        d={`M${from.x} ${from.y} Q${ctrl.x} ${ctrl.y} ${to.x} ${to.y}`}
        fill="none"
        stroke={color}
        strokeOpacity={link.level === 'NORMAL' ? 0.5 : 0.8}
        strokeWidth={link.level === 'NORMAL' ? 2 : 3}
        strokeDasharray={link.level === 'UNKNOWN' || link.pending === 0 ? '8 7' : undefined}
      />
      {Array.from({ length: n }, (_, i) => {
        const p = at((i + 0.5) / n);
        return <circle key={i} cx={p.x} cy={p.y} r={i < priority ? 6 : 3.5} fill={i < priority ? color : BEAM_COLORS.NORMAL} />;
      })}
      <circle cx={from.x} cy={from.y} r={4} fill="#f3fbfa" />
      <circle cx={to.x} cy={to.y} r={4} fill="#f3fbfa" />
      <text x={to.x - 14} y={to.y + 30} className="sp__svgtext" textAnchor="end">
        DÜNYA · YER EKİPLERİ
      </text>
      <text x={from.x + 14} y={from.y + (iss ? 50 : 30)} className="sp__svgtext">
        {iss ? 'İSTASYON · ALÇAK DÜNYA YÖRÜNGESİ' : link.profile === 'MARS' ? 'HABİTAT · MARS' : 'HABİTAT · AY'}
      </text>
    </svg>
  );
}
