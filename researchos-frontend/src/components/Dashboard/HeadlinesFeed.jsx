import { useNavigate } from 'react-router-dom'
export function HeadlinesFeed({ headlines, loading, error, topic, setTopic, onFetch }) {
  function handleKey(e) {
    if (e.key === 'Enter') onFetch()
  }

  const QUICK_TOPICS = ['world news', 'technology', 'finance', 'AI news', 'India news']

  return (
    <div className="dash-card dash-card--headlines">
      <div className="dash-card-header">
        <span className="dash-card-icon">📰</span>
        <span className="dash-card-title">Live Headlines</span>
        {headlines.length > 0 && (
          <span className="dash-card-badge">{headlines.length} stories</span>
        )}
      </div>

      {/* Topic input */}
      <div className="dash-city-row">
        <input
          className="dash-input"
          placeholder="Topic…"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          className="dash-fetch-btn"
          onClick={onFetch}
          disabled={loading}
        >
          {loading ? <SpinnerIcon /> : <RefreshIcon />}
        </button>
      </div>

      {/* Quick topic chips */}
      <div className="headlines-quick-topics">
        {QUICK_TOPICS.map(t => (
          <button
            key={t}
            className={`headlines-topic-chip${topic === t ? ' headlines-topic-chip--active' : ''}`}
            onClick={() => { setTopic(t); onFetch(t) }}
            disabled={loading}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="dash-error">{error}</p>}

      <div className="headlines-list">
        {loading && headlines.length === 0 ? (
          [1,2,3,4,5].map(i => <HeadlineSkeleton key={i} />)
        ) : headlines.length === 0 ? (
          <p className="dash-empty-hint">No headlines found. Try a different topic.</p>
        ) : (
          headlines.map((h, i) => <HeadlineItem key={i} headline={h} index={i} />)
        )}
      </div>
    </div>
  )
}

function HeadlineItem({ headline, index }) {
  const navigate = useNavigate()

  function formatDate(raw) {
    if (!raw) return ''
    try { return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
    catch { return '' }
  }

  const topic = headline.title || ''

  return (
    <div className="headline-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="headline-index" style={{ flexShrink: 0, marginTop: 3 }}>{index + 1}</span>
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Title — clicks through to article URL */}
        <a
          href={headline.url}
          target="_blank"
          rel="noopener noreferrer"
          className="headline-title"
          style={{ display: 'block', marginBottom: 4, textDecoration: 'none' }}
        >
          {headline.title}
        </a>

        {/* Meta row */}
        <div className="headline-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {headline.source && <span className="headline-source">{headline.source}</span>}
          {headline.published_date && <span className="headline-date">{formatDate(headline.published_date)}</span>}

          {/* NEW: cross-feature action buttons */}
          <button
            onClick={() => navigate(`/news?topic=${encodeURIComponent(topic)}`)}
            title="Search news on this topic"
            style={{
              padding: '2px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 5, color: '#fbbf24',
            }}
          >📰 More news</button>

          <button
            onClick={() => navigate(`/research?topic=${encodeURIComponent(topic)}`)}
            title="Research this topic"
            style={{
              padding: '2px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 5, color: '#818cf8',
            }}
          >🔬 Research</button>
        </div>
      </div>
    </div>
  )
}

function HeadlineSkeleton() {
  return (
    <div className="headline-skeleton">
      <div className="headline-skeleton-title" />
      <div className="headline-skeleton-meta" />
    </div>
  )
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
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

function ExternalIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}
