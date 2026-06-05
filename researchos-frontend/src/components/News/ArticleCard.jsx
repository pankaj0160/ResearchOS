/**
 * ArticleCard — renders one news article result.
 * Shows: source favicon + domain, title, published date, snippet, relevance score.
 */
export function ArticleCard({ article, index }) {
  const domain   = article.source || ''
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : null

  function formatDate(raw) {
    if (!raw) return ''
    try {
      return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return raw
    }
  }

  // Relevance score as percentage, capped at 100
  const relevancePct = Math.min(100, Math.round((article.score ?? 0) * 100))

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="article-card"
    >
      {/* Index badge */}
      <span className="article-index">{index + 1}</span>

      <div className="article-body">
        {/* Source + date */}
        <div className="article-meta">
          <span className="article-source">
            {faviconUrl && (
              <img src={faviconUrl} alt="" width={12} height={12} className="article-favicon" onError={e => { e.target.style.display = 'none' }} />
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

        {/* Title */}
        <h3 className="article-title">{article.title}</h3>

        {/* Snippet */}
        {article.snippet && (
          <p className="article-snippet">{article.snippet}</p>
        )}
      </div>

      {/* External link icon */}
      <span className="article-link-icon"><ExternalIcon /></span>
    </a>
  )
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}
