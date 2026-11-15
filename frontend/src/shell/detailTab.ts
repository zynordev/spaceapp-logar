// Lets code outside App (the guided tour) open a detail tab, the same way
// the HUD links do. App subscribes and switches + scrolls.
import { create } from 'zustand';

export type DetailTabId = 'rules' | 'inputs' | 'ground';

interface DetailTabRequest {
  request: { tab: DetailTabId; n: number } | null;
}

export const useDetailTabRequest = create<DetailTabRequest>(() => ({ request: null }));

export function requestDetailTab(tab: DetailTabId) {
  const prev = useDetailTabRequest.getState().request;
  useDetailTabRequest.setState({ request: { tab, n: (prev?.n ?? 0) + 1 } });
}
