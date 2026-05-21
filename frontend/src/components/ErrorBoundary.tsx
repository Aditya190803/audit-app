import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Renderer] Unhandled React error:', error, info.componentStack)
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="h-screen w-screen bg-[var(--bg)] text-[var(--text-primary)] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-[var(--radius-md)] bg-[var(--danger-bg)] p-2 text-[var(--danger)]">
              <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold">Something went wrong</h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                The audit workspace hit an unexpected UI error. Reloading usually restores the session.
              </p>
              <pre className="mt-3 max-h-28 overflow-auto rounded-[var(--radius-md)] bg-[var(--surface-inset)] p-3 text-xs text-[var(--text-secondary)]">
                {this.state.error.message}
              </pre>
              <button
                className="btn-primary mt-4"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4" strokeWidth={1.8} />
                Reload app
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
