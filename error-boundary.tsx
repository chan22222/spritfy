import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  t?: Record<string, string>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  private handleRefresh = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { t } = this.props;
    const title = t?.errorTitle ?? 'Something went wrong';
    const desc = t?.errorDesc ?? 'An unexpected error occurred. Please refresh the page.';
    const refreshLabel = t?.errorRefresh ?? 'Refresh';

    return (
      <div
        role="alert"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          backgroundColor: 'var(--bg-dark, #121212)',
          color: 'var(--text-main, #ffffff)',
          textAlign: 'center',
          minHeight: 320,
        }}
      >
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64,
          height: 64,
          background: 'rgba(207, 102, 121, 0.1)',
          border: '2px solid var(--danger, #cf6679)',
          marginBottom: 24,
        }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 32, color: 'var(--danger, #cf6679)' }}
            aria-hidden="true"
          >
            error
          </span>
        </div>

        <h2 style={{
          fontFamily: "'DungGeunMo', monospace",
          fontSize: '1.4rem',
          fontWeight: 'normal',
          color: 'var(--text-main, #ffffff)',
          margin: '0 0 12px',
          textShadow: '3px 3px 0 rgba(207, 102, 121, 0.15)',
        }}>
          {title}
        </h2>

        <p style={{
          fontSize: '0.92rem',
          color: 'var(--text-muted, #b0b0b0)',
          lineHeight: 1.8,
          margin: '0 0 28px',
          maxWidth: 420,
        }}>
          {desc}
        </p>

        <button
          type="button"
          onClick={this.handleRefresh}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: "'DungGeunMo', monospace",
            fontSize: '0.95rem',
            color: 'var(--bg-dark, #121212)',
            background: 'var(--danger, #cf6679)',
            padding: '12px 28px',
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18 }}
            aria-hidden="true"
          >
            refresh
          </span>
          {refreshLabel}
        </button>

        {this.state.error && (
          <details style={{
            marginTop: 32,
            padding: '16px 20px',
            background: 'var(--bg-panel, #1e1e1e)',
            border: '1px solid var(--border, #333333)',
            maxWidth: 500,
            width: '100%',
            textAlign: 'left',
          }}>
            <summary style={{
              fontFamily: "'DungGeunMo', monospace",
              fontSize: '0.8rem',
              color: 'var(--text-muted, #b0b0b0)',
              cursor: 'pointer',
              marginBottom: 8,
            }}>
              Error Details
            </summary>
            <pre style={{
              fontSize: '0.75rem',
              color: 'var(--danger, #cf6679)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              lineHeight: 1.5,
            }}>
              {this.state.error.message}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
