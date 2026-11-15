// Inline SVG icon set (no icon font / CDN: fully offline). 24x24 grid,
// stroke = currentColor. Always decorative (aria-hidden) — pair with text.
import type { ReactElement } from 'react';

export type IconName =
  | 'check'
  | 'question'
  | 'eye'
  | 'alert'
  | 'critical'
  | 'info'
  | 'x'
  | 'offline'
  | 'user'
  | 'logout'
  | 'lock'
  | 'refresh'
  | 'chevron-down'
  | 'clock'
  | 'satellite'
  | 'warning'
  | 'heart'
  | 'pulse'
  | 'droplet'
  | 'thermometer'
  | 'lungs'
  | 'gauge'
  | 'wind'
  | 'radiation'
  | 'moon'
  | 'signal'
  | 'arrow-down';

const paths: Record<IconName, ReactElement> = {
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  question: (
    <>
      <path d="M9.2 9.2a2.9 2.9 0 1 1 4.1 2.6c-.9.5-1.3 1.1-1.3 2v.6" />
      <circle cx="12" cy="17.6" r=".6" fill="currentColor" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.2" r=".6" fill="currentColor" />
    </>
  ),
  critical: (
    <>
      <path d="M8.2 2.8h7.6l5.4 5.4v7.6l-5.4 5.4H8.2l-5.4-5.4V8.2z" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.2" r=".6" fill="currentColor" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r=".6" fill="currentColor" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  offline: (
    <>
      <path d="M2.5 8.5a14 14 0 0 1 19 0M5.5 12a9.5 9.5 0 0 1 13 0M8.6 15.4a5 5 0 0 1 6.8 0" />
      <path d="M3 3l18 18" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4.5H6.5v15H14" />
      <path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4v4h-4" />
    </>
  ),
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  satellite: (
    <>
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" transform="rotate(45 12 12)" />
      <path d="M3.5 8.5l3-3 3.5 3.5-3 3zM14 15l3-3 3.5 3.5-3 3z" />
      <path d="M5 19a4 4 0 0 0 4 0" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  pulse: <path d="M2.5 12.5h4l2-4.5 3.5 9 2.5-6.5 1.5 2h5.5" />,
  droplet: <path d="M12 3.5s6 6.3 6 10.7a6 6 0 0 1-12 0C6 9.8 12 3.5 12 3.5z" />,
  thermometer: (
    <>
      <path d="M10 13.6V5.5a2 2 0 0 1 4 0v8.1a4 4 0 1 1-4 0z" />
      <path d="M12 9.5v6" />
    </>
  ),
  lungs: (
    <>
      <path d="M12 4v7.5M12 11.5l-2.5 2M12 11.5l2.5 2" />
      <path d="M8.5 7.5C6 8.5 4 12.5 4 17.5c0 1.6 1.4 2.4 2.8 1.9l2.7-1V9.2c0-1.1-.5-1.9-1-1.7zM15.5 7.5c2.5 1 4.5 5 4.5 10 0 1.6-1.4 2.4-2.8 1.9l-2.7-1V9.2c0-1.1.5-1.9 1-1.7z" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l4-5.5" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </>
  ),
  wind: <path d="M3 9h11a2.8 2.8 0 1 0-2.8-2.8M3 15h15a2.8 2.8 0 1 1-2.8 2.8M3 12h7" />,
  radiation: (
    <>
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 3.5a8.5 8.5 0 0 1 7.4 4.3L14 11M12 3.5a8.5 8.5 0 0 0-7.4 4.3L10 11M7.6 19.4a8.5 8.5 0 0 0 8.8 0L13.5 14h-3z" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  signal: (
    <>
      <path d="M4 20V16M9 20v-7M14 20V9.5M19 20V5" />
    </>
  ),
  'arrow-down': <path d="M12 4.5v15M6 13.5l6 6 6-6" />,
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `ui-icon ${className}` : 'ui-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
