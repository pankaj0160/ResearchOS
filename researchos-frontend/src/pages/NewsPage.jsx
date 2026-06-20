import { useNews }         from '../hooks/useNews'
import { NewsSearchBar }   from '../components/News/NewsSearchBar'
import { NewsSummary }     from '../components/News/NewsSummary'
import { ArticleCard }     from '../components/News/ArticleCard'
import { NewsStats }       from '../components/News/NewsStats'
import { useEffect, useRef } from 'react'                       // NEW
import { useSearchParams }   from 'react-router-dom'            // NEW


export default function NewsPage() {
  const [searchParams] = useSearchParams()   // NEW  
  const searchedRef    = useRef(false)        // prevent double-search in StrictMode

  const {
    topic, setTopic,
    category, setCategory,
    days, setDays,
    articles, summary, loading, streaming, error, searched,
    search, reset,
  } = useNews()

  // NEW: pre-fill from URL params and auto-search
  useEffect(() => {
    const topicParam    = searchParams.get('topic')
    const categoryParam = searchParams.get('category')
    if (!topicParam || searchedRef.current) return
    searchedRef.current = true
    setTopic(topicParam)
    if (categoryParam) setCategory(categoryParam)
    // Small delay so setTopic/setCategory state updates propagate before search
    setTimeout(() => search(), 200)
  }, [searchParams, setTopic, setCategory, search])

  return (
    <div className="news-page">

      {/* ── Page header ── */}
      <div className="news-page-header">
        <div>
          <h1 className="page-title">
            <span className="page-title-icon">📰</span>
            News Intelligence
          </h1>
          <p className="page-subtitle">
            Enter any topic and get a structured AI briefing from the latest sources.
          </p>
        </div>
        {searched && (
          <button className="news-reset-btn" onClick={reset}>
            <ResetIcon /> New search
          </button>
        )}
      </div>

      {/* ── Search bar ── */}
      <NewsSearchBar
        topic={topic}
        setTopic={setTopic}
        category={category}
        setCategory={setCategory}
        days={days}
        setDays={setDays}
        onSearch={search}
        loading={loading}
      />

      {/* ── Error banner ── */}
      {error && (
        <div className="news-error-banner">
          <ErrorIcon /> {error}
        </div>
      )}

      {/* ── Empty state (before first search) ── */}
      {!searched && !loading && (
        <NewsEmptyState />
      )}

      {/* ── Results: summary  article list ── */}
      {(searched || loading) && (
        <div className="news-results-layout">

          {/* Left: AI Briefing */}
          <div className="news-results-left">
            <NewsSummary
              summary={summary}
              streaming={streaming}
              loading={loading}
              articleCount={articles.length}
              topic={topic}
            />
          </div>

          {/* Right: Article list */}
          <div className="news-results-right">
            <div className="news-articles-panel">
              <div className="news-articles-header">
                <span className="news-articles-title">Source Articles</span>
                {articles.length > 0 && (
                  <span className="news-articles-count">{articles.length}</span>
                )}
              </div>

              {/* Stats bar */}
              {articles.length > 0 && (
                <NewsStats articles={articles} days={days} category={category} />
              )}

              {/* Cards */}
              <div className="news-articles-list">
                {articles.length === 0 && loading ? (
                  <ArticlesSkeleton />
                ) : articles.length === 0 ? (
                  <p className="news-no-articles">No articles found. Try a broader topic or different date range.</p>
                ) : (
                  articles.map((article, i) => (
                    <ArticleCard key={article.url || i} article={article} index={i} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Empty state ── */
function NewsEmptyState() {
  return (
    <div className="news-empty-state">
      <div className="news-empty-icon">📰</div>
      <h2 className="news-empty-title">Your intelligence feed awaits</h2>
      <p className="news-empty-desc">
        Search any topic above to get an AI-structured briefing alongside the
        latest source articles — all in one view.
      </p>
      <div className="news-empty-features">
        {[
          { icon: '⚡', text: 'Real-time news via Tavily search' },
          { icon: '✦',  text: 'Structured AI briefing — 5 sections' },
          { icon: '🔗', text: 'Linked source articles with relevance scores' },
          { icon: '🗂',  text: '9 category filters  date range control' },
        ].map(f => (
          <div key={f.text} className="news-empty-feature">
            <span className="news-empty-feature-icon">{f.icon}</span>
            <span>{f.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Articles skeleton ── */
function ArticlesSkeleton() {
  return (
    <div className="news-articles-skeleton">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="article-skeleton">
          <div className="article-skeleton-meta" />
          <div className="article-skeleton-title" />
          <div className="article-skeleton-snippet" />
        </div>
      ))}
    </div>
  )
}

function ResetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
