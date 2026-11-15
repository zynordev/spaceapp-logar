import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App';

// "#/yer" opens the full-screen ground mission-control console instead of the app.
const GroundConsoleApp = lazy(() => import('./features/console/GroundConsoleApp').then((m) => ({ default: m.GroundConsoleApp })));
const isConsole = () => window.location.hash.startsWith('#/yer');

function Root() {
  const [consoleView, setConsoleView] = useState(isConsole);
  useEffect(() => {
    const onHash = () => setConsoleView(isConsole());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (!consoleView) return <App />;
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Yer kontrol konsolu yükleniyor…</p>}>
      <GroundConsoleApp />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
