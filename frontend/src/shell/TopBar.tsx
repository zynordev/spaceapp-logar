import { Suspense, type ReactNode } from 'react';
import { useApp } from '../lib/store';
import { Button, Chip, Icon, Select, Skeleton, formatDateTime, roleLabel } from '../ui';
import { FeatureBoundary } from './FeatureBoundary';
import { DemoScenarioControl } from './lazyFeatures';
import { selectMission, type AuthInfo, type MissionsInfo } from './useBootstrap';

function Logo() {
  return (
    <svg className="shell-logo" width="34" height="34" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="shell-logo-g" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#8ad8ff" />
          <stop offset="100%" stopColor="#1f6fb5" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="9" fill="url(#shell-logo-g)" />
      <ellipse cx="20" cy="20" rx="17" ry="7" fill="none" stroke="#5cc8ff" strokeOpacity=".7" strokeWidth="1.6" transform="rotate(-25 20 20)" />
      <circle cx="34.5" cy="13" r="2.4" fill="#ffd65c" />
      <path d="M14 20h3l1.6-3.5 2.6 7 1.6-3.5H26" fill="none" stroke="#060a14" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Control({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="shell-control">
      <label className="shell-control__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export interface TopBarProps {
  missions: MissionsInfo;
  auth: AuthInfo;
  onLogin: () => void;
  onLogout: () => void;
}

export function TopBar({ missions, auth, onLogin, onLogout }: TopBarProps) {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const envId = useApp((s) => s.environmentTargetId);
  const setSelection = useApp((s) => s.setSelection);
  const list = missions.missions ?? [];
  const current = missions.current;
  const crews = current?.crew_member_ids ?? (crewId ? [crewId] : []);
  const envs = current?.environment_target_ids ?? (envId ? [envId] : []);
  // A just-created demo mission may not be in the list yet: still show it.
  const showOrphan = missionId && !current;

  return (
    <header className="shell-topbar">
      <div className="shell-brand">
        <Logo />
        <div className="shell-brand__text">
          <span className="shell-brand__name">SpaceApp Logar</span>
          <span className="shell-brand__sub">Astronot Sağlık Karar Desteği</span>
        </div>
      </div>

      <div className="shell-controls" role="group" aria-label="Görev seçimi">
        <Control label="Görev" htmlFor="shell-mission">
          <Select
            id="shell-mission"
            value={missionId ?? ''}
            disabled={!list.length && !showOrphan}
            onChange={(e) => {
              const m = list.find((x) => x.mission_id === e.target.value);
              if (m) selectMission(m);
            }}
          >
            {!list.length && !showOrphan && <option value="">{missions.loading ? 'Yükleniyor…' : 'Görev yok'}</option>}
            {showOrphan && <option value={missionId}>{missionId}</option>}
            {list.map((m) => (
              <option key={m.mission_id} value={m.mission_id} title={m.mission_id}>
                {(m.scenario_id || 'görev') + ' · ' + formatDateTime(m.last_observed_at)}
              </option>
            ))}
          </Select>
        </Control>

        <Control label="Astronot" htmlFor="shell-crew">
          <Select
            id="shell-crew"
            value={crewId ?? ''}
            disabled={crews.length <= 1}
            onChange={(e) => setSelection({ crewId: e.target.value || null })}
          >
            {!crews.length && <option value="">—</option>}
            {crews.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Control>

        <Control label="Ortam (kabin)" htmlFor="shell-env">
          <Select
            id="shell-env"
            value={envId ?? ''}
            disabled={envs.length <= 1}
            onChange={(e) => setSelection({ environmentTargetId: e.target.value || null })}
          >
            {!envs.length && <option value="">—</option>}
            {envs.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Control>

        <div className="shell-demo" id="shell-demo-anchor">
          <FeatureBoundary name="Demo senaryosu" compact>
            <Suspense fallback={<Skeleton height={40} className="shell-demo__skeleton" />}>
              <DemoScenarioControl />
            </Suspense>
          </FeatureBoundary>
        </div>
      </div>

      <UserChip auth={auth} onLogin={onLogin} onLogout={onLogout} />
    </header>
  );
}

function UserChip({ auth, onLogin, onLogout }: { auth: AuthInfo; onLogin: () => void; onLogout: () => void }) {
  const user = useApp((s) => s.user);
  const token = useApp((s) => s.token);
  const signedIn = !!token && !!user && !user.anonymous;

  if (signedIn) {
    return (
      <div className="shell-user">
        <span className="shell-user__avatar">
          <Icon name="user" size={18} />
        </span>
        <span className="shell-user__text">
          <span className="shell-user__id" title={user.user_id}>
            {user.user_id}
          </span>
          <span className="shell-user__role">{roleLabel(user.role)}</span>
        </span>
        <Button size="sm" variant="ghost" icon="logout" onClick={onLogout}>
          Çıkış
        </Button>
      </div>
    );
  }
  return (
    <div className="shell-user">
      <Chip tone="neutral" icon="user" title="Oturum açılmadı: demo modunda anonim kullanıcı">
        Demo kullanıcı
      </Chip>
      {auth.authConfigured !== false && (
        <Button size="sm" variant="secondary" icon="lock" onClick={onLogin}>
          Giriş
        </Button>
      )}
    </div>
  );
}
