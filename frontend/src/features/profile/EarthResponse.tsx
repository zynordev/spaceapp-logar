// Action card block: can the ground answer within the card's window? Neutral
// wording; the numbers and the owner come from the server (earth_response).
import { Icon } from '../../ui';
import { fmtDelay } from './format';
import type { EarthResponse } from './types';
import './profile.css';

export function EarthResponseLine({ er }: { er: EarthResponse | null | undefined }) {
  if (!er) return null;
  const decision =
    er.owner === 'CREW_MEDICAL_OFFICER'
      ? 'the decision rests with the crew medical officer on board'
      : `ground team can respond within the window · owner: ${er.owner_label_tr}`;
  return (
    <div className={`prof-er${er.ground_can_respond_in_time ? '' : ' is-onboard'}`} role="group" aria-label="Earth response time">
      <Icon name={er.ground_can_respond_in_time ? 'signal' : 'user'} size={14} />
      <p className="prof-er__line">
        Earth response time <strong className="prof-num">~{fmtDelay(er.round_trip_seconds)}</strong>
        {er.act_within_minutes != null && (
          <>
            {' '}
            · action window <strong className="prof-num">{er.act_within_minutes} min</strong>
          </>
        )}{' '}
        → {decision}
      </p>
      {er.note_tr && <p className="prof-er__note">{er.note_tr}</p>}
    </div>
  );
}
