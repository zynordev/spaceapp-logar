// Public surface of the shared UI kit. Features import ONLY from here:
//   import { Panel, AttentionBadge, Button, toast } from '../../ui';
// See ./README.md.
import './ui.css';

export {
  ATTENTION,
  ATTENTION_ORDER,
  AttentionBadge,
  attentionClass,
  attentionMeta,
  toAttention,
  worstAttention,
  type AttentionBadgeProps,
  type AttentionMeta,
} from './attention';
export {
  Button,
  Chip,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  Skeleton,
  Spinner,
  Textarea,
  type ButtonProps,
  type ChipProps,
  type ChipTone,
  type EmptyStateProps,
  type FieldProps,
  type PanelProps,
  type SkeletonProps,
  type SpinnerProps,
} from './primitives';
export { ErrorNote, FORBIDDEN_MESSAGE, describeError, handleForbidden, notifyError, type ErrorNoteProps } from './errors';
export { ToastHost, toast, type ToastOptions, type ToastTone } from './toast';
export { Dialog, type DialogProps } from './Dialog';
export { Tabs, type TabItem, type TabsProps } from './Tabs';
export { Icon, type IconName } from './icons';
export {
  ROLE_LABEL,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
  formatTime,
  roleLabel,
} from './format';
