import React from "react";

function reportCritical(event: {
  category: string;
  severity?: string;
  source: string;
  message: string;
  stack?: string;
  route?: string;
}) {
  try {
    const api = (window as any).electronAPI?.logs;
    if (api?.reportCritical) {
      api.reportCritical(event).catch(() => {});
    }
  } catch (e) {
    console.warn('[ErrorBoundary] Failed to forward critical report to Electron IPC:', e);
  }
}

interface Props {
  children: React.ReactNode;
  route?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
  errorStack: string | null;
  lastRoute: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: null,
      errorStack: null,
      lastRoute: props.route ?? null,
    };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const incoming = props.route ?? null;
    if (incoming !== state.lastRoute) {
      return { hasError: false, errorMessage: null, errorStack: null, lastRoute: incoming };
    }
    return null;
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const e = error instanceof Error ? error : null;
    return {
      hasError:     true,
      errorMessage: e ? e.message : String(error),
      errorStack:   e ? (e.stack ?? null) : null,
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const e = error instanceof Error ? error : null;
    reportCritical({
      category: 'renderer_failure',
      severity: 'error',
      source:   'ErrorBoundary',
      message:  e ? e.message : String(error),
      stack:    e ? (e.stack ?? undefined) : undefined,
      route:    this.props.route,
    });

    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
    } else {
      console.error('[ErrorBoundary] Render error caught:', e?.message ?? String(error));
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: null, errorStack: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
        <div className="max-w-md w-full space-y-4 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. The error has been logged automatically.
          </p>
          {this.state.errorMessage && (
            <p className="text-xs font-mono bg-muted/30 border border-border/50 rounded p-3 text-left text-red-400 break-all">
              {this.state.errorMessage}
            </p>
          )}
          <button
            onClick={this.handleReload}
            className="mt-4 px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
            data-testid="button-error-boundary-retry"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
