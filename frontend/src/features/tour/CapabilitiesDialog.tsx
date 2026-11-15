// "Ne gerçek, ne simüle?" dialog: honest status per capability + the
// provenance badge legend used across the screens.
import { Dialog, SourceBadge } from '../../ui';
import { CAPABILITIES, CAP_STATE } from './capabilities';

export function CapabilitiesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Ne gerçek, ne simüle?" width={820}>
      <p className="text-muted text-sm">
        Ekrandaki her değerin yanında kaynağı yazar. Bu tablo her yeteneğin bugünkü durumunu açıkça gösterir.
      </p>
      <div className="cap-legend" aria-label="Kaynak etiketleri">
        <SourceBadge kind="REAL" detail="OSDR / PhysioNet / DONKI" />
        <SourceBadge kind="STANDARD" detail="NASA-STD-3001" />
        <SourceBadge kind="DEMO" />
        <SourceBadge kind="SYNTHETIC" />
        <SourceBadge kind="MANUAL" />
      </div>
      <div className="cap-scroll">
        <table className="cap-table">
          <thead>
            <tr>
              <th scope="col">Yetenek</th>
              <th scope="col">Durum</th>
              <th scope="col">Açıklama</th>
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>
                  <span className={`cap-state cap-state--${c.state}`}>{CAP_STATE[c.state]}</span>
                </td>
                <td>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
