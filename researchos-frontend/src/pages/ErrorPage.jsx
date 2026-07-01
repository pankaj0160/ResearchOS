/**
 * ErrorPage.jsx
 * Location: src/pages/ErrorPage.jsx
 *
 * Universal error display for ResearchOS.
 * Used by:
 *   - React Router's <Route path="*"> → 404 Not Found
 *   - ErrorBoundary.jsx              → 500 / unexpected crashes
 *   - Any page that wants to show a "something went wrong" screen
 *
 * Props:
 *   code    {number}  — HTTP-style error code: 404, 500, 403, etc.
 *   title   {string}  — Short headline
 *   message {string}  — Longer explanation for the user
 *   detail  {string}  — Technical detail (shown collapsed, for devs)
 *   onRetry {fn}      — If provided, shows a "Try again" button
 */

import { useNavigate } from 'react-router-dom'

const ERROR_CONFIGS = {
  404: {
    code:    404,
    title:   'Page not found',
    message: "The page you're looking for doesn't exist or has been moved.",
    icon:    '🔭',
  },
  403: {
    code:    403,
    title:   'Access denied',
    message: "You don't have permission to view this page. Try logging in.",
    icon:    '🔒',
  },
  500: {
    code:    500,
    title:   'Something went wrong',
    message: "An unexpected error occurred on our end. We've been notified and are working on it.",
    icon:    '⚡',
  },
  503: {
    code:    503,
    title:   'Service unavailable',
    message: 'ResearchOS is temporarily unavailable. Please try again in a few minutes.',
    icon:    '🛠️',
  },
}

export default function ErrorPage({
  code    = 500,
  title,
  message,
  detail,
  onRetry,
}) {
  const navigate  = useNavigate()

  // Apply defaults from config if props not provided
  const cfg = ERROR_CONFIGS[code] || ERROR_CONFIGS[500]
  const displayTitle   = title   || cfg.title
  const displayMessage = message || cfg.message
  const displayIcon    = cfg.icon

  return (
    <div className="error-page page-fade">
      <div className="error-page-inner">

        {/* Big icon */}
        <div style={{ fontSize: '3.5rem', lineHeight: 1 }}>{displayIcon}</div>

        {/* Error code */}
        <div className="error-code">{code}</div>

        {/* Title */}
        <h1 className="error-title">{displayTitle}</h1>

        {/* Message */}
        <p className="error-desc">{displayMessage}</p>

        {/* Actions */}
        <div className="error-actions">
          <button
            className="btn-primary"
            onClick={() => navigate(-1)}
          >
            ← Go back
          </button>

          <button
            className="btn-secondary"
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </button>

          {onRetry && (
            <button
              className="btn-secondary"
              onClick={onRetry}
            >
              Try again
            </button>
          )}
        </div>

        {/* Technical detail — collapsed by default (for devs) */}
        {detail && (
          <details style={{ width: '100%', marginTop: '0.5rem' }}>
            <summary style={{
              fontSize: '12px',
              color: 'var(--text-faint)',
              cursor: 'pointer',
              userSelect: 'none',
              marginBottom: '0.5rem',
            }}>
              Technical details
            </summary>
            <pre className="error-detail-box">{String(detail)}</pre>
          </details>
        )}

        {/* Branding */}
        <div style={{
          marginTop: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: 'var(--text-faint)',
          fontSize: '12px',
        }}>
          <span style={{
            width: 20, height: 20,
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800,
            fontFamily: 'var(--font-display)',
          }}>R</span>
          ResearchOS
        </div>

      </div>
    </div>
  )
}