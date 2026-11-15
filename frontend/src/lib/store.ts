// Shared app state (owned by the UI-shell track; features only READ it and call
// the exported setters). Keep it small: selection, auth, connectivity.
import { create } from 'zustand';

export type Role = 'ASTRONAUT' | 'CREW_MEDICAL_OFFICER' | 'GROUND';
export type Attention = 'NORMAL' | 'UNKNOWN' | 'WATCH' | 'ALERT' | 'CRITICAL';

export interface AuthUser {
  user_id: string;
  role: Role | null;
  anonymous: boolean;
}

const TOKEN_KEY = 'logar.token';
const EXP_KEY = 'logar.token_expires_at';

function readToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const exp = sessionStorage.getItem(EXP_KEY);
    if (!token) return null;
    if (exp && Date.parse(exp) <= Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(EXP_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export interface AppState {
  missionId: string | null;
  crewId: string | null;
  environmentTargetId: string | null;
  token: string | null;
  user: AuthUser | null;
  /** Set by api.ts on 401: the shell opens the login dialog. */
  loginRequired: boolean;
  /** Set by api.ts on network failure / cleared on next success. */
  offline: boolean;
  /** Bumped after any successful write so panels refetch immediately. */
  dataVersion: number;

  setSelection: (s: { missionId?: string | null; crewId?: string | null; environmentTargetId?: string | null }) => void;
  setToken: (token: string | null, expiresAt?: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  setLoginRequired: (v: boolean) => void;
  setOffline: (v: boolean) => void;
  bumpData: () => void;
}

export const useApp = create<AppState>((set) => ({
  missionId: null,
  crewId: null,
  environmentTargetId: null,
  token: readToken(),
  user: null,
  loginRequired: false,
  offline: false,
  dataVersion: 0,

  setSelection: (s) => set((prev) => ({ ...prev, ...s })),
  setToken: (token, expiresAt) => {
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_KEY, token);
        if (expiresAt) sessionStorage.setItem(EXP_KEY, expiresAt);
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(EXP_KEY);
      }
    } catch {
      /* storage unavailable: token lives in memory only */
    }
    set({ token, loginRequired: false });
  },
  setUser: (user) => set({ user }),
  setLoginRequired: (v) => set({ loginRequired: v }),
  setOffline: (v) => set((prev) => (prev.offline === v ? prev : { ...prev, offline: v })),
  bumpData: () => set((prev) => ({ dataVersion: prev.dataVersion + 1 })),
}));
