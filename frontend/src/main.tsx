import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App';
import { useTour } from './features/tour/store';

// "#/ground" (old link: "#/yer") opens the full-screen ground mission-control console instead of the app.
const GroundConsoleApp = lazy(() => import('./features/console/GroundConsoleApp').then((m) => ({ default: m.GroundConsoleApp })));
const isConsole = () => /^#\/(ground|yer)/.test(window.location.hash);
// Guided jury tour overlay: lives above both views so it survives the route change.
const TourHost = lazy(() => import('./features/tour/TourHost').then((m) => ({ default: m.TourHost })));

function Tour() {
  const active = useTour((s) => s.tour !== null);
  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <TourHost />
    </Suspense>
  );
}

function Root() {
  const [consoleView, setConsoleView] = useState(isConsole);
  useEffect(() => {
    const onHash = () => setConsoleView(isConsole());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <>
      {!consoleView ? (
        <App />
      ) : (
        <Suspense fallback={<p style={{ padding: 24 }}>Loading ground control console…</p>}>
          <GroundConsoleApp />
        </Suspense>
      )}
      <Tour />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// Presentation look. The jury link opens in the clean look: the top-bar demo
// controls (scenario picker, RUN, DETAILS, demo user / sign in) are hidden;
// DEMO / SYNTHETIC tags and the prototype banner stay.
//   ?look=full  shows everything (team use: run scenarios, sign in);
//   ?look=bare  also hides the DEMO / SYNTHETIC tags and the banner.
{
  const look = new URLSearchParams(window.location.search).get('look');
  if (look !== 'full') document.documentElement.dataset.look = look === 'bare' ? 'bare' : 'clean';
}

// Jury link: the CO₂ + headache scenario tour starts by itself as soon as the
// page opens, with auto-advance on. `?autoplay=0` opens the app without it;
// the tour's close button or Esc stops it.
if (!isConsole() && new URLSearchParams(window.location.search).get('autoplay') !== '0') {
  useTour.getState().setAuto(true);
  void useTour.getState().start('co2');
}
