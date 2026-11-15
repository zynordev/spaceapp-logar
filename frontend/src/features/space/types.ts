// Shared types for the mission link view (overview main panel).

export type Profile = 'ISS' | 'MOON' | 'MARS';

/** Beam state. Every ground escalation is ALERT or CRITICAL by definition. */
export type BeamLevel = 'NORMAL' | 'ALERT' | 'CRITICAL' | 'UNKNOWN';

export interface LinkView {
  profile: Profile;
  /** One-way light delay from the server (mission profile), seconds. */
  delay: number | null;
  /** Items the ground teams have not acknowledged yet (all recipients). */
  pending: number | null;
  /** Pending flight-surgeon escalations. */
  escalations: number;
  level: BeamLevel;
}

/** Same hues as the attention tokens (tokens.css); always paired with a word. */
export const BEAM_COLORS: Record<BeamLevel, string> = {
  NORMAL: '#b9f3ea',
  ALERT: '#f59a3a',
  CRITICAL: '#ef4b4b',
  UNKNOWN: '#a9b8b6',
};

/** Dots drawn on the beam at most (the text always shows the real count). */
export const MAX_PACKETS = 12;
export const MAX_PRIORITY_PACKETS = 4;

export function packetCounts(link: LinkView): { normal: number; priority: number } {
  const priority = Math.min(link.escalations, MAX_PRIORITY_PACKETS);
  const normal = Math.min(Math.max(0, link.pending ?? 0), MAX_PACKETS - priority);
  return { normal, priority };
}
