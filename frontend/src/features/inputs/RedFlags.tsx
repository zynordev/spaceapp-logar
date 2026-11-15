// 5. Kırmızı bayrak: serious symptoms that open a CRITICAL alert immediately.
import { useState } from 'react';
import { api, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { InlineMsg, NeedSelection, Notice, SOURCE_ID, Section, useAction } from './shared';
import type { RedFlagAccepted, RedFlagOption } from './types';

export function RedFlagsSection() {
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const catalog = usePolling<RedFlagOption[]>('/v1/red-flags/catalog', 600000);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const { busy, msg, setMsg, run } = useAction();

  const toggle = (flag: string) => {
    setConfirming(false);
    setMsg(null);
    setSelected((s) => (s.includes(flag) ? s.filter((x) => x !== flag) : [...s, flag]));
  };

  const labelOf = (flag: string) => catalog.data?.find((c) => c.flag === flag)?.label ?? flag;

  const send = async () => {
    if (!missionId || !crewId || !selected.length) return;
    setExplanation(null);
    const r = await run(
      () => api<RedFlagAccepted>('POST', '/v1/red-flags', {
        mission_id: missionId,
        crew_member_id: crewId,
        flags: selected,
        observed_at: new Date().toISOString(),
        source_type: 'MANUAL',
        source_id: SOURCE_ID,
      }),
      (res) => ({
        kind: 'ok',
        text: res.alert_id
          ? 'Acil durum bildirildi: KRİTİK alarm açıldı. Eylem kartını uygulayın ve ekip sağlık sorumlusuna haber verin.'
          : 'Acil durum bildirildi (alarm zaten açık). Eylem kartını uygulayın ve ekip sağlık sorumlusuna haber verin.',
      }),
      'bildirilemedi. Ekibe sözlü olarak haber verin',
    );
    setConfirming(false);
    if (r) {
      setSelected([]);
      setExplanation(r.evaluation?.explanation ?? null);
    }
  };

  return (
    <Section
      id="lgi-redflag"
      title="Kırmızı bayrak"
      hint="Bu belirtilerden biri varsa seçip bildirin. Bildirim hemen KRİTİK alarm açar: ortalama, zaman penceresi ya da sensör onayı beklenmez. Bu bir teşhis değildir."
      badge={<span className="lgi-chip lgi-chip--crit"><span aria-hidden="true">⚠ </span>Acil</span>}
    >
      {!missionId || !crewId ? <NeedSelection /> : (
        <>
          {catalog.loading && !catalog.data && <p className="lgi-muted">Belirti listesi yükleniyor…</p>}
          {catalog.error && !catalog.data && (
            <Notice kind="err">
              Belirti listesi alınamadı ({catalog.error.message}). Acil bir durum varsa ekibe sözlü olarak haber verin.
            </Notice>
          )}
          {catalog.data && (
            <ul className="lgi-flags" aria-label="Kırmızı bayrak belirtileri">
              {catalog.data.map((c) => {
                const on = selected.includes(c.flag);
                return (
                  <li key={c.flag}>
                    <button
                      type="button"
                      className={`lgi-flag${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggle(c.flag)}
                      disabled={busy}
                    >
                      <span className="lgi-flag__box" aria-hidden="true">{on ? '✓' : ''}</span>
                      <span className="lgi-flag__label">{c.label}</span>
                      <span className="lgi-flag__state" aria-hidden="true">{on ? 'Seçildi' : 'Seç'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!confirming ? (
            <div className="lgi-actions">
              <button
                type="button"
                className="lgi-btn lgi-btn--danger"
                disabled={!selected.length || busy}
                onClick={() => setConfirming(true)}
              >
                <span aria-hidden="true">⚠ </span>
                {selected.length ? `Acil durumu bildir (${selected.length} belirti)` : 'Önce belirti seçin'}
              </button>
              {selected.length > 0 && (
                <button type="button" className="lgi-btn" onClick={() => setSelected([])} disabled={busy}>Seçimi temizle</button>
              )}
            </div>
          ) : (
            <div className="lgi-confirm" role="alertdialog" aria-labelledby="lgi-rf-confirm-h" aria-describedby="lgi-rf-confirm-d">
              <strong id="lgi-rf-confirm-h">Emin misiniz? KRİTİK alarm hemen açılacak.</strong>
              <div id="lgi-rf-confirm-d">
                Bildirilecek: <ul>{selected.map((f) => <li key={f}>{labelOf(f)}</li>)}</ul>
              </div>
              <div className="lgi-actions">
                <button type="button" className="lgi-btn lgi-btn--danger" onClick={send} disabled={busy} aria-busy={busy} autoFocus>
                  {busy ? 'Bildiriliyor…' : 'Evet, acil bildir'}
                </button>
                <button type="button" className="lgi-btn" onClick={() => setConfirming(false)} disabled={busy}>Vazgeç</button>
              </div>
            </div>
          )}
          <InlineMsg msg={msg} />
          {explanation && <p className="lgi-explain">{explanation}</p>}
        </>
      )}
    </Section>
  );
}
