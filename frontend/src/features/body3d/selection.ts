// Tiny external selection hook for the body map (guided tour, deep links).
// `requestBodyRegion('head')` selects a region in the mounted BodyMapPanel the
// same way a click would; `null` clears it. A counter makes repeats count.
import { create } from 'zustand';
import type { RegionKey } from './types';

interface BodySelection {
  request: { region: RegionKey | null; n: number } | null;
}

export const useBodySelection = create<BodySelection>(() => ({ request: null }));

export function requestBodyRegion(region: RegionKey | null) {
  const prev = useBodySelection.getState().request;
  useBodySelection.setState({ request: { region, n: (prev?.n ?? 0) + 1 } });
}

/** Forget the last request (a later remount then keeps its own default). */
export function forgetBodyRequest() {
  useBodySelection.setState({ request: null });
}
