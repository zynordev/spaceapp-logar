// Shared layout + form primitives (owned by UI-shell). Styling: ui.css.
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { attentionClass } from './attention';
import type { Attention } from '../lib/store';
import { Icon, type IconName } from './icons';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ Panel */

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Visible heading (h2). Also names the region for screen readers. */
  title?: ReactNode;
  /** Small muted line under the title. */
  subtitle?: ReactNode;
  /** Right side of the header (buttons, chips, badges). */
  actions?: ReactNode;
  /** Tints the left edge with an attention colour. */
  attention?: Attention | null;
  /** Less padding (dense lists, side panels). */
  dense?: boolean;
  /** Heading level, default 2. */
  level?: 2 | 3;
  children?: ReactNode;
}

export function Panel({ title, subtitle, actions, attention, dense, level = 2, className, children, ...rest }: PanelProps) {
  const id = useId();
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <section
      {...rest}
      aria-labelledby={title ? `${id}-t` : rest['aria-labelledby']}
      className={cx('ui-panel', dense && 'ui-panel--dense', attention && `ui-panel--att ${attentionClass(attention)}`, className)}
    >
      {(title || actions) && (
        <header className="ui-panel__head">
          <div className="ui-panel__titles">
            {title && (
              <H id={`${id}-t`} className="ui-panel__title">
                {title}
              </H>
            )}
            {subtitle && <p className="ui-panel__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="ui-panel__actions">{actions}</div>}
        </header>
      )}
      <div className="ui-panel__body">{children}</div>
    </section>
  );
}

/* ----------------------------------------------------------------- Button */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean;
  icon?: IconName;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('ui-btn', `ui-btn--${variant}`, size === 'sm' && 'ui-btn--sm', className)}
    >
      {loading ? <Spinner size={14} label={null} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Field */

export interface FieldProps {
  label: ReactNode;
  /** Muted help text under the control (linked with aria-describedby). */
  hint?: ReactNode;
  /** Error text (role=alert, sets aria-invalid on the control). */
  error?: ReactNode;
  /** Pass one control element (Input/Select/Textarea/native); id + aria are wired automatically. */
  children: ReactElement;
  className?: string;
  /** Show "(isteğe bağlı)" after the label. */
  optional?: boolean;
}

export function Field({ label, hint, error, children, className, optional }: FieldProps) {
  const auto = useId();
  const child = Children.only(children);
  const childProps = (isValidElement(child) ? child.props : {}) as { id?: string; 'aria-describedby'?: string };
  const id = childProps.id ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = cx(childProps['aria-describedby'], hintId, errId) || undefined;
  return (
    <div className={cx('ui-field', error ? 'ui-field--error' : null, className)}>
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {optional && <span className="ui-field__optional"> (isteğe bağlı)</span>}
      </label>
      {cloneElement(child as ReactElement<Record<string, unknown>>, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx('ui-input', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="ui-select-wrap">
      <select {...rest} className={cx('ui-input ui-select', className)}>
        {children}
      </select>
      <Icon name="chevron-down" size={16} className="ui-select-wrap__chev" />
    </span>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx('ui-input ui-textarea', className)} />;
}

/* ------------------------------------------------------------------- Chip */

export type ChipTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'demo';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  icon?: IconName;
  children?: ReactNode;
}

/** Small label pill. tone="demo" marks DEMO thresholds (violet, dashed). */
export function Chip({ tone = 'neutral', icon, className, children, ...rest }: ChipProps) {
  return (
    <span {...rest} className={cx('ui-chip', `ui-chip--${tone}`, className)}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- EmptyState */

export interface EmptyStateProps {
  title: ReactNode;
  children?: ReactNode;
  icon?: IconName;
  /** Optional call to action (e.g. a Button). */
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, children, icon = 'info', action, compact }: EmptyStateProps) {
  return (
    <div className={cx('ui-empty', compact && 'ui-empty--compact')} role="status">
      <span className="ui-empty__icon">
        <Icon name={icon} size={compact ? 20 : 28} />
      </span>
      <p className="ui-empty__title">{title}</p>
      {children && <div className="ui-empty__text">{children}</div>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Spinner */

export interface SpinnerProps {
  size?: number;
  /** Accessible text; pass null when the parent already announces busy state. */
  label?: string | null;
}

export function Spinner({ size = 18, label = 'Yükleniyor…' }: SpinnerProps) {
  return (
    <span className="ui-spinner" role={label ? 'status' : undefined} style={{ width: size, height: size }}>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

/* --------------------------------------------------------------- Skeleton */

export interface SkeletonProps {
  /** CSS height of one block (default 1em). */
  height?: number | string;
  /** Repeat as text lines. */
  lines?: number;
  className?: string;
}

/** Shimmering placeholder (static under reduced motion). Decorative. */
export function Skeleton({ height = '1em', lines = 1, className }: SkeletonProps) {
  return (
    <span className={cx('ui-skeleton-group', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="ui-skeleton" style={{ height, width: lines > 1 && i === lines - 1 ? '60%' : undefined }} />
      ))}
    </span>
  );
}
