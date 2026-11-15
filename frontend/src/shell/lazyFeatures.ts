// Feature panels are code-split so the shell paints instantly; three.js
// (body3d) only downloads with its own chunk. Export names = integration contract.
import { lazy } from 'react';

export const BodyMapPanel = lazy(() => import('../features/body3d').then((m) => ({ default: m.BodyMapPanel })));
export const AlertsPanel = lazy(() => import('../features/vitals').then((m) => ({ default: m.AlertsPanel })));
export const VitalsPanel = lazy(() => import('../features/vitals').then((m) => ({ default: m.VitalsPanel })));
export const InputsPanel = lazy(() => import('../features/inputs').then((m) => ({ default: m.InputsPanel })));
export const DemoScenarioControl = lazy(() =>
  import('../features/inputs').then((m) => ({ default: m.DemoScenarioControl })),
);
export const GroundPanel = lazy(() => import('../features/ground').then((m) => ({ default: m.GroundPanel })));

/** Start downloading the heavy chunks once the shell is idle. */
export function prefetchFeatures() {
  const run = () => {
    void import('../features/vitals');
    void import('../features/body3d');
    void import('../features/inputs');
    void import('../features/ground');
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 300);
}
