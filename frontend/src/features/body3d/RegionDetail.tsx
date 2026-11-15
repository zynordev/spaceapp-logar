// Side panel: everything about the selected region in plain Turkish.
// All server text is rendered as React text (never as HTML).
import { ATTENTION, COVERAGE_TEXT, QUALITY_TEXT } from './meta';
import { RegionIcon } from './icons';
import type { Attention, BodyLatestValue, BodyRegionRead, RegionKey } from './types';

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const numFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'zaman bilinmiyor';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'zaman bilinmiyor';
  const mins = Math.round((Date.now() - t) / 60_000);
  let rel: string;
  if (mins < 1) rel = 'az önce';
  else if (mins < 60) rel = `${mins} dk önce`;
  else if (mins < 48 * 60) rel = `${Math.round(mins / 60)} sa önce`;
  else rel = `${Math.round(mins / 1440)} gün önce`;
  const abs = mins < 24 * 60 ? timeFmt.format(t) : dateFmt.format(t);
  return `${abs} · ${rel}`;
}

function formatValue(v: BodyLatestValue): string {
  if (v.value === null || v.value === undefined || v.value === '') return '—';
  const val = typeof v.value === 'number' ? numFmt.format(v.value) : String(v.value);
  return v.unit ? `${val} ${v.unit}` : val;
}

export function AttentionBadge({ attention, size = 'md' }: { attention: Attention; size?: 'sm' | 'md' }) {
  const a = ATTENTION[attention];
  return (
    <span className={`b3d-badge b3d-badge-${size} att-${attention.toLowerCase()}`} style={{ ['--c' as string]: a.cssVar }}>
      <span className="b3d-badge-glyph" aria-hidden="true">
        {a.glyph}
      </span>
      {a.label}
    </span>
  );
}

export function RegionDetail({ region, onClose }: { region: BodyRegionRead | null; onClose: () => void }) {
  if (!region) {
    return (
      <aside className="b3d-detail is-empty" aria-label="Bölge ayrıntısı">
        <h3>Bir bölge seçin</h3>
        <p>
          Modelde bir organa ya da aşağıdaki bölge düğmelerine tıklayın. Renk ve işaret, o bölgenin dikkat düzeyini
          gösterir; ayrıntıda hangi kuralın neden tetiklendiğini ve son ölçümleri görürsünüz.
        </p>
        <ul className="b3d-howto">
          <li>Sürükleyin: modeli döndürün</li>
          <li>Tekerlek / iki parmak: yakınlaştırın</li>
          <li>Klavye: Tab ile bölge listesine gelin, oklarla gezin, Enter ile seçin, Esc ile kapatın</li>
        </ul>
      </aside>
    );
  }
  const key: RegionKey = region.region;
  const cov = COVERAGE_TEXT[region.coverage] ?? COVERAGE_TEXT.GAP;
  const alerts = region.open_alert_ids.length;
  return (
    <aside className={`b3d-detail att-${region.attention.toLowerCase()}`} aria-label={`${region.label_tr} ayrıntısı`}>
      <div className="b3d-detail-head" style={{ ['--c' as string]: ATTENTION[region.attention].cssVar }}>
        <span className="b3d-detail-icon">
          <RegionIcon region={key} size={22} />
        </span>
        <div>
          <h3>{region.label_tr}</h3>
          <AttentionBadge attention={region.attention} />
        </div>
        <button type="button" className="b3d-close" onClick={onClose} aria-label="Ayrıntıyı kapat">
          ×
        </button>
      </div>
      <p className="b3d-hint">{ATTENTION[region.attention].hint}</p>
      {region.description_tr && <p className="b3d-desc">{region.description_tr}</p>}

      {alerts > 0 && (
        <p className="b3d-alerts" role="note">
          <strong>{alerts}</strong> açık uyarı — Uyarılar panelinden eylem kartını açın.
        </p>
      )}

      <section className={`b3d-cov cov-${region.coverage.toLowerCase()}`} aria-label="Kapsam">
        <h4>Kapsam: {cov.label}</h4>
        <p>{cov.text}</p>
      </section>

      <section aria-label="Kurallar">
        <h4>Kurallar ({region.rules.length})</h4>
        {region.rules.length === 0 ? (
          <p className="b3d-muted">Bu bölgeye bağlı otomatik kural yok.</p>
        ) : (
          <ul className="b3d-rules">
            {region.rules.map((r) => (
              <li key={r.rule_id}>
                <div className="b3d-rule-top">
                  <span className="b3d-rule-title">{r.title}</span>
                  <AttentionBadge attention={r.health_attention} size="sm" />
                </div>
                <p>{r.explanation}</p>
                <p className="b3d-rule-meta">
                  {QUALITY_TEXT[r.data_quality] ?? r.data_quality} · <code>{r.rule_id}</code>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Son değerler">
        <h4>Son değerler</h4>
        {region.latest_values.length === 0 ? (
          <p className="b3d-muted">
            {region.metrics.length > 0 ? 'Bu bölge için henüz ölçüm gelmedi.' : 'Bu bölge için tanımlı ölçüm yok.'}
          </p>
        ) : (
          <table className="b3d-values">
            <tbody>
              {region.latest_values.map((v) => (
                <tr key={v.metric}>
                  <th scope="row">{v.label || v.metric}</th>
                  <td className="b3d-val">{formatValue(v)}</td>
                  <td className="b3d-when">{formatWhen(v.observed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </aside>
  );
}
