// App shell (owned by the UI-shell track): layout, selection, auth UI,
// banners. Feature tracks never edit this file; their panels are lazy-loaded.
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useApp } from './lib/store';
import { Button, EmptyState, ErrorNote, Skeleton, Tabs, ToastHost, toast } from './ui';
import { DisclaimerBand, OfflineBanner } from './shell/Banners';
import { FeatureBoundary } from './shell/FeatureBoundary';
import { LoginDialog } from './shell/LoginDialog';
import { StatusHero } from './shell/StatusHero';
import { TopBar } from './shell/TopBar';
import { AlertsPanel, BodyMapPanel, GroundPanel, InputsPanel, VitalsPanel, prefetchFeatures } from './shell/lazyFeatures';
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

export default function App() {
  const auth = useAuthBootstrap();
  const missions = useMissions();
  const token = useApp((s) => s.token);
  const user = useApp((s) => s.user);
  const loginRequired = useApp((s) => s.loginRequired);
  const missionId = useApp((s) => s.missionId);
  const offline = useApp((s) => s.offline);
  const [loginOpen, setLoginOpen] = useState(false);
  const [tab, setTab] = useState<'inputs' | 'ground' | null>(null);

  useEffect(() => prefetchFeatures(), []);

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
  const activeTab = tab ?? (user?.role === 'GROUND' ? 'ground' : 'inputs');
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
            <StatusHero scenarioId={missions.current?.scenario_id ?? null} />

            <div className="shell-grid">
              <Slot name="3D vücut haritası" height={560} className="shell-grid__body">
                <BodyMapPanel />
              </Slot>
              <Slot name="Alarmlar" height={560} className="shell-grid__alerts">
                <AlertsPanel />
              </Slot>
              <Slot name="Ölçümler ve kurallar" height={420} className="shell-grid__vitals">
                <VitalsPanel />
              </Slot>
            </div>

            <section className="shell-sections" aria-label="Veri girişi ve yer istasyonu">
              <Tabs
                label="Bölümler"
                value={activeTab}
                onChange={(id) => setTab(id as 'inputs' | 'ground')}
                tabs={[
                  { id: 'inputs', label: 'Veri girişi' },
                  { id: 'ground', label: 'Yer istasyonu' },
                ]}
              >
                {activeTab === 'inputs' ? (
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
