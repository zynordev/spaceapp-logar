// Small helpers shared by the input sections: write state, error text,
// time formatting and the `?mock=1` switch. No dependency on UI-shell primitives.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { Icon } from '../../ui';

export const MOCK = (() => {
  try { return new URLSearchParams(window.location.search).get('mock') === '1'; } catch { return false; }
})();

export const SOURCE_ID = 'dashboard-user';

export interface Msg {
  kind: 'ok' | 'err' | 'info';
  text: string;
  fields?: string[];
}

const LOC_LABELS: Record<string, string> = {
  mission_id: 'Görev', crew_member_id: 'Ekip üyesi', value: 'Değer', unit: 'Birim',
  reference_low: 'Referans alt sınırı', reference_high: 'Referans üst sınırı',
  phase: 'Faz', sampled_at: 'Örnek zamanı', analyte: 'Analit', flags: 'Belirtiler',
  planned_minutes: 'Planlanan süre', activity_state: 'Aktivite', observed_at: 'Zaman',
};

/** Field errors of a FastAPI 422 body (detail = [{loc, msg, type}]). */
export function fieldErrors(detail: unknown): string[] {
  if (!Array.isArray(detail)) return [];
  return detail.map((d: any) => {
    const loc = Array.isArray(d?.loc) ? d.loc.filter((p: unknown) => p !== 'body') : [];
    const key = loc.length ? String(loc[loc.length - 1]) : '';
    const label = LOC_LABELS[key] ?? (loc.join('.') || 'Genel');
    return `${label}: ${String(d?.msg ?? 'geçersiz').replace(/^Value error, /, '')}`;
  });
}

/** Turkish message for a failed write. `what` = e.g. "kaydedilemedi". */
export function errorMsg(e: unknown, what: string): Msg {
  if (!(e instanceof ApiError)) return { kind: 'err', text: `İşlem ${what} (${String(e)}).` };
  if (e.status === 0) return { kind: 'err', text: `Sunucuya ulaşılamıyor; ${what}.` };
  if (e.status === 401) return { kind: 'err', text: 'Oturum gerekli: lütfen giriş yapın.' };
  if (e.status === 403) return { kind: 'err', text: 'Bu işlem için yetkiniz yok.' };
  if (e.status === 404) return { kind: 'err', text: `Bu özellik sunucuda henüz yok; ${what}.` };
  if (e.status === 422) {
    const fields = fieldErrors(e.detail);
    return { kind: 'err', text: `Girdi geçersiz; ${what}.`, fields: fields.length ? fields : [e.message] };
  }
  return { kind: 'err', text: `${capitalize(what)} (${e.message}).` };
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Busy flag + inline message for one write action. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const alive = useRef(true);
  // Re-arm on (re)mount: StrictMode runs mount → cleanup → mount.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok: (r: T) => Msg | null, failWhat: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (alive.current) setMsg(ok(r));
      return r;
    } catch (e) {
      if (alive.current) setMsg(errorMsg(e, failWhat));
      return undefined;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);
  return { busy, msg, setMsg, run };
}

export function InlineMsg({ msg }: { msg: Msg | null }) {
  // Always rendered so screen readers announce changes in the live region.
  return (
    <div className="lgi-live" role={msg?.kind === 'err' ? 'alert' : 'status'} aria-live={msg?.kind === 'err' ? 'assertive' : 'polite'}>
      {msg && (
        <div className={`lgi-msg lgi-msg--${msg.kind}`}>
          <span className="lgi-msg__icon" aria-hidden="true"><Icon name={msg.kind === 'ok' ? 'check' : msg.kind === 'err' ? 'warning' : 'info'} size={18} /></span>
          <div>
            <span className="lgi-sr">{msg.kind === 'ok' ? 'Başarılı: ' : msg.kind === 'err' ? 'Hata: ' : 'Bilgi: '}</span>
            {msg.text}
            {msg.fields && msg.fields.length > 0 && (
              <ul className="lgi-msg__fields">{msg.fields.map((f, i) => <li key={i}>{f}</li>)}</ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'err'; children: ReactNode }) {
  return (
    <div className={`lgi-notice lgi-notice--${kind}`}>
      <span className="lgi-msg__icon" aria-hidden="true"><Icon name={kind === 'info' ? 'info' : 'warning'} size={18} /></span>
      <div>{children}</div>
    </div>
  );
}

/** Ticks every `ms` so countdowns / relative times re-render. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** "5 dk önce", "2 sa sonra", "şimdi". */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  const t = toMs(iso);
  if (t === null) return '—';
  const diff = t - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return 'şimdi';
  let txt: string;
  if (min < 60) txt = `${min} dk`;
  else if (min < 48 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    txt = m && h < 10 ? `${h} sa ${m} dk` : `${h} sa`;
  } else txt = `${Math.round(min / 1440)} gün`;
  return diff < 0 ? `${txt} önce` : `${txt} sonra`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  const t = toMs(iso);
  if (t === null) return '—';
  return new Date(t).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return Number(v.toFixed(digits)).toLocaleString('en-GB');
}

/** `<input type="datetime-local">` value for a Date, in local time. */
export function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NeedSelection() {
  return <p className="lgi-muted">Önce üst çubuktan bir görev ve ekip üyesi seçin (ya da bir demo senaryosu çalıştırın).</p>;
}

export function Section({ id, title, hint, badge, children }: {
  id: string; title: string; hint?: ReactNode; badge?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="lgi-card" aria-labelledby={`${id}-h`}>
      <header className="lgi-card__head">
        <h3 id={`${id}-h`} className="lgi-card__title">{title}</h3>
        {badge}
      </header>
      {hint && <p className="lgi-card__hint">{hint}</p>}
      {children}
    </section>
  );
}
