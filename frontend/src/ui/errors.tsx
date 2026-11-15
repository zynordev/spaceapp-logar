// Friendly Turkish error rendering + helpers for ApiError (src/lib/api.ts).
import { ApiError } from '../lib/api';
import { Icon } from './icons';
import { Button } from './primitives';
import { toast } from './toast';

export const FORBIDDEN_MESSAGE = 'Bu işlem için yetkiniz yok';

/** Plain-language Turkish text for any thrown value. */
export function describeError(error: unknown, what?: string): { title: string; detail?: string } {
  const subject = what ? `${what}: ` : '';
  if (error instanceof ApiError) {
    if (error.network) return { title: `${subject}Sunucuya ulaşılamıyor`, detail: 'Son bilinen veriler gösteriliyor; otomatik yeniden denenecek.' };
    if (error.notFound) return { title: `${subject}Bu özellik sunucuda henüz yok`, detail: 'Sunucu güncellendiğinde burada görünecek.' };
    if (error.forbidden) return { title: `${subject}${FORBIDDEN_MESSAGE}`, detail: 'Farklı bir rolle oturum açmanız gerekebilir.' };
    if (error.status === 401) return { title: `${subject}Oturum açmanız gerekiyor` };
    if (error.status === 409) return { title: `${subject}Çakışma`, detail: error.message };
    if (error.status === 422) return { title: `${subject}Girilen değerler geçersiz`, detail: error.message };
    if (error.status === 503) return { title: `${subject}Sunucu şu an hazır değil`, detail: error.message };
    return { title: `${subject}İşlem başarısız (HTTP ${error.status})`, detail: error.message };
  }
  return { title: `${subject}Beklenmeyen hata`, detail: error instanceof Error ? error.message : String(error) };
}

export interface ErrorNoteProps {
  error: unknown;
  /** Short subject, e.g. "Alarmlar". */
  what?: string;
  onRetry?: () => void;
  compact?: boolean;
}

/**
 * Inline error box. 404 renders as a calm info note ("sunucuda henüz yok"),
 * since in the parallel build an endpoint may simply not be merged yet.
 */
export function ErrorNote({ error, what, onRetry, compact }: ErrorNoteProps) {
  if (!error) return null;
  const { title, detail } = describeError(error, what);
  const soft = error instanceof ApiError && (error.notFound || error.network);
  return (
    <div className={`ui-error${soft ? ' ui-error--soft' : ''}${compact ? ' ui-error--compact' : ''}`} role={soft ? 'status' : 'alert'}>
      <Icon name={soft ? 'info' : 'warning'} size={18} />
      <div className="ui-error__body">
        <p className="ui-error__title">{title}</p>
        {detail && !compact && <p className="ui-error__detail">{detail}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="ghost" icon="refresh" onClick={onRetry}>
          Yeniden dene
        </Button>
      )}
    </div>
  );
}

/**
 * Call from a catch block after a write. Shows a toast with a friendly
 * message (403 -> "Bu işlem için yetkiniz yok"). Returns the description.
 */
export function notifyError(error: unknown, what?: string) {
  const d = describeError(error, what);
  // 403 on a write is already toasted by api(); identical text is de-duplicated.
  if (error instanceof ApiError && error.forbidden) toast.error(FORBIDDEN_MESSAGE);
  else toast.error(d.detail ? `${d.title} — ${d.detail}` : d.title);
  return d;
}

/** True (and toasts) when the error is a 403; use to branch on permission. */
export function handleForbidden(error: unknown): boolean {
  if (error instanceof ApiError && error.forbidden) {
    toast.error(FORBIDDEN_MESSAGE);
    return true;
  }
  return false;
}
