/**
 * ErrorBoundary.jsx
 *
 * LOCATION: src/components/ErrorBoundary.jsx
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS:
 * A React class component that catches JavaScript errors inside any component
 * that it wraps. Instead of a blank white screen, users see a friendly card
 * with a "Try again" button.
 *
 * WHY A CLASS COMPONENT:
 * componentDidCatch() is only available on class components — React has not
 * added this capability to hooks yet. This is the one place in modern React
 * where you still write a class. Every senior React developer knows this rule.
 *
 * HOW TO USE IT (wrap any page in main.jsx):
 *
 *   import ErrorBoundary from './components/ErrorBoundary'
 *
 *   <Route path="/research" element={
 *     <ErrorBoundary pageName="Research">
 *       <ResearchPage />
 *     </ErrorBoundary>
 *   } />
 *
 * WHAT IT CATCHES:
 *   ✓ Null/undefined access (reading .title from null)
 *   ✓ Failed array operations (.map on undefined)
 *   ✓ Component render errors
 *   ✓ Bad data from the API that breaks the UI
 *
 * WHAT IT DOES NOT CATCH:
 *   ✗ Errors inside event handlers (onClick, onChange) — use try/catch there
 *   ✗ Errors in async functions (useEffect, fetch) — handle those separately
 *   ✗ Errors in the ErrorBoundary itself
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// ErrorBoundary Class Component
// ─────────────────────────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)

    // hasError: controls whether we show the fallback UI or the normal children
    // error: the actual JavaScript Error object (message, stack trace)
    // errorInfo: React's component stack — tells you WHICH component crashed
    this.state = {
      hasError:  false,
      error:     null,
      errorInfo: null,
    }

    // Bind reset so it can be called from the fallback UI button
    this.handleReset = this.handleReset.bind(this)
  }

  // ── Called by React when any child component throws during render ──────────
  // This is the "catch" in React's try/catch for rendering.
  // React calls this automatically — you never call it yourself.
  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    // This runs BEFORE the component re-renders with the error
    return { hasError: true, error }
  }

  // ── Called after the error is caught — good place for logging ─────────────
  // errorInfo.componentStack shows the component tree that caused the crash.
  // In production you would send this to Sentry or a logging service.
  componentDidCatch(error, errorInfo) {
    // Store the component stack for display in development
    this.setState({ errorInfo })

    // Log to console so developers can see what happened
    // In production: Sentry.captureException(error, { extra: errorInfo })
    console.error(
      `[ErrorBoundary] Caught error in "${this.props.pageName || 'Unknown'}" page:`,
      error,
      errorInfo.componentStack
    )
  }

  // ── Reset handler — clears the error and shows children again ─────────────
  // When the user clicks "Try again", we reset state.
  // React will try to render children again from scratch.
  handleReset() {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  render() {
    if (this.state.hasError) {
      // Show the fallback UI — friendly card with retry button
      return (
        <ErrorFallback
          error     = {this.state.error}
          errorInfo = {this.state.errorInfo}
          pageName  = {this.props.pageName || 'this page'}
          onReset   = {this.handleReset}
        />
      )
    }

    // No error — render children normally as if ErrorBoundary isn't there
    return this.props.children
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ErrorFallback — the UI shown when a crash is caught
// This is a regular functional component (not a class)
// ─────────────────────────────────────────────────────────────────────────────

function ErrorFallback({ error, errorInfo, pageName, onReset }) {
  // Only show technical details in development — never in production
  // import.meta.env.DEV is true when running `npm run dev`, false after `npm run build`
  const isDev = import.meta.env.DEV

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* Icon */}
        <div style={styles.iconWrapper}>
          <span style={styles.icon}>⚠️</span>
        </div>

        {/* Title */}
        <h2 style={styles.title}>
          Something went wrong
        </h2>

        {/* Human-readable description */}
        <p style={styles.description}>
          The <strong>{pageName}</strong> page ran into an unexpected problem.
          Your data is safe — this is a display error, not a data error.
        </p>

        {/* Action buttons */}
        <div style={styles.buttonRow}>
          {/* Try again — resets ErrorBoundary and re-renders the page */}
          <button style={styles.primaryButton} onClick={onReset}>
            Try again
          </button>

          {/* Go home — navigates to dashboard without a full page reload */}
          <button
            style={styles.secondaryButton}
            onClick={() => window.location.href = '/dashboard'}
          >
            Go to Dashboard
          </button>
        </div>

        {/* Technical details — only visible in development */}
        {isDev && error && (
          <details style={styles.details}>
            <summary style={styles.detailsSummary}>
              🔧 Developer details (only visible in dev mode)
            </summary>
            <div style={styles.detailsBody}>
              {/* Error message */}
              <p style={styles.detailsLabel}>Error:</p>
              <pre style={styles.detailsCode}>
                {error.message}
              </pre>

              {/* Component stack — shows exactly which component crashed */}
              {errorInfo?.componentStack && (
                <>
                  <p style={styles.detailsLabel}>Component stack:</p>
                  <pre style={styles.detailsCode}>
                    {errorInfo.componentStack.trim()}
                  </pre>
                </>
              )}
            </div>
          </details>
        )}

      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// Inline styles
