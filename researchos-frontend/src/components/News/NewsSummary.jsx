import ReactMarkdown from 'react-markdown'
import remarkGfm     from 'remark-gfm'

/**
 * NewsSummary — renders the streaming AI briefing.
 * Shows a skeleton while loading, then progressively renders markdown.
 */
export function NewsSummary({ summary, streaming, loading, articleCount, topic }) {
  // Skeleton state — articles received but summary not started yet
  const showSkeleton = loading && !summary

  return (
    <div className="news-summary-panel">
      {/* Header */}
      <div className="news-summary-header">
        <div className="news-summary-header-left">
          <span className="news-summary-icon">✦</span>
          <span className="news-summary-title">AI Briefing</span>
          {streaming && (
            <span className="news-summary-streaming-badge">
              <span className="news-streaming-dot" />
              Generating…
            </span>
          )}
        </div>
        {articleCount > 0 && !loading && (
          <span className="news-summary-meta">{articleCount} sources analysed</span>
        )}
      </div>

      {/* Body */}
      <div className="news-summary-body">
        {showSkeleton ? (
          <SummarySkeleton />
        ) : summary ? (
          <div className="news-summary-content report-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {summary}
            </ReactMarkdown>
            {streaming && <span className="chat-cursor" />}
          </div>
        ) : (
          <div className="news-summary-empty">
            <p>AI summary will appear here once you search for a topic.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="news-skeleton">
      {/* Section heading */}
      <div className="news-skeleton-heading" />
      <div className="news-skeleton-line news-skeleton-line--full" />
      <div className="news-skeleton-line news-skeleton-line--80" />
      <div className="news-skeleton-line news-skeleton-line--90" />

      <div className="news-skeleton-heading" style={{ marginTop: '1.5rem' }} />
      <div className="news-skeleton-line news-skeleton-line--full" />
      <div className="news-skeleton-line news-skeleton-line--70" />
      <div className="news-skeleton-line news-skeleton-line--85" />
      <div className="news-skeleton-line news-skeleton-line--60" />

      <div className="news-skeleton-heading" style={{ marginTop: '1.5rem' }} />
      <div className="news-skeleton-line news-skeleton-line--full" />
      <div className="news-skeleton-line news-skeleton-line--75" />
    </div>
  )
}
