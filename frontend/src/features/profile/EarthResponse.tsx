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
      ? 'karar gemideki sağlık sorumlusunda'
      : `yer ekibi pencere içinde yanıt verebilir · sorumlu: ${er.owner_label_tr}`;
  return (
    <div className={`prof-er${er.ground_can_respond_in_time ? '' : ' is-onboard'}`} role="group" aria-label="Dünya'nın yanıt süresi">
      <Icon name={er.ground_can_respond_in_time ? 'signal' : 'user'} size={14} />
      <p className="prof-er__line">
        Dünya'nın yanıt süresi <strong className="prof-num">~{fmtDelay(er.round_trip_seconds)}</strong>
        {er.act_within_minutes != null && (
          <>
            {' '}
            · harekete geçme penceresi <strong className="prof-num">{er.act_within_minutes} dk</strong>
          </>
        )}{' '}
        → {decision}
      </p>
      {er.note_tr && <p className="prof-er__note">{er.note_tr}</p>}
    </div>
  );
}