//
// WHY INLINE STYLES HERE:
// If the page crashes because a CSS module fails to load, an external stylesheet
// might also be unavailable. Inline styles always work — they have zero dependencies.
// This is the standard approach for error fallback UIs.
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    minHeight:      '60vh',
    padding:        '2rem',
    fontFamily:     'system-ui, -apple-system, sans-serif',
  },

  card: {
    maxWidth:        '520px',
    width:           '100%',
    backgroundColor: 'var(--color-background-secondary, #f9f9f7)',
    border:          '0.5px solid var(--color-border-tertiary, #e0ddd5)',
    borderRadius:    '14px',
    padding:         '2rem',
    textAlign:       'center',
  },

  iconWrapper: {
    marginBottom: '1rem',
  },

  icon: {
    fontSize: '2.5rem',
  },

  title: {
    fontSize:     '1.25rem',
    fontWeight:   '600',
    color:        'var(--color-text-primary, #1a1916)',
    marginBottom: '0.75rem',
    margin:       '0 0 0.75rem',
  },

  description: {
    fontSize:     '0.875rem',
    color:        'var(--color-text-secondary, #4a4845)',
    lineHeight:   '1.6',
    marginBottom: '1.5rem',
    margin:       '0 0 1.5rem',
  },

  buttonRow: {
    display:        'flex',
    gap:            '0.75rem',
    justifyContent: 'center',
    marginBottom:   '1.5rem',
  },

  primaryButton: {
    backgroundColor: 'var(--color-background-primary, #1a1916)',
    color:           'var(--color-text-inverse, #ffffff)',
    border:          'none',
    borderRadius:    '8px',
    padding:         '0.625rem 1.25rem',
    fontSize:        '0.875rem',
    fontWeight:      '500',
    cursor:          'pointer',
  },

  secondaryButton: {
    backgroundColor: 'transparent',
    color:           'var(--color-text-secondary, #4a4845)',
    border:          '0.5px solid var(--color-border-secondary, #c8c4bc)',
    borderRadius:    '8px',
    padding:         '0.625rem 1.25rem',
    fontSize:        '0.875rem',
    fontWeight:      '500',
    cursor:          'pointer',
  },

  details: {
    marginTop:  '1rem',
    textAlign:  'left',
  },

  detailsSummary: {
    fontSize:    '0.8rem',
    color:       'var(--color-text-tertiary, #888780)',
    cursor:      'pointer',
    userSelect:  'none',
    marginBottom: '0.75rem',
  },

  detailsBody: {
    marginTop: '0.75rem',
  },

  detailsLabel: {
    fontSize:     '0.75rem',
    fontWeight:   '600',
    color:        'var(--color-text-secondary, #4a4845)',
    marginBottom: '0.25rem',
    margin:       '0.75rem 0 0.25rem',
  },

  detailsCode: {
    fontSize:        '0.75rem',
    fontFamily:      'monospace',
    backgroundColor: 'var(--color-background-primary, #ffffff)',
    border:          '0.5px solid var(--color-border-tertiary, #e0ddd5)',
    borderRadius:    '6px',
    padding:         '0.75rem',
    overflowX:       'auto',
    whiteSpace:      'pre-wrap',
    wordBreak:       'break-word',
    color:           '#993C1D',
    margin:          '0',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export default ErrorBoundary