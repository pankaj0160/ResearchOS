import { useNavigate } from 'react-router-dom'  // NEW

/**
 * ArticleCard — renders one news article result.
 * NEW: "Research this topic" button navigates to /research?topic=...
 */
export function ArticleCard({ article, index }) {
  const navigate   = useNavigate()  // NEW
  const domain     = article.source || ''
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : null

  function formatDate(raw) {
    if (!raw) return ''
    try { return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return raw }
  }

  const relevancePct = Math.min(100, Math.round((article.score ?? 0) * 100))

  // NEW: navigate to research page with this article's title as the topic
  function handleResearch(e) {
    e.preventDefault()    // stop the <a> from opening the article URL
    e.stopPropagation()
    navigate(`/research?topic=${encodeURIComponent(article.title)}`)
  }

  return (
    <a href={article.url} target="_blank" rel="noopener noreferrer" className="article-card">
      <span className="article-index">{index + 1}</span>

      <div className="article-body">
        <div className="article-meta">
          <span className="article-source">
            {faviconUrl && (
              <img src={faviconUrl} alt="" width={12} height={12} className="article-favicon"
                   onError={e => { e.target.style.display = 'none' }} />
            )}
            {domain}
          </span>
          {article.published_date && (
            <span className="article-date">{formatDate(article.published_date)}</span>
          )}
          {relevancePct > 0 && (
            <span className="article-score">{relevancePct}% match</span>
          )}
        </div>

        <h3 className="article-title">{article.title}</h3>

        {article.snippet && (
          <p className="article-snippet">{article.snippet}</p>
        )}

        {/* NEW: Research this topic button */}
        <button
          onClick={handleResearch}
          style={{
            marginTop: '8px',
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 600,
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '6px',
            color: '#818cf8',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            letterSpacing: '0.02em',
          }}
        >
          🔬 Research this topic
        </button>
      </div>

      <span className="article-link-icon"><ExternalIcon /></span>
    </a>
  )
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}