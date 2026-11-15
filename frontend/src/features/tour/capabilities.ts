// "Ne gerçek, ne simüle?" — one honest line per capability. Same table as
// docs/CAPABILITIES.md (keep both in sync).
export type CapState = 'works' | 'sim' | 'planned' | 'none';

export const CAP_STATE: Record<CapState, string> = {
  works: 'WORKS',
  sim: 'SIMULATED',
  planned: 'PLANNED',
  none: 'NONE',
};

export interface Capability {
  name: string;
  state: CapState;
  note: string;
}

export const CAPABILITIES: Capability[] = [
  { name: 'Rule engine and “Why?” explanation', state: 'works', note: '11 rules run locally on board. Only the cabin CO₂ threshold is sourced from NASA-STD-3001 (STANDARD); the others are DEMO (evidence class F).' },
  { name: 'Action cards V2', state: 'works', note: 'Pre-written steps, their reasons, “Done”, and a re-evaluation counter. No diagnosis, no medication, no dose.' },
  { name: 'Vital and cabin measurements', state: 'sim', note: 'Demo scenarios generate SYNTHETIC data. The API accepts measurements (POST /v1/measurements), but no real sensor is connected.' },
  { name: 'Wearable / cabin sensor drivers', state: 'none', note: 'No device integration; data arrives only through the API.' },
  { name: 'ECG strip', state: 'works', note: 'REAL recording: PhysioNet MIT-BIH NSR 16265 played back. Not live, no rhythm interpretation; the heart rate value does not come from this recording.' },
  { name: 'Laboratory values', state: 'works', note: 'NASA OSDR import (REAL, e.g. OSD-569) and manual entry (MANUAL). Reference ranges come from the source.' },
  { name: 'Space weather (solar particle event)', state: 'works', note: 'NASA DONKI SEP event times (May 2024, packaged file in the repository; not a live API). Dose values are SYNTHETIC.' },
  { name: 'Red flag notification', state: 'works', note: 'A reported symptom opens a CRITICAL alert and an emergency card without waiting for a threshold.' },
  { name: 'Automatic escalation to the flight surgeon', state: 'works', note: 'Created automatically, once per Warning or Critical alert.' },
  { name: 'Packet and acknowledgement to the ground team', state: 'works', note: 'A packet per recipient (flight surgeon, life support, radiation, mission control); sha256 digest, and an HMAC-SHA256 signature if the server has a key. No encryption.' },
  { name: 'Earth link and light delay', state: 'sim', note: 'The delay is only animated on the ground console (#/ground); there is no real space communication or DTN.' },
  { name: 'Mission profile (ISS / Moon / Mars)', state: 'works', note: 'One-way delay and escalation owner come from the server. If the server has no endpoint, the selector appears disabled.' },
  { name: 'Role-based sign-in', state: 'works', note: 'Optional signed token (Astronaut / Crew medical officer / Ground team). Demo sign-in is visible only when it is explicitly enabled on the server.' },
  { name: 'Offline operation', state: 'works', note: 'Local server and SQLite on board; not dependent on Earth. When the connection drops, the interface shows the last known data, labelled as such.' },
  { name: '3D body map', state: 'works', note: 'BodyParts3D model (CC BY 4.0). A region is a rule group; it is not a diagnosis and not an anatomical finding.' },
  { name: 'Trend and HRV', state: 'works', note: 'Hourly and daily summaries. HRV (RMSSD) is data only: no threshold and no rule.' },
  { name: 'Routines and activity declaration', state: 'works', note: 'Water, exercise, sleep window, periodic tests (DEMO intervals). No medication routine.' },
  { name: 'Expert validation of DEMO thresholds', state: 'planned', note: 'Waiting for flight medicine expert review; until then the DEMO label stays.' },
  { name: 'No diagnosis, no medication or dose recommendations', state: 'none', note: 'Deliberately out of scope.' },
  { name: 'Tool / equipment commands', state: 'none', note: 'The software never operates any system itself.' },
];
