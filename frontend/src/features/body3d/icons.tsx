// Tiny inline SVG icons (no icon fonts / emoji dependence — fully offline).
import type { RegionKey } from './types';

const PATHS: Record<RegionKey, string[]> = {
  head: ['M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.2 2.5 5.3V20h6v-2h2.5a1.5 1.5 0 0 0 1.5-1.5V14l1.6-.6-1.6-3.4A7 7 0 0 0 12 3z', 'M9.5 9.5c.8-1.2 2.3-1.6 3.5-1'],
  eyes: ['M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z'],
  inner_ear: ['M7 9a5 5 0 1 1 9.4 2.4c-.9 1.5-2.4 2.2-2.4 4.1A3.5 3.5 0 0 1 10.5 19', 'M10 9.5a2 2 0 1 1 3.2 1.6'],
  heart: ['M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.3 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z'],
  lungs: ['M12 4v8', 'M12 10c-1.5 0-3-3-5-3-1.6 0-2.5 2.8-2.5 7 0 3 .9 5 2.6 5 2.4 0 4.9-1.6 4.9-4.6', 'M12 10c1.5 0 3-3 5-3 1.6 0 2.5 2.8 2.5 7 0 3-.9 5-2.6 5-2.4 0-4.9-1.6-4.9-4.6'],
  torso: ['M7 4h10l-1 6 1.5 4L16 20H8l-1.5-6L8 10z', 'M9.5 13.5h5'],
  musculoskeletal: ['M8.2 5.3a2 2 0 1 0-2.9 2.9l1.4 1.4 8.5 8.5 1.4 1.4a2 2 0 1 0 2.9-2.9 2 2 0 1 0-2.9-2.9L9.6 6.7l-1.4-1.4z'],
  skin: ['M4 8c2.7-2 5.3 2 8 0s5.3 2 8 0', 'M4 13c2.7-2 5.3 2 8 0s5.3 2 8 0', 'M4 18c2.7-2 5.3 2 8 0s5.3 2 8 0'],
  cabin: ['M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M3 12h6M15 12h6'],
};

export function RegionIcon({ region, size = 18 }: { region: RegionKey; size?: number }) {
  return (
    <svg
      className="b3d-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[region].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
