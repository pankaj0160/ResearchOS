import { useNews }               from '../hooks/useNews'
import { NewsSearchBar }          from '../components/News/NewsSearchBar'
import { NewsSummary }            from '../components/News/NewsSummary'
import { ArticleCard }            from '../components/News/ArticleCard'
import { NewsStats }              from '../components/News/NewsStats'
import { TrackedTopicsSidebar }   from '../components/News/TrackedTopicsSidebar'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth }                from '../context/AuthContext'
import { MiniHistoryStrip } from '../components/History/MiniHistoryStrip'
import NewsSkeleton from '../components/skeletons/NewsSkeleton'

// ─── tiny helper: read token from localStorage ───────────────────────────────
const getToken = () => localStorage.getItem('researchos_token') ?? ''

// ─── API base (Vite env var, falls back to same-origin) ──────────────────────

import { API_BASE_URL as API } from '../services/config.js'

export default function NewsPage() {
  const [searchParams] = useSearchParams()
  const navigate        = useNavigate()
  const searchedRef     = useRef(false)

  // ── action-button state ────────────────────────────────────────────────────
  const [tracking,      setTracking]      = useState(false)
  const [tracked,       setTracked]       = useState(false)  // shows ✓ for 3s
  const [savingBriefing, setSavingBriefing] = useState(false)
  const [briefingSaved,  setBriefingSaved]  = useState(false)

  const {
    topic, setTopic,
    category, setCategory,
    days, setDays,
    articles, summary, loading, streaming, error, searched,
    search, reset,
  } = useNews()

  // ── URL param auto-search ─────────────────────────────────────────────────
  useEffect(() => {
    const topicParam    = searchParams.get('topic')
    const categoryParam = searchParams.get('category')
    if (!topicParam || searchedRef.current) return
    searchedRef.current = true
    setTopic(topicParam)
    if (categoryParam) setCategory(categoryParam)
    setTimeout(() => search(), 200)
  }, [searchParams, setTopic, setCategory, search])

  // ── reset tracked badge when topic changes ────────────────────────────────
  useEffect(() => { setTracked(false) }, [topic])

  // ── Track this topic ──────────────────────────────────────────────────────
  const handleTrack = useCallback(async () => {
    if (!topic.trim() || tracking) return
    setTracking(true)
    try {
      await fetch(`${API}/api/news/track`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ topic: topic.trim(), category: category || 'general' }),
      })
      setTracked(true)
      setTimeout(() => setTracked(false), 3000)
    } catch (e) {
      console.error('Track failed:', e)
    }
    setTracking(false)
  }, [topic, category, tracking])

  // ── Save briefing as document → PDF Chat ─────────────────────────────────
  const handleSaveBriefing = useCallback(async () => {
    if (!summary || savingBriefing) return
    setSavingBriefing(true)
    try {
      const res = await fetch(`${API}/api/rag/ingest-text`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          text:  summary,
          title: `News: ${topic}`,
          metadata: { source: 'news_briefing', topic, category, days },
        }),
      })
      const data = await res.json()
      const sessionId = data.session_id ?? data.id ?? null
      setBriefingSaved(true)

      // Navigate to PDF Chat with the new session
      setTimeout(() => {
        if (sessionId) navigate(`/pdf-chat?session=${sessionId}`)
        else           navigate('/pdf-chat')
      }, 800)
    } catch (e) {
      console.error('Save briefing failed:', e)
      setSavingBriefing(false)
    }
  }, [summary, topic, category, days, savingBriefing, navigate])

  // ── Tracked topic click ───────────────────────────────────────────────────
  const handleSelectTracked = (trackedTopic, trackedCategory) => {
    setTopic(trackedTopic)
    if (trackedCategory) setCategory(trackedCategory)
    setTimeout(() => search(), 150)
  }

  // ── Derived: show action buttons only when briefing is ready ─────────────
  const briefingReady = searched && !loading && !streaming && summary

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

      {/* ── Two-column layout ── */}
      <div className="news-two-col">
        <div>
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

          {/* ── Action buttons — visible once briefing is ready ── */}
          {briefingReady && (
            <div className="news-action-bar">
              {/* Track */}
              <button
                className={`news-action-btn ${tracked ? 'news-action-btn--success' : ''}`}
                onClick={handleTrack}
                disabled={tracking || tracked}
              >
                {tracked   ? '✓ Tracking'       :
                 tracking  ? 'Tracking…'         :
                             '📌 Track this topic'}
              </button>

              {/* Save briefing */}
              <button
                className={`news-action-btn ${briefingSaved ? 'news-action-btn--success' : 'news-action-btn--primary'}`}
                onClick={handleSaveBriefing}
                disabled={savingBriefing || briefingSaved}
              >
                {briefingSaved  ? '✓ Saved — opening PDF Chat…' :
                 savingBriefing ? 'Saving…'                      :
                                  '💾 Save briefing as document'}
              </button>

              {/* Research */}
              <button
                className="news-action-btn news-action-btn--research"
                onClick={() => navigate(`/research?topic=${encodeURIComponent(topic)}`)}
              >
                🔬 Research this topic
              </button>
            </div>
          )}

          {/* ── Error banner ── */}
          {error && (
            <div className="news-error-banner">
              <ErrorIcon /> {error}
            </div>
          )}

          {/* ── Empty state ── */}
          {!searched && !loading && <NewsEmptyState />}

          {/* ── Results ── */}
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

                  {articles.length > 0 && (
                    <NewsStats articles={articles} days={days} category={category} />
                  )}

                  <div className="news-articles-list">
                  {articles.length === 0 && loading ? (
                    <NewsSkeleton count={5} />
                  ) : articles.length === 0 ? (
                    <p className="news-no-articles">
                      No articles found. Try a broader topic or different date range.
                    </p>
                  ) : (
                    articles.map((article, i) => (
                      <ArticleCard
                        key={article.url || i}
                        article={article}
                        index={i}
                        currentTopic={topic}
                      />
                    ))
                  )}
                </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column — wraps both sidebar widgets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <TrackedTopicsSidebar onSelectTopic={handleSelectTracked} />
          <MiniHistoryStrip feature="news" />
        </div>
      </div>

      {/* ── Action bar styles ── */}
      <style>{`
        .news-action-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 1rem;
          padding: 10px 0;
          border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.08));
        }

        .news-two-col {
          display: grid;
          grid-template-columns: 1fr 220px;
          gap: 1.25rem;
          align-items: start;
        }
        @media (max-width: 768px) {
          .news-two-col {
            grid-template-columns: 1fr;
          }
        }

        .news-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s, transform 0.1s;
          border: 1px solid var(--color-border, rgba(0,0,0,0.12));
          background: var(--color-surface, #fff);
          color: var(--color-text, #111);
          white-space: nowrap;
        }

        .news-action-btn:hover:not(:disabled) {
          background: var(--color-surface-hover, #f3f4f6);
          transform: translateY(-1px);
        }

        .news-action-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .news-action-btn--primary {
          background: #6366f1;
          border-color: #6366f1;
          color: #fff;
        }
        .news-action-btn--primary:hover:not(:disabled) {
          background: #4f51e0;
        }

        .news-action-btn--research {
          background: rgba(245,158,11,0.08);
          border-color: rgba(245,158,11,0.3);
          color: #d97706;
        }
        .news-action-btn--research:hover:not(:disabled) {
          background: rgba(245,158,11,0.14);
        }

        .news-action-btn--success {
          background: rgba(34,197,94,0.1);
          border-color: rgba(34,197,94,0.3);
          color: #16a34a;
        }

        /* Dark mode */
        .dark .news-action-btn,
        [data-theme="dark"] .news-action-btn {
          background: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.1);
          color: #e4e4e7;
        }
        .dark .news-action-btn:hover:not(:disabled),
        [data-theme="dark"] .news-action-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.09);
        }
        .dark .news-action-btn--primary,
        [data-theme="dark"] .news-action-btn--primary {
          background: #6366f1;
          border-color: #6366f1;
          color: #fff;
        }
        .dark .news-action-btn--research,
        [data-theme="dark"] .news-action-btn--research {
          background: rgba(245,158,11,0.1);
          border-color: rgba(245,158,11,0.25);
          color: #fbbf24;
        }
        .dark .news-action-btn--success,
        [data-theme="dark"] .news-action-btn--success {
          color: #4ade80;
        }
        .dark .news-action-bar,
        [data-theme="dark"] .news-action-bar {
          border-color: rgba(255,255,255,0.07);
        }
      `}</style>
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
          { icon: '🗂',  text: '9 category filters + date range control' },
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