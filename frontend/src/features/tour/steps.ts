// Tour steps. Each step points at REAL UI (a CSS selector), optionally moves
// the app there first (route / detail tab / body region / a real button) and
// shows a short, honest Turkish caption. Same order as docs/VIDEO_SCRIPT.md.
import { api, qs } from '../../lib/api';
import { useApp } from '../../lib/store';
import { requestBodyRegion } from '../body3d/selection';
import type { DetailTabId } from '../../shell/detailTab';
import type { TourId } from './store';

export interface StepCtx {
  missionId: string;
  /** Resolves with the element once it exists (null after `timeoutMs` or when the step was left). */
  waitFor: (selector: string, timeoutMs?: number) => Promise<HTMLElement | null>;
  /** True once the user left this step (stop async work). */
  left: () => boolean;
  /** Short status line under the caption ("Preparing packet…"). */
  note: (text: string | null) => void;
}

export interface TourStep {
  id: string;
  /** Video beat this step belongs to (docs/VIDEO_SCRIPT.md). */
  beat: string;
  title: string;
  caption: string;
  /** Honesty line shown under the caption. */
  honest?: string;
  route: 'app' | 'console';
  tab?: DetailTabId;
  /** Element(s) to spotlight; the first match wins. Prefer `data-tour` hooks. */
  target: string[];
  /** Runs before the target is looked up (e.g. open the 3D body panel). */
  before?: (ctx: StepCtx) => void | Promise<void>;
  enter?: (ctx: StepCtx) => void | Promise<void>;
  /** Auto-advance dwell time. */
  ms?: number;
}

interface AlertLite {
  id: string;
  rule_id: string;
  status: string;
}

async function focusAlert(ctx: StepCtx, ruleId: string, metric: string | null) {
  try {
    const list = await api<AlertLite[]>('GET', `/v1/alerts${qs({ mission_id: ctx.missionId, limit: 100 })}`);
    const a = list.find((x) => x.rule_id === ruleId && x.status !== 'RESOLVED');
    const { useVitalsUi } = await import('../vitals/data');
    if (a) useVitalsUi.getState().setActiveAlert(a.id);
    if (metric) useVitalsUi.getState().select(metric, ruleId);
  } catch {
    /* the spotlight still shows the panel; the caption stays true */
  }
}

/** Say what actually happened in this run (escalations are never assumed). */
async function escalationNote(ctx: StepCtx, none: string) {
  try {
    const list = await api<{ priority: string; status: string }[]>('GET', `/v1/sync/escalations${qs({ mission_id: ctx.missionId })}`);
    if (ctx.left()) return;
    if (list.length === 0) ctx.note(none);
    else {
      const crit = list.filter((e) => e.priority === 'CRITICAL').length;
      ctx.note(`${list.length} priority notification(s) were created in this mission${crit ? ` (${crit} Critical)` : ''}.`);
    }
  } catch {
    /* 404 on an older server: the panel itself says so */
  }
}

/** Console steps: say when the current delay makes the travel invisible. */
async function delayNote(ctx: StepCtx) {
  try {
    // The console uses the server delay only with its "Server setting" preset (the default).
    const preset = (JSON.parse(sessionStorage.getItem('logar.console.delay') ?? '{}') as { preset?: string }).preset ?? 'server';
    if (preset !== 'server') return;
    const s = await api<{ link_delay_seconds: number | null }>('GET', `/v1/sync/status${qs({ mission_id: ctx.missionId })}`);
    if (ctx.left()) return;
    const d = s.link_delay_seconds;
    if (d == null) ctx.note('The server has no delay set (0 s is assumed). Choose “Mars average” in the console, or set the mission profile to Mars.');
    else if (d < 5) ctx.note(`One-way delay ≈${d.toLocaleString('en-GB', { maximumFractionDigits: 1 })} s: the signal arrives almost immediately. In the Mars profile it is ≈12.5 min (≈12.5 s at 60× display).`);
  } catch {
    /* the console shows its own status */
  }
}

/**
 * Mission screen: the big panel shows the 3D body only after a crew card is
 * clicked. Click the selected crew member's card (as a user would) unless the
 * body is already open; never switch to another crew member.
 */
async function openBody(ctx: StepCtx) {
  const scene = await ctx.waitFor('[data-tour="scene"]');
  if (!scene || ctx.left() || scene.dataset.open === 'true') return;
  const crew = useApp.getState().crewId;
  if (!crew) return;
  const btn = await ctx.waitFor(`[data-tour="crew-open"][data-crew="${CSS.escape(crew)}"]`, 8000);
  if (!btn || ctx.left() || btn.getAttribute('aria-pressed') === 'true') return;
  btn.click();
  await ctx.waitFor('[data-tour="scene"][data-open="true"]', 3000);
}

