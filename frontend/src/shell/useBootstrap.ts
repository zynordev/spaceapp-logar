// Shell data bootstrap: auth config + current user, mission list and the
// automatic first mission/crew/environment selection (like the old panel).
import { useEffect } from 'react';
import { usePolling, type ApiError } from '../lib/api';
import { useApp, type AuthUser, type Role } from '../lib/store';
import type { AuthConfigRead, AuthMeRead, MissionRead } from './types';

export interface AuthInfo {
  /** null while unknown (first request pending / server unreachable). */
  authRequired: boolean | null;
  /** false = server has no auth secret: hide the login button. */
  authConfigured: boolean | null;
}

/** Display-only decode of the token claims {sub, role} (the server verifies it). */
function userFromToken(token: string): AuthUser | null {
  try {
    const part = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
    if (typeof claims.sub !== 'string') return null;
    return { user_id: claims.sub, role: (claims.role as Role) ?? null, anonymous: false };
  } catch {
    return null;
  }
}

export function useAuthBootstrap(): AuthInfo {
  const config = usePolling<AuthConfigRead>('/v1/auth/config', 60_000);
  const me = usePolling<AuthMeRead>('/v1/auth/me', 60_000);
  const setUser = useApp((s) => s.setUser);
  const token = useApp((s) => s.token);

  useEffect(() => {
    if (me.data) setUser(me.data);
    else if (me.error?.status === 401) setUser(null);
    // Server without /v1/auth/me: show the identity carried by our own token.
    else if (me.error?.notFound) setUser(token ? userFromToken(token) : null);
  }, [me.data, me.error, token, setUser]);

  // Logged out: drop the previous user immediately (me refetches as anonymous).
  useEffect(() => {
    if (!token) setUser(null);
  }, [token, setUser]);

  // Contract A: a server without /v1/auth/config behaves as auth_required=false.
  if (config.data) return { authRequired: config.data.auth_required, authConfigured: config.data.auth_configured };
  if (config.error?.notFound) return { authRequired: false, authConfigured: null };
  return { authRequired: null, authConfigured: null };
}

export interface MissionsInfo {
  missions: MissionRead[] | null;
  current: MissionRead | null;
  loading: boolean;
  error: ApiError | null;
}

export function useMissions(): MissionsInfo {
  const { data, error, loading } = usePolling<MissionRead[]>('/v1/missions', 15_000);
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const envId = useApp((s) => s.environmentTargetId);
  const setSelection = useApp((s) => s.setSelection);
  const current = data?.find((m) => m.mission_id === missionId) ?? null;

  useEffect(() => {
    if (!data || data.length === 0) return;
    if (!missionId) {
      // First load: newest mission (the API orders by newest activity).
      const m = data[0];
      setSelection({
        missionId: m.mission_id,
        crewId: m.crew_member_ids[0] ?? null,
        environmentTargetId: m.environment_target_ids[0] ?? null,
      });
      return;
    }
    // A selection made elsewhere (e.g. a demo run) may name a mission that the
    // list doesn't contain yet; keep it and only fill missing crew/environment.
    if (current) {
      const patch: Parameters<typeof setSelection>[0] = {};
      if (!crewId || !current.crew_member_ids.includes(crewId)) {
        if (current.crew_member_ids.length && current.crew_member_ids[0] !== crewId) patch.crewId = current.crew_member_ids[0];
      }
      if (!envId && current.environment_target_ids.length) patch.environmentTargetId = current.environment_target_ids[0];
      if (Object.keys(patch).length) setSelection(patch);
    }
  }, [data, missionId, crewId, envId, current, setSelection]);

  return { missions: data, current, loading: loading && !data, error };
}

/** Select a mission and its first crew member / environment target. */
export function selectMission(m: MissionRead) {
  useApp.getState().setSelection({
    missionId: m.mission_id,
    crewId: m.crew_member_ids[0] ?? null,
    environmentTargetId: m.environment_target_ids[0] ?? null,
  });
}
