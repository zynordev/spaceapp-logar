// App shell (owned by the UI-shell track): layout, selection, auth UI,
// banners. Feature tracks never edit this file; their panels are lazy-loaded.
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useApp } from './lib/store';
import { Button, EmptyState, ErrorNote, Skeleton, Tabs, ToastHost, toast } from './ui';
import { DisclaimerBand, OfflineBanner } from './shell/Banners';
import { FeatureBoundary } from './shell/FeatureBoundary';
import { LoginDialog } from './shell/LoginDialog';
import { useDetailTabRequest } from './shell/detailTab';
import { TopBar } from './shell/TopBar';
import { AlertsPanel, GroundPanel, InputsPanel, MissionScreens, VitalsPanel, prefetchFeatures } from './shell/lazyFeatures';
import { useAuthBootstrap, useMissions } from './shell/useBootstrap';
import './shell/shell.css';

function PanelSkeleton({ title, height }: { title: string; height: number }) {
  return (
    <div className="shell-skeleton" style={{ minHeight: height }} aria-busy="true" aria-label={`${title} loading`}>
      <Skeleton height={20} className="shell-skeleton__title" />
      <Skeleton height={Math.max(40, height - 90)} />
    </div>
  );
}

/** Error boundary + Suspense with a sized skeleton for one feature slot. */
function Slot({ name, height, className, children }: { name: string; height: number; className?: string; children: ReactNode }) {
  return (
    <div className={`shell-slot${className ? ` ${className}` : ''}`}>
      <FeatureBoundary name={name}>
        <Suspense fallback={<PanelSkeleton title={name} height={height} />}>{children}</Suspense>
      </FeatureBoundary>
    </div>
  );
}

type DetailTab = 'rules' | 'inputs' | 'ground';

/** Height of the sticky chrome (top bar + bands) -> --chrome-h for the HUD stage. */
function useChromeHeight() {
  useEffect(() => {
    const els = () => document.querySelectorAll<HTMLElement>('.shell-topbar, .shell-disclaimer, .shell-offline');
    const update = () => {
      let h = 0;
      els().forEach((el) => (h += el.offsetHeight));
      document.documentElement.style.setProperty('--chrome-h', `${h}px`);
      const bar = document.querySelector<HTMLElement>('.shell-topbar');
      if (bar) document.documentElement.style.setProperty('--topbar-real', `${bar.offsetHeight}px`);
    };
    const ro = new ResizeObserver(update);
    const observe = () => {
      ro.disconnect();
      els().forEach((el) => ro.observe(el));
      update();
    };
    observe();
    // The offline band mounts/unmounts: re-observe on top-level DOM changes.
    const mo = new MutationObserver(observe);
    const root = document.getElementById('root');
    if (root) mo.observe(root, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
}

export default function App() {
  const auth = useAuthBootstrap();
  const missions = useMissions();
  const token = useApp((s) => s.token);
  const user = useApp((s) => s.user);
  const loginRequired = useApp((s) => s.loginRequired);
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const offline = useApp((s) => s.offline);
  const [loginOpen, setLoginOpen] = useState(false);
  const [tab, setTab] = useState<DetailTab | null>(null);


  useEffect(() => prefetchFeatures(), []);
  // Guided tour (or any other caller) asks for a detail tab.
  const tabRequest = useDetailTabRequest((s) => s.request);
  useEffect(() => {
    if (tabRequest) setTab(tabRequest.tab);
  }, [tabRequest]);
  useChromeHeight();

  const forced = auth.authRequired === true && !token;
  const dialogOpen = loginOpen || loginRequired || forced;
  const closeLogin = forced
    ? undefined
    : () => {
        setLoginOpen(false);
        useApp.getState().setLoginRequired(false);
      };
  const logout = () => {
    useApp.getState().setToken(null);
    toast('Signed out.');
  };

  // Ground crew lands on the ground tab unless they picked one.
  const activeTab: DetailTab = tab ?? (user?.role === 'GROUND' ? 'ground' : 'rules');
  const openDetails = useCallback((id: DetailTab) => {
    setTab(id);
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('details')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  }, []);
  const list = missions.missions;
  const noMissions = list !== null && list.length === 0 && !missionId;
  const waiting = list === null && !missionId;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <TopBar missions={missions} auth={auth} onLogin={() => setLoginOpen(true)} onLogout={logout} />
      <DisclaimerBand />
      <OfflineBanner />

      <main id="main" className="shell-main" tabIndex={-1}>
        {waiting ? (
          missions.error ? (
            missions.error.network || offline ? (
              <EmptyState icon="offline" title="Cannot reach the server">
                Data loads automatically once the server responds.
              </EmptyState>
            ) : (
              <ErrorNote error={missions.error} what="Mission list" />
            )
          ) : (
            <PanelSkeleton title="Dashboard" height={180} />
          )
        ) : noMissions ? (
          <EmptyState
            icon="satellite"
            title="No mission data yet"
            action={
              <Button variant="primary" onClick={() => document.querySelector<HTMLElement>('#shell-demo-anchor select, #shell-demo-anchor button')?.focus()}>
                Choose a demo scenario
              </Button>
            }
          >
            Run a scenario from the <strong>Demo scenario</strong> control in the top bar; measurements, rules and alerts
            will appear here.
          </EmptyState>
        ) : (
          <>
            <section className="hud-screens" aria-label="Mission screen" data-tour="hud">
              <FeatureBoundary name="Mission screen">
                <Suspense fallback={<PanelSkeleton title="Mission screen" height={600} />}>
                  <MissionScreens
                    scenarioId={missions.current?.scenario_id ?? null}
                    crewIds={missions.current?.crew_member_ids ?? (crewId ? [crewId] : [])}
                    onOpen={openDetails}
                  />
                </Suspense>
              </FeatureBoundary>
            </section>

            <section id="details" className="shell-details" aria-labelledby="details-title" tabIndex={-1}>
              <div className="shell-details__head">
                <h2 id="details-title" className="shell-details__title">
                  Details
                </h2>
                <p className="shell-details__sub">Rules and “Why?”, alarms and action card, data entry, ground station.</p>
              </div>
              <Tabs
                label="Sections"
                value={activeTab}
                onChange={(id) => setTab(id as DetailTab)}
                tabs={[
                  { id: 'rules', label: 'Rules and alarms' },
                  { id: 'inputs', label: 'Data entry' },
                  { id: 'ground', label: 'Ground station' },
                ]}
              >
                {activeTab === 'rules' ? (
                  <div className="shell-grid">
                    <Slot name="Alarmlar" height={560} className="shell-grid__alerts">
                      <AlertsPanel />
                    </Slot>
                    <Slot name="Measurements and rules" height={420} className="shell-grid__vitals">
                      <VitalsPanel />
                    </Slot>
                  </div>
                ) : activeTab === 'inputs' ? (
                  <Slot name="Data entry" height={360}>
                    <InputsPanel />
                  </Slot>
                ) : (
                  <Slot name="Yer istasyonu" height={360}>
                    <GroundPanel />
                  </Slot>
                )}
              </Tabs>
            </section>
          </>
        )}
      </main>

      <footer className="shell-footer">
        SpaceApp Logar · NASA Space Apps 2026 prototype · Explainable decision support; the software issues no tool or equipment commands
        and does not replace medical diagnosis or treatment.
      </footer>

      <ToastHost />
      <LoginDialog open={dialogOpen} onClose={closeLogin} />
    </>
  );
}
