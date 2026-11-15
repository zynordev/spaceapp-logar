// Guided jury tour overlay: a flat spotlight around the real UI element and a
// caption card. Mounted at the root (above App and the #/yer console) so the
// tour survives the route change. Keys: → / PageDown next, ← / PageUp back,
// Esc closes. Respects prefers-reduced-motion (no animated spotlight / scroll).
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useApp } from '../../lib/store';
import { Button, Icon, Spinner } from '../../ui';
import { forgetBodyRequest } from '../body3d/selection';
import { requestDetailTab } from '../../shell/detailTab';
import { TOURS, type StepCtx } from './steps';
import { TOUR_SCENARIO, useTour } from './store';
import './tour.css';

function useReducedMotion(): boolean {
  const [r, setR] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setR(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return r;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;

/** Bring the target just below the sticky chrome (top bar + bands). */
function scrollToTarget(el: HTMLElement, reduced: boolean) {
  const chrome = /^#\/(ground|yer)/.test(window.location.hash)
    ? 0
    : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-h')) || 0;
  const r = el.getBoundingClientRect();
  // Top-aligned just under the chrome: the caption card gets the space below.
  const top = Math.max(0, r.top + window.scrollY - chrome - 12);
  window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
}

function sameBox(a: Box | null, b: Box | null) {
  return !!a && !!b && Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

export function TourHost() {
  const tour = useTour((s) => s.tour);
  const step = useTour((s) => s.step);
  const phase = useTour((s) => s.phase);
  const error = useTour((s) => s.error);
  const missionId = useTour((s) => s.missionId);
  const auto = useTour((s) => s.auto);
  const reduced = useReducedMotion();
  const uid = useId();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const steps = tour ? TOURS[tour] : [];
  const def = phase === 'running' ? steps[step] ?? null : null;
  const last = step >= steps.length - 1;

  const stop = useCallback(() => {
    useTour.getState().stop();
    forgetBodyRequest();
  }, []);
  const next = useCallback(() => {
    const s = useTour.getState();
    if (s.phase !== 'running' || !s.tour) return;
    if (s.step >= TOURS[s.tour].length - 1) stop();
    else s.go(s.step + 1);
  }, [stop]);
  const prev = useCallback(() => {
    const s = useTour.getState();
    if (s.phase === 'running' && s.step > 0) s.go(s.step - 1);
  }, []);

  // Enter a step: route, tab, its own action, then find the element.
  useEffect(() => {
    if (!def || !missionId) return;
    let left = false;
    setTarget(null);
    setBox(null);
    setNote(null);
    setReady(false);
    const onConsole = /^#\/(ground|yer)/.test(window.location.hash);
    if (def.route === 'console' && !onConsole) window.location.hash = '#/ground';
    if (def.route === 'app' && onConsole) window.location.hash = '#/';
    if (def.tab) requestDetailTab(def.tab);

    const waitFor = (selector: string, timeoutMs = 10_000) =>
      new Promise<HTMLElement | null>((resolve) => {
        const t0 = Date.now();
        const tick = () => {
          if (left) return resolve(null);
          const el = document.querySelector<HTMLElement>(selector);
          if (el) return resolve(el);
          if (Date.now() - t0 > timeoutMs) return resolve(null);
          setTimeout(tick, 120);
        };
        tick();
      });
    const ctx: StepCtx = { missionId, waitFor, left: () => left, note: (t) => !left && setNote(t) };

    (async () => {
      // Let the route / tab switch render first.
      await new Promise((r) => setTimeout(r, def.route === 'console' ? 250 : 60));
      // Put the screen in the state the step talks about (e.g. open the 3D body).
      try {
        await def.before?.(ctx);
      } catch {
        /* a failed helper action never breaks the tour */
      }
      if (left) return;
      // Find the spotlight target (first selector that appears).
      let el: HTMLElement | null = null;
      const t0 = Date.now();
      while (!left && !el && Date.now() - t0 < 10_000) {
        for (const sel of def.target) {
          el = document.querySelector<HTMLElement>(sel);
          if (el) break;
        }
        if (!el) await new Promise((r) => setTimeout(r, 150));
      }
      if (left) return;
      if (el) {
        scrollToTarget(el, reduced);
        setTarget(el);
      }
      setReady(true);
      // Panels may still be growing or re-mounting (lazy chunks, data, the 3D
      // body opening): find the target again and settle twice.
      const settle = () => {
        if (left) return;
        let fresh: HTMLElement | null = null;
        for (const sel of def.target) {
          fresh = document.querySelector<HTMLElement>(sel);
          if (fresh) break;
        }
        if (!fresh) return;
        if (fresh !== el) {
          el = fresh;
          setTarget(fresh);
        }
        scrollToTarget(fresh, true);
      };
      setTimeout(settle, 700);
      setTimeout(settle, 1600);
      try {
        await def.enter?.(ctx);
      } catch {
        /* a failed helper action never breaks the tour */
      }
    })();
    return () => {
      left = true;
    };
  }, [def, missionId, reduced]);

  // Track the target's box (scroll, resize, layout shifts).
  useEffect(() => {
    if (!target) return;
    let raf = 0;
    let prevBox: Box | null = null;
    const measure = () => {
      if (!target.isConnected) {
        // The element was re-mounted (e.g. the 3D body opened): follow the new one.
        const sels = def?.target ?? [];
        for (const sel of sels) {
          const fresh = document.querySelector<HTMLElement>(sel);
          if (fresh) {
            setTarget(fresh);
            return;
          }
        }
        setBox(null);
        return;
      }
      const r = target.getBoundingClientRect();
      const top = Math.max(r.top - PAD, 0);
      const bottom = Math.min(r.bottom + PAD, window.innerHeight);
      const b = { top, left: Math.max(r.left - PAD, 0), width: Math.min(r.width + PAD * 2, window.innerWidth), height: Math.max(bottom - top, 0) };
      if (!sameBox(prevBox, b)) {
        prevBox = b;
        setBox(b);
      }
    };
    const loop = () => {
      measure();
      raf = requestAnimationFrame(loop);
    };
    loop();
    // rAF pauses in background tabs / hidden panes: scroll events and a slow
    // timer keep the spotlight on the element there too.
    const onScroll = () => measure();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    const iv = setInterval(measure, 250);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [target, def]);

  // Keyboard.
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest('input, textarea, select, [contenteditable="true"]');
      if (e.key === 'Escape') {
        if (document.querySelector('dialog[open]')) return; // a dialog handles its own Esc
        e.preventDefault();
        stop();
      } else if (!typing && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
        e.preventDefault();
        next();
      } else if (!typing && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour, next, prev, stop]);

  // Auto-advance (optional) once the step is ready.
  useEffect(() => {
    if (!auto || !def || !ready) return;
    const id = setTimeout(next, def.ms ?? 5000);
    return () => clearTimeout(id);
  }, [auto, def, ready, next]);

  // Focus the card when the tour starts (keyboard users land on the controls).
  useEffect(() => {
    if (tour) requestAnimationFrame(() => (nextRef.current ?? cardRef.current)?.focus());
  }, [tour, phase]);

  // A finished demo selection stays; clearing the tour only removes the overlay.
  const offline = useApp((s) => s.offline);
  if (!tour) return null;

  const title = TOUR_SCENARIO[tour].title;
  // Card goes to the half of the screen the spotlight leaves free.
  const cardH = (cardRef.current?.offsetHeight ?? 200) + 16;
  const topLimit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-real')) || 64;
  const below = box ? window.innerHeight - (box.top + box.height) : Infinity;
  const above = box ? box.top - topLimit : 0;
  const place = !box || below >= cardH ? 'bottom' : above >= cardH ? 'top' : 'bottom'; // tall target: its head (title, badges) stays visible

  return (
    <div className={`tour${reduced ? ' is-reduced' : ''}`}>
      {phase === 'running' && box ? (
        <div
          className="tour__spot"
          aria-hidden="true"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      ) : (
        <div className="tour__dim" aria-hidden="true" />
      )}

      <div
        ref={cardRef}
        className={`tour__card tour__card--${place}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${uid}-t`}
        aria-describedby={`${uid}-c`}
        tabIndex={-1}
      >
        <header className="tour__head">
          <span className="tour__kicker">
            <Icon name="play" size={12} /> Scenario tour · {title}
          </span>
          {phase === 'running' && (
            <span className="tour__count" aria-label={`Step ${step + 1} / ${steps.length}`}>
              {step + 1}/{steps.length}
              {def && <span className="tour__beat"> · {def.beat}</span>}
            </span>
          )}
          <button type="button" className="tour__close" onClick={stop} aria-label="Close tour (Esc)">
            <Icon name="x" size={16} />
          </button>
        </header>

        {phase === 'preparing' && (
          <div className="tour__body" aria-live="polite">
            <h2 id={`${uid}-t`} className="tour__title">
              Running scenario…
            </h2>
            <p id={`${uid}-c`} className="tour__caption">
              <Spinner size={14} label={null} /> The server is generating synthetic data for a new mission (DEMO). This may take a few seconds.
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="tour__body" role="alert">
            <h2 id={`${uid}-t`} className="tour__title">
              Tour could not start
            </h2>
            <p id={`${uid}-c`} className="tour__caption">
              {error}
              {offline ? ' Try again when the connection returns.' : ''}
            </p>
            <div className="tour__actions">
              <Button size="sm" variant="secondary" icon="refresh" onClick={() => void useTour.getState().start(tour)}>
                Retry
              </Button>
              <Button size="sm" variant="ghost" onClick={stop}>
                Close
              </Button>
            </div>
          </div>
        )}

        {phase === 'running' && def && (
          <div className="tour__body">
            <h2 id={`${uid}-t`} className="tour__title" aria-live="polite">
              {def.title}
            </h2>
            <p id={`${uid}-c`} className="tour__caption">
              {def.caption}
            </p>
            {def.honest && (
              <p className="tour__honest">
                <Icon name="info" size={13} /> {def.honest}
              </p>
            )}
            {note && (
              <p className="tour__note" role="status">
                {note}
              </p>
            )}
            {!target && ready && <p className="tour__note">This section is not on screen right now; the description still applies.</p>}
            <div className="tour__actions">
              <Button size="sm" variant="ghost" onClick={prev} disabled={step === 0} aria-keyshortcuts="ArrowLeft">
                Previous
              </Button>
              <button ref={nextRef} type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={next} aria-keyshortcuts="ArrowRight">
                {last ? 'Finish' : 'Next'}
              </button>
              <label className="tour__auto">
                <input type="checkbox" checked={auto} onChange={(e) => useTour.getState().setAuto(e.target.checked)} />
                Auto-advance
              </label>
              <span className="tour__keys" aria-hidden="true">
                ← → · Esc
              </span>
            </div>
            <ol className="tour__dots" aria-hidden="true">
              {steps.map((s, i) => (
                <li key={s.id} className={i === step ? 'is-on' : i < step ? 'is-done' : undefined} />
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