/** The selected crew member's card (open), else any crew card. */
const CREW_CARD = ['[data-tour="crew-card"][data-open="true"]', '[data-tour="crew-card"]', '[data-tour="hud"]'];
const SCENE = ['[data-tour="scene"]', '[data-tour="hud"]'];

function click(el: HTMLElement | null) {
  if (el && !(el as HTMLButtonElement).disabled) el.click();
}

/** Console: prepare the flight-surgeon packet, then press "Onayla (ack)" once every item has reached Earth. */
async function consoleAck(ctx: StepCtx) {
  const panel = await ctx.waitFor('section[aria-labelledby="console-packet-title"]');
  if (!panel || ctx.left()) return;
  const radio = panel.querySelector<HTMLInputElement>('input[name="console-recipient"][value="FLIGHT_SURGEON"]');
  if (radio && !radio.checked) radio.click();
  await new Promise((r) => setTimeout(r, 150));
  if (ctx.left()) return;
  ctx.note('Preparing the flight surgeon packet…');
  click(panel.querySelector<HTMLElement>('.console-packet__actions .ui-btn'));
  const deadline = Date.now() + 90_000;
  while (!ctx.left() && Date.now() < deadline) {
    const ack = panel.querySelector<HTMLButtonElement>('.console-packet .ui-btn--primary');
    if (ack && !ack.disabled) {
      ctx.note('The tour pressed the “Acknowledge (ack)” button on behalf of the ground team (demo).');
      ack.click();
      return;
    }
    if (ack?.disabled) {
      if (panel.querySelector('.console-packet .console-inline-note')) {
        ctx.note('Items in the packet have not reached Earth yet; the acknowledgement will be given once all have arrived…');
      } else {
        ctx.note('No new items to acknowledge.');
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!ctx.left() && !panel.querySelector('.console-problem')) ctx.note(null);
}

const DECISION_SUPPORT = 'Decision support, not a diagnosis.';
const SYNTHETIC = 'Data comes from a synthetic demo scenario; not real astronaut measurements.';

export const TOURS: Record<TourId, TourStep[]> = {
  co2: [
    {
      id: 'cabin-co2',
      beat: '0–4 s',
      title: 'Cabin CO₂ is rising',
      caption: 'The synthetic scenario raises the cabin CO₂ partial pressure. The CO₂ column in the top strip shows the value, the status and the source of the threshold.',
      honest: SYNTHETIC,
      route: 'app',
      target: ['[data-tour="metric-CABIN_CO2_PARTIAL_PRESSURE"]', '[data-tour="cabin"]', '[data-tour="hud"]'],
      before: openBody,
      enter: () => requestBodyRegion('cabin'),
      ms: 4000,
    },
    {
      id: 'body-cabin',
      beat: '0–4 s',
      title: 'Cabin region on the 3D map',
      caption: 'The crew card opens the astronaut’s 3D body model. The cabin environment region is marked; on the right, the same astronaut’s vital findings and the recorded ECG strip remain.',
      honest: SYNTHETIC,
      route: 'app',
      target: SCENE,
      before: openBody,
      enter: () => requestBodyRegion('cabin'),
      ms: 4000,
    },
    {
      id: 'body-head',
      beat: '0–4 s',
      title: 'Astronaut reports a headache',
      caption: 'The subjective report is linked to the same rule: the head region lights up too. The system shows both findings together.',
      honest: DECISION_SUPPORT,
      route: 'app',
      target: SCENE,
      before: openBody,
      enter: () => requestBodyRegion('head'),
      ms: 4000,
    },
    {
      id: 'action-card',
      beat: '4–10 s',
      title: 'Action card: what should I do, and why?',
      caption: 'Pre-written steps, the reason for each step and a re-assessment timer. The CO₂ threshold comes from NASA-STD-3001 (STANDARD).',
      honest: 'Other thresholds are DEMO (evidence class F): awaiting expert validation. The software issues no tool or equipment commands.',
      route: 'app',
      tab: 'rules',
      target: ['#details .vt-ac', '#details'],
      enter: (ctx) => focusAlert(ctx, 'ENV_CO2_NOMINAL_V1', 'CABIN_CO2_PARTIAL_PRESSURE'),
      ms: 6000,
    },
    {
      id: 'escalation',
      beat: '10–17 s',
      title: 'Automatic escalation to the flight surgeon',
      caption: 'As soon as a Warning or Critical alarm opens, a priority notification for the flight surgeon is created automatically; nobody presses a button.',
      honest: 'The notification goes to Earth in the link window; the ship keeps working without waiting.',
      route: 'app',
      tab: 'ground',
      target: ['.gp-esc', '.gp-root'],
      enter: (ctx) => escalationNote(ctx, 'In this scenario the CO₂ alarm stayed at Watch: no priority notification was needed. See the automatic notification in the “Red flag” step.'),
      ms: 5000,
    },
    {
      id: 'routing',
      beat: '10–17 s',
      title: 'Routing to the right team',
      caption: 'CO₂ and cabin atmosphere data go to the life support team packet; health data goes to the flight surgeon.',
      route: 'app',
      tab: 'ground',
      target: ['.gp-rcp--life_support', '.gp-rcps'],
      ms: 3500,
    },
    {
      id: 'packet',
      beat: '10–17 s',
      title: 'Signed packet',
      caption: 'Packet contents are summarised with sha256; if a key is set on the server, they are signed with HMAC-SHA256. Earth checks the digest when acknowledging.',
      honest: 'Integrity and source verification — not encryption.',
      route: 'app',
      tab: 'ground',
      target: ['.gp-rcp--flight_surgeon', '.gp-rcps'],
      enter: async (ctx) => {
        const card = await ctx.waitFor('.gp-rcp--flight_surgeon');
        if (!card || ctx.left() || card.querySelector('.gp-packet')) return;
        click(card.querySelector<HTMLElement>('.gp-actions .gp-btn'));
      },
      ms: 5000,
    },
    {
      id: 'console',
      beat: '17–24 s',
      title: 'Earth sees it late',
      caption: 'The ground control console sees the same events with the light delay. The counter shows when the signal will reach Earth.',
      honest: 'Delay simulation: data arrives from the server instantly; only this screen animates the delay.',
      route: 'console',
      target: ['.console-link-band', '.console-main'],
      enter: delayNote,
      ms: 6000,
    },
    {
      id: 'ack',
      beat: '24–30 s',
      title: 'Ground team acknowledges',
      caption: 'When the flight surgeon packet arrives, the ground team acknowledges it (ack). The tour presses the acknowledge button on behalf of the ground team.',
      honest: 'When signed in, only the ground team (GROUND) role can give the acknowledgement.',
      route: 'console',
      target: ['section[aria-labelledby="console-packet-title"]', '.console-main'],
      enter: consoleAck,
      ms: 8000,
    },
    {
      id: 'ack-back',
      beat: '24–30 s',
      title: 'Acknowledgement returns to the ship',
      caption: 'The acknowledgement travels back to the ship with the same delay. The ship keeps working with its own decision support in the meantime.',
      honest: DECISION_SUPPORT + ' Delay simulation.',
      route: 'console',
      target: ['.console-link-band', '.console-main'],
      enter: delayNote,
      ms: 6000,
    },
  ],
  redflag: [
    {
      id: 'rf-report',
      beat: '0–4 s',
      title: 'Chest pain report',
      caption: 'While measurements are normal, the astronaut reports chest pain (red flag). The torso region is marked.',
      honest: SYNTHETIC,
      route: 'app',
      target: SCENE,
      before: openBody,
      enter: () => requestBodyRegion('torso'),
      ms: 4000,
    },
    {
      id: 'rf-critical',
      beat: '4–10 s',
      title: 'Immediately CRITICAL',
      caption: 'A red flag does not wait for an average: on the crew card the overall status becomes Critical at once, and the emergency line shows the open alarm. Normal measurements do not rule out a serious event.',
      honest: DECISION_SUPPORT,
      route: 'app',
      target: CREW_CARD,
      before: openBody,
      ms: 5000,
    },
    {
      id: 'rf-card',
      beat: '10–17 s',
      title: 'Emergency action card',
      caption: 'The card puts the mission procedure first. The alarm does not close by itself when measurements return; the team reviews and closes it.',
      honest: 'No diagnosis is made and no medication or dose is recommended.',
      route: 'app',
      tab: 'rules',
      target: ['#details .vt-ac', '#details'],
      enter: (ctx) => focusAlert(ctx, 'RED_FLAG_SYMPTOM_V1', null),
      ms: 6000,
    },
    {
      id: 'rf-escalation',
      beat: '17–24 s',
      title: 'CRITICAL notification to the flight surgeon',
      caption: 'A Critical alarm creates the priority notification for the flight surgeon automatically; nobody presses a button.',
      route: 'app',
      tab: 'ground',
      target: ['.gp-esc', '.gp-root'],
      enter: (ctx) => escalationNote(ctx, 'No priority notification is showing in this mission yet.'),
      ms: 5000,
    },
    {
      id: 'rf-console',
      beat: '24–30 s',
      title: 'Earth learns with a delay',
      caption: 'The ground team sees the notification only when the signal arrives. If the delay is long, the first decision rests with the health officer on board.',
      honest: 'Delay simulation — display only.',
      route: 'console',
      target: ['.console-link-band', '.console-main'],
      enter: delayNote,
      ms: 6000,
    },
  ],
};
