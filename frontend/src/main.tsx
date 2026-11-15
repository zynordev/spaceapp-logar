import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App';
import { useTour } from './features/tour/store';

// "#/yer" opens the full-screen ground mission-control console instead of the app.
const GroundConsoleApp = lazy(() => import('./features/console/GroundConsoleApp').then((m) => ({ default: m.GroundConsoleApp })));
const isConsole = () => window.location.hash.startsWith('#/yer');
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
        <Suspense fallback={<p style={{ padding: 24 }}>Yer kontrol konsolu yükleniyor…</p>}>
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
