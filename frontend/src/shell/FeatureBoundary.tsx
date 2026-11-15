// Isolates each feature: a crash in one panel never blanks the dashboard.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Icon } from '../ui';

interface Props {
  name: string;
  children: ReactNode;
  compact?: boolean;
}

interface State {
  error: Error | null;
}

export class FeatureBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] panel error`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(this.state.error.message);
    return (
      <div className={`shell-crash${this.props.compact ? ' shell-crash--compact' : ''}`} role="alert">
        <Icon name="warning" size={18} />
        <div>
          <p className="shell-crash__title">
            {this.props.name}: {chunk ? 'component could not be loaded' : 'this section could not be displayed'}
          </p>
          {!this.props.compact && <p className="shell-crash__detail">Other sections keep working.</p>}
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon="refresh"
          onClick={() => (chunk ? window.location.reload() : this.setState({ error: null }))}
        >
          Retry
        </Button>
      </div>
    );
  }
}
