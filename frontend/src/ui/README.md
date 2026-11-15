# `src/ui` — shared UI kit (owned by UI-shell)

Import everything from the barrel: `import { Panel, AttentionBadge, toast } from '../../ui';`
Do not edit files here from a feature track; ask UI-shell (status file) instead.
Theme variables live in `src/styles/tokens.css` (`--surface`, `--text-muted`,
`--accent`, `--att-*`, `--sp-*`, `--radius`, …). Use them, never raw hex. Prefix
your own CSS classes with your feature name (`body3d-…`, `vitals-…`); `ui-` is reserved.

## Rules
- Attention is always **colour + icon + Turkish text**. Use `AttentionBadge` or
  `attentionMeta(level)`; never colour alone. `UNKNOWN` = "Bilinmiyor", slate + dashed, never green.
- Turkish copy, plain language for non-doctor astronauts. No diagnosis/treatment wording.
- Mark DEMO thresholds with `<Chip tone="demo">DEMO</Chip>`.
- Call the backend only via `api()` / `usePolling()` (`src/lib/api.ts`).
  Render failures with `<ErrorNote error={e} />` (404 shows a calm "Bu özellik sunucuda henüz yok").
  After a failed write: `notifyError(e, 'Kayıt')` (403 -> toast "Bu işlem için yetkiniz yok").
- Your panel is mounted inside the shell grid; it should render its own `<Panel>` and fill its width.
  BodyMapPanel/VitalsPanel/AlertsPanel/InputsPanel/GroundPanel are lazy-loaded behind `Suspense`.

## Primitives
| Export | Props |
|---|---|
| `Panel` | `title?, subtitle?, actions?, attention?: Attention, dense?, level?: 2\|3, className?, children` + section attrs |
| `AttentionBadge` | `level: Attention\|string\|null, size?: 'sm'\|'md'\|'lg', children? (custom text), srPrefix?, title?` |
| `ATTENTION`, `attentionMeta(l)`, `toAttention(l)`, `worstAttention(ls)`, `attentionClass(l)`, `ATTENTION_ORDER` | level → `{label, icon, rank, description}`; `attentionClass` gives `att-<level>` which sets `--c / --c-bg / --c-fg` |
| `Button` | `variant?: 'primary'\|'secondary'\|'ghost'\|'danger', size?: 'sm'\|'md', loading?, icon?: IconName` + button attrs (type defaults to `button`) |
| `Field` | `label, hint?, error?, optional?, children: one control` (auto id/aria wiring) |
| `Input`, `Select`, `Textarea` | native attrs, themed |
| `Chip` | `tone?: 'neutral'\|'info'\|'ok'\|'warn'\|'danger'\|'demo', icon?` |
| `EmptyState` | `title, children?, icon?, action?, compact?` |
| `ErrorNote` | `error: unknown, what?, onRetry?, compact?` |
| `Spinner` | `size?, label?: string\|null` |
| `Skeleton` | `height?, lines?, className?` |
| `toast(msg, {tone?, timeoutMs?})`, `toast.success/error/warn(msg)`, `toast.dismiss(id)` | shell renders `<ToastHost/>` |
| `notifyError(e, what?)`, `handleForbidden(e)`, `describeError(e, what?)`, `FORBIDDEN_MESSAGE` | error helpers |
| `Dialog` | `open, title, onClose?, children, footer?, width?` (native `<dialog>`) |
| `Tabs` | `tabs: {id,label,badge?}[], value, onChange, label, children` |
| `Icon` | `name: IconName, size?` (inline SVG, offline) |
| `formatDateTime(v, withSeconds?)`, `formatTime`, `formatRelative`, `formatDuration(sec)`, `formatNumber(v, digits?)`, `roleLabel(role)`, `ROLE_LABEL` | Turkish formatting |

Store (`src/lib/store.ts`): read `missionId`, `crewId`, `environmentTargetId`, `user`, `offline` via `useApp()`.
