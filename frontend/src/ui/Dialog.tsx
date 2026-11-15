// Modal dialog on the native <dialog> element: focus trap, Esc and inert
// background come from the browser.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  /** Called on Esc / close button. Omit to make the dialog non-dismissable. */
  onClose?: () => void;
  children: ReactNode;
  /** Footer (buttons). */
  footer?: ReactNode;
  width?: number;
}

export function Dialog({ open, title, onClose, children, footer, width = 420 }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      aria-labelledby={`${id}-t`}
      style={{ width: `min(${width}px, calc(100vw - 24px))` }}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
    >
      <header className="ui-dialog__head">
        <h2 id={`${id}-t`} className="ui-dialog__title">
          {title}
        </h2>
        {onClose && (
          <button type="button" className="ui-dialog__close" onClick={onClose} aria-label="Kapat">
            <Icon name="x" size={18} />
          </button>
        )}
      </header>
      <div className="ui-dialog__body">{children}</div>
      {footer && <footer className="ui-dialog__foot">{footer}</footer>}
    </dialog>
  );
}
