// Top-bar jury strip: the two guided-tour buttons, the mission profile
// selector and the "What is real, what is simulated?" dialog.
import { useState } from 'react';
import { Button } from '../../ui';
import { ProfileSelector } from '../profile';
import { CapabilitiesDialog } from './CapabilitiesDialog';
import { useTour, type TourId } from './store';
import './tour.css';

export function TourStrip() {
  const tour = useTour((s) => s.tour);
  const phase = useTour((s) => s.phase);
  const [capsOpen, setCapsOpen] = useState(false);
  const start = (id: TourId) => void useTour.getState().start(id);
  const busy = phase === 'preparing';

  return (
    <div className="tour-strip" role="group" aria-label="Jury demo">
      <span className="tour-strip__label">Play a scenario</span>
      <Button size="sm" variant="primary" icon="play" onClick={() => start('co2')} loading={busy && tour === 'co2'} disabled={busy}>
        Play: CO₂ + headache
      </Button>
      <Button size="sm" variant="secondary" icon="flag" onClick={() => start('redflag')} loading={busy && tour === 'redflag'} disabled={busy}>
        Red flag
      </Button>
      <ProfileSelector />
      <Button size="sm" variant="ghost" icon="question" className="tour-strip__caps" onClick={() => setCapsOpen(true)}>
        <span className="tour-strip__long">What is real, what is simulated?</span>
        <span className="tour-strip__short" aria-hidden="true">
          Real or simulated?
        </span>
      </Button>
      <CapabilitiesDialog open={capsOpen} onClose={() => setCapsOpen(false)} />
    </div>
  );
}
