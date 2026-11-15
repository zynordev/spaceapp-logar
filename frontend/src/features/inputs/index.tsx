// UI-inputs track: check-in, activity, routines + streaks, manual lab entry,
// red flags, labs + OSDR import, demo scenario runner.
// Public API (used by the shell): InputsPanel, DemoScenarioControl — no props;
// mission/crew come from useApp().
import { useRef, useState, type KeyboardEvent } from 'react';
import { useApp } from '../../lib/store';
import { Icon, type IconName } from '../../ui';
import { ActivitySection } from './Activity';
import { CheckInSection } from './CheckIn';
import { DemoScenarioPicker } from './DemoScenario';
import { LabsSection } from './Labs';
import { RedFlagsSection } from './RedFlags';
import { RoutinesSection } from './Routines';
import { MOCK } from './shared';
import './inputs.css';

type TabKey = 'checkin' | 'activity' | 'routines' | 'labs' | 'redflag';
const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'checkin', label: 'Subjective state', icon: 'smile' },
  { key: 'activity', label: 'Aktivite', icon: 'clock' },
  { key: 'routines', label: 'Rutinler', icon: 'check' },
  { key: 'labs', label: 'Laboratuvar', icon: 'flask' },
  { key: 'redflag', label: 'Red flag', icon: 'warning' },
];

export function InputsPanel() {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const [tab, setTab] = useState<TabKey>('checkin');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const k = TABS[next].key;
    setTab(k);
    refs.current[k]?.focus();
  };

  return (
    <section className="lgi lgi-panel" aria-labelledby="lgi-panel-h">
      <header className="lgi-panel__head">
        <h2 id="lgi-panel-h" className="lgi-panel__title">Data entry</h2>
        <span className="lgi-muted">
          {missionId && crewId ? <>Mission <b>{missionId}</b> · Crew member <b>{crewId}</b></> : 'No mission selected'}
        </span>
        {MOCK && <span className="lgi-chip">?mock=1 preview</span>}
      </header>
      <div className="lgi-tabs" role="tablist" aria-label="Data entry sections" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button
            key={t.key}
            ref={(el) => { refs.current[t.key] = el; }}
            type="button"
            role="tab"
            id={`lgi-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`lgi-tabpanel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            className={`lgi-tab${tab === t.key ? ' is-on' : ''}${t.key === 'redflag' ? ' lgi-tab--crit' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="lgi-tab__icon" aria-hidden="true"><Icon name={t.icon} size={16} /></span>
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`lgi-tabpanel-${t.key}`}
          aria-labelledby={`lgi-tab-${t.key}`}
          hidden={tab !== t.key}
          tabIndex={0}
          className="lgi-tabpanel"
        >
          {t.key === 'checkin' && <CheckInSection />}
          {t.key === 'activity' && <ActivitySection />}
          {t.key === 'routines' && <RoutinesSection />}
          {t.key === 'labs' && <LabsSection />}
          {t.key === 'redflag' && <RedFlagsSection />}
        </div>
      ))}
    </section>
  );
}

/** Demo scenario runner; the shell places it in the top bar / demo drawer. */
export function DemoScenarioControl() {
  return <DemoScenarioPicker />;
}
