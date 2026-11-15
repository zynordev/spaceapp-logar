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
import { AlertsPanel, BodyMapPanel, GroundPanel, HudOverlay, InputsPanel, VitalsPanel, prefetchFeatures } from './shell/lazyFeatures';
import { useAuthBootstrap, useMissions } from './shell/useBootstrap';
import './shell/shell.css';

function PanelSkeleton({ title, height }: { title: string; height: number }) {
  return (
    <div className="shell-skeleton" style={{ minHeight: height }} aria-busy="true" aria-label={`${title} yükleniyor`}>
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
  // The big panel stays empty (as in the design) until a crew card is clicked.
  const [bodyOpen, setBodyOpen] = useState(false);
  const openCrew = useCallback((id: string) => {
    const current = useApp.getState().crewId;
    if (current === id) setBodyOpen((o) => !o);
    else {
      useApp.getState().setSelection({ crewId: id });
      setBodyOpen(true);
    }
  }, []);

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
    toast('Oturum kapatıldı.');
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
        Ana içeriğe geç
      </a>
      <TopBar missions={missions} auth={auth} onLogin={() => setLoginOpen(true)} onLogout={logout} />
      <DisclaimerBand />
      <OfflineBanner />

      <main id="main" className="shell-main" tabIndex={-1}>
        {waiting ? (
          missions.error ? (
            missions.error.network || offline ? (
              <EmptyState icon="offline" title="Sunucuya ulaşılamıyor">
                Sunucu yanıt verince veriler otomatik yüklenecek.
              </EmptyState>
            ) : (
              <ErrorNote error={missions.error} what="Görev listesi" />
            )
          ) : (
            <PanelSkeleton title="Gösterge paneli" height={180} />
          )
        ) : noMissions ? (
          <EmptyState
            icon="satellite"
            title="Henüz görev verisi yok"
            action={
              <Button variant="primary" onClick={() => document.querySelector<HTMLElement>('#shell-demo-anchor select, #shell-demo-anchor button')?.focus()}>
                Demo senaryosu seçin
              </Button>
            }
          >
            Üst şeritteki <strong>Demo senaryosu</strong> denetiminden bir senaryo çalıştırın; ölçümler, kurallar ve alarmlar
            burada görünecek.
          </EmptyState>
        ) : (
          <>
            <section className={`hud${bodyOpen ? ' is-open' : ''}`} aria-label="Görev ekranı" data-tour="hud">
              <div className="hud__scene" data-tour="scene" data-open={bodyOpen ? 'true' : undefined}>
                {bodyOpen ? (
                  <Slot name="3D vücut haritası" height={560} className="hud__body">
                    <BodyMapPanel />
                  </Slot>
                ) : (
                  <p className="hud__hint">
                    <span>
                      3D vücut modelini ve vital bulguları açmak için soldan bir <strong>mürettebat kartına</strong> tıklayın.
                    </span>
                  </p>
                )}
              </div>
              <div className="hud__overlay">
                <FeatureBoundary name="Görev ekranı">
                  <Suspense fallback={null}>
                    <HudOverlay
                      scenarioId={missions.current?.scenario_id ?? null}
                      crewIds={missions.current?.crew_member_ids ?? (crewId ? [crewId] : [])}
                      onOpen={openDetails}
                      bodyOpen={bodyOpen}
                      onOpenCrew={openCrew}
                    />
                  </Suspense>
                </FeatureBoundary>
              </div>
            </section>

            <section id="details" className="shell-details" aria-labelledby="details-title" tabIndex={-1}>
              <div className="shell-details__head">
                <h2 id="details-title" className="shell-details__title">
                  Ayrıntılar
                </h2>
                <p className="shell-details__sub">Kurallar ve “Neden?”, alarm ve eylem kartı, veri girişi, yer istasyonu.</p>
              </div>
              <Tabs
                label="Bölümler"
                value={activeTab}
                onChange={(id) => setTab(id as DetailTab)}
                tabs={[
                  { id: 'rules', label: 'Kurallar ve alarmlar' },
                  { id: 'inputs', label: 'Veri girişi' },
                  { id: 'ground', label: 'Yer istasyonu' },
                ]}
              >
                {activeTab === 'rules' ? (
                  <div className="shell-grid">
                    <Slot name="Alarmlar" height={560} className="shell-grid__alerts">
                      <AlertsPanel />
                    </Slot>
                    <Slot name="Ölçümler ve kurallar" height={420} className="shell-grid__vitals">
                      <VitalsPanel />
                    </Slot>
                  </div>
                ) : activeTab === 'inputs' ? (
                  <Slot name="Veri girişi" height={360}>
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
        SpaceApp Logar · NASA Space Apps 2026 prototipi · Açıklanabilir karar-destek; yazılım araç/ekipman komutu vermez,
        tıbbi teşhis veya tedavi yerine geçmez.
      </footer>

      <ToastHost />
      <LoginDialog open={dialogOpen} onClose={closeLogin} />
    </>
  );
}
