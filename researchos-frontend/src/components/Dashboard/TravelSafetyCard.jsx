import ReactMarkdown from 'react-markdown'
import remarkGfm     from 'remark-gfm'

export function TravelSafetyCard({ safety, loading, error, destInput, setDestInput, onFetch }) {
  function handleKey(e) {
    if (e.key === 'Enter') onFetch()
  }

  // Parse safety level from analysis text
  function parseSafetyLevel(text) {
    if (!text) return null
    const m = text.match(/Safety Level[:\s*]+(\d)/i)
    return m ? parseInt(m[1]) : null
  }

  const level = safety ? parseSafetyLevel(safety.analysis) : null

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <span className="dash-card-icon">🛡</span>
        <span className="dash-card-title">Travel Safety</span>
        {level != null && (
          <SafetyBadge level={level} />
        )}
      </div>

      {/* Destination input */}
      <div className="dash-city-row">
        <input
          className="dash-input"
          placeholder="Enter destination…"
          value={destInput}
          onChange={e => setDestInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          className="dash-fetch-btn"
          onClick={onFetch}
          disabled={loading || !destInput.trim()}
        >
          {loading ? <SpinnerIcon /> : <SearchIcon />}
        </button>
      </div>

      {error && <p className="dash-error">{error}</p>}

      {loading && !safety && (
        <div className="dash-skeleton">
          <div className="dash-skeleton-row dash-skeleton-lg" />
          <div className="dash-skeleton-row dash-skeleton-md" />
          <div className="dash-skeleton-row dash-skeleton-md" />
          <div className="dash-skeleton-row dash-skeleton-sm" />
        </div>
      )}

      {safety && (
        <div className="safety-content">
          {/* Score bar */}
          {level != null && (
            <div className="safety-score-row">
              {[1,2,3,4,5].map(n => (
                <div
                  key={n}
                  className="safety-score-dot"
                  style={{ background: n <= level ? levelColor(level) : 'var(--border)' }}
                />
              ))}
              <span className="safety-score-label" style={{ color: levelColor(level) }}>
                {levelLabel(level)}
              </span>
            </div>
          )}

          <div className="safety-analysis report-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {safety.analysis}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {!safety && !loading && !error && (
        <div className="dash-empty-hint">
          Enter a destination to get a safety briefing with risk assessment and precautions.
        </div>
      )}
    </div>
  )
}

function SafetyBadge({ level }) {
  return (
    <span
      className="dash-card-badge"
      style={{ color: levelColor(level), borderColor: levelColor(level) + '40', background: levelColor(level) + '15' }}
    >
      {level}/5 · {levelLabel(level)}
    </span>
  )
}

function levelColor(n) {
  if (n <= 2) return '#ef4444'
  if (n === 3) return '#f59e0b'
  return '#22c55e'
}

function levelLabel(n) {
  return ['', 'Very Unsafe', 'Unsafe', 'Moderate', 'Safe', 'Very Safe'][n] ?? 'Unknown'
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  )
}
