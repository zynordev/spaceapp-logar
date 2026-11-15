// Ground station panel (UI-ground track): link + light delay, flight-surgeon
// escalations, per-team integrity-checked packets with ack, risk coverage map.
// Contract: docs/CONTRACT_PARALLEL_BUILD.md section E + GET /v1/risk-coverage.
import { qs, usePolling } from '../../lib/api';
import { useApp, type AuthUser } from '../../lib/store';
import { Icon } from '../../ui';
import { CoverageMap } from './CoverageMap';
import { Escalations } from './Escalations';
import { LinkHeader } from './LinkHeader';
import { isMock, MOCK_COVERAGE, MOCK_MISSION_ID, mockEscalations, mockStatus } from './mock';
import { RecipientCard } from './RecipientCard';
import { RECIPIENTS, type CoverageRead, type EscalationRead, type SyncStatusRead } from './types';
import { errorText, useSource } from './useGround';
import './ground.css';

const ROLE_TR: Record<string, string> = {
  ASTRONAUT: 'Astronot',
  CREW_MEDICAL_OFFICER: 'Ekip sağlık sorumlusu',
  GROUND: 'Yer ekibi',
};

function ackPolicy(user: AuthUser | null, token: string | null): { canAck: boolean; hint: string | null } {
  if (user?.role === 'GROUND') return { canAck: true, hint: null };
  if (user?.anonymous || (!user && !token)) {
    return {
      canAck: true,
      hint: 'Anonim demo: onay açık. Oturum açıkken yalnız yer ekibi (GROUND) onaylayabilir.',
    };
  }
  if (user?.role) {
    return { canAck: false, hint: `Yalnız yer ekibi onaylayabilir (rolünüz: ${ROLE_TR[user.role] ?? user.role}).` };
  }
  return { canAck: true, hint: 'Rol henüz doğrulanmadı; yetkiyi sunucu denetler.' };
}

export function GroundPanel() {
  const mock = isMock();
  const storeMission = useApp((s) => s.missionId);
  const offline = useApp((s) => s.offline);
  const user = useApp((s) => s.user);
  const token = useApp((s) => s.token);
  const missionId = mock ? (storeMission ?? MOCK_MISSION_ID) : storeMission;

  const status = useSource<SyncStatusRead>(
    missionId ? `/v1/sync/status${qs({ mission_id: missionId })}` : null,
    mock ? mockStatus : null,
    10000,
  );
  const escalations = useSource<EscalationRead[]>(
    missionId ? `/v1/sync/escalations${qs({ mission_id: missionId })}` : null,
    mock ? mockEscalations : null,
    10000,
  );
  const coverage = usePolling<CoverageRead>('/v1/risk-coverage', 60000);
  const coverageData = coverage.data ?? (mock && coverage.error ? MOCK_COVERAGE : null);

  const { canAck, hint } = ackPolicy(user, token);
  const statusErr = errorText(status.error, '/v1/sync/status');

  return (
    <section className="gp-root" aria-labelledby="gp-title">
      <header className="gp-head">
        <h2 id="gp-title">
          <Icon name="satellite" size={20} className="gp-head-mark" /> Yer istasyonu ve senkronizasyon
        </h2>
        <p className="gp-muted gp-small">
          Gemi Dünya'dan bağımsız karar destek verir; bağlantı olduğunda bütünlüğü kontrol edilen paketler doğru
          yer ekibine gider. Uyarı ve Kritik seviyeler uçuş cerrahına otomatik öncelikli bildirim üretir.
        </p>
      </header>

      <LinkHeader status={status.data} error={status.error} offline={offline && !mock} mock={mock} />

      {!missionId ? (
        <p className="gp-note">Görev seçilmedi — senkronizasyon durumu için üstten bir görev seçin.</p>
      ) : (
        <>
          <Escalations items={escalations.data} error={escalations.error} loading={escalations.loading} />

          <section className="gp-rcps" aria-labelledby="gp-rcps-title">
            <div className="gp-section-head">
              <h3 id="gp-rcps-title">
                <Icon name="swap" size={16} />{' '}Yer ekipleri ve paketler
              </h3>
              {statusErr && status.error?.status !== 404 && <p className="gp-note gp-note--warn">{statusErr}</p>}
            </div>
            <div className="gp-rcp-grid">
              {RECIPIENTS.map((r) => (
                <RecipientCard
                  key={`${missionId}-${r}`}
                  recipient={r}
                  status={status.data?.recipients.find((x) => x.recipient === r) ?? null}
                  missionId={missionId}
                  mock={mock}
                  canAck={canAck}
                  ackHint={hint}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <CoverageMap data={coverageData} error={coverageData === MOCK_COVERAGE ? null : coverage.error} loading={coverage.loading} />
    </section>
  );
}
