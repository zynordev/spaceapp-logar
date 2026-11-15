// Toast API: call `toast(...)` from anywhere (components, event handlers,
// async code). The shell renders <ToastHost /> once.
import { create } from 'zustand';
import { Icon, type IconName } from './icons';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, tone: ToastTone, timeoutMs: number) => number;
  dismiss: (id: number) => void;
}

let seq = 0;

const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (message, tone, timeoutMs) => {
    // Same text already visible: don't stack duplicates (polling errors etc.).
    const existing = get().items.find((t) => t.message === message);
    if (existing) return existing.id;
    const id = ++seq;
    set((s) => ({ items: [...s.items.slice(-3), { id, message, tone }] }));
    if (timeoutMs > 0) setTimeout(() => get().dismiss(id), timeoutMs);
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export interface ToastOptions {
  tone?: ToastTone;
  /** 0 = stays until dismissed. Default 4500 ms (errors 7000 ms). */
  timeoutMs?: number;
}

/** Show a short Turkish message. Returns an id usable with toast.dismiss(id). */
export function toast(message: string, opts: ToastOptions = {}): number {
  const tone = opts.tone ?? 'info';
  return useToasts.getState().push(message, tone, opts.timeoutMs ?? (tone === 'error' ? 7000 : 4500));
}
toast.success = (message: string, timeoutMs?: number) => toast(message, { tone: 'success', timeoutMs });
toast.error = (message: string, timeoutMs?: number) => toast(message, { tone: 'error', timeoutMs });
toast.warn = (message: string, timeoutMs?: number) => toast(message, { tone: 'warn', timeoutMs });
toast.dismiss = (id: number) => useToasts.getState().dismiss(id);

const ICON: Record<ToastTone, IconName> = { info: 'info', success: 'check', warn: 'warning', error: 'critical' };

export function ToastHost() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="ui-toasts" role="region" aria-label="Notifications">
      {/* polite live region for info/success, assertive for errors */}
      <div aria-live="polite" className="ui-toasts__stack">
        {items
          .filter((t) => t.tone !== 'error')
          .map((t) => (
            <ToastView key={t.id} item={t} onClose={() => dismiss(t.id)} />
          ))}
      </div>
      <div aria-live="assertive" className="ui-toasts__stack">
        {items
          .filter((t) => t.tone === 'error')
          .map((t) => (
            <ToastView key={t.id} item={t} onClose={() => dismiss(t.id)} />
          ))}
      </div>
    </div>
  );
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  return (
    <div className={`ui-toast ui-toast--${item.tone}`}>
      <Icon name={ICON[item.tone]} size={18} />
      <p className="ui-toast__msg">{item.message}</p>
      <button type="button" className="ui-toast__close" onClick={onClose} aria-label="Close notification">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
