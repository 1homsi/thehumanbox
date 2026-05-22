import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '../lib/logger'

interface Props {
  /** Subtree to guard. */
  children: ReactNode
  /** Optional override for the fallback UI. */
  fallback?: ReactNode
}

interface State {
  err: Error | null
}

/**
 * Top-level error boundary. A render-time throw anywhere under
 * `<App/>` would unmount the entire tree to a blank page without
 * this. We log via the global logger (so the no-console rule stays
 * honest), surface a minimal fallback with a reload button, and
 * keep the splash hidden so users aren't stuck on a dead screen.
 *
 * lazyWithRetry already handles chunk-load errors specifically;
 * this catches the rest.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    logger.error('boundary', err.message, info.componentStack)
  }

  render() {
    if (this.state.err) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            background: '#0c0a08',
            color: '#c8c0b0',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            zIndex: 99999,
          }}
        >
          <h1 style={{ fontSize: 22, margin: 0, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            The world stuttered
          </h1>
          <p style={{ fontSize: 13, color: '#7e7568', maxWidth: 480, textAlign: 'center', margin: 0 }}>
            Something unexpected happened in the renderer. The simulation is still running on the server -
            reload to reconnect.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#3a2618',
              color: '#d8d2c4',
              border: '1px solid #5a3a20',
              borderRadius: 4,
              padding: '8px 18px',
              fontSize: 12,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
