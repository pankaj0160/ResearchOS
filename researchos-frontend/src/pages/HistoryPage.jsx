/**
 * HistoryPage.jsx
 * Location: src/pages/HistoryPage.jsx
 *
 * What this page does:
 *   Shows a unified timeline of all user activity across every feature.
 *   Left panel: scrollable list of past items (Research, PDF, News).
 *   Right panel: full content of the selected item.
 *
 * Key fixes vs previous version:
 *   - Calls /api/history/unified (the new endpoint we built in Week 1)
 *   - Clicking a research item loads /api/history/{id} for full report
 *   - Feature tabs filter by type (All / Research / PDF / News)
 *   - Full markdown report rendered with proper formatting
 *   - Skeleton loading on both panels
 *   - Empty states for each feature type
 */

import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { apiClient } from '../services/apiClient'

// ── Icons ─────────────────────────────────────────────────────────────────────
const SearchIcon  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
const FileIcon    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const NewsIcon    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/></svg>
const ClockIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
  const now = new Date()
  const diff = (now - d) / 1000

  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const TYPE_META = {
  research: { label: 'Research', Icon: SearchIcon,  color: 'var(--agent-search)' },
  rag:      { label: 'PDF Chat', Icon: FileIcon,     color: 'var(--agent-critic)' },
  news:     { label: 'News',     Icon: NewsIcon,     color: 'var(--agent-writer)' },
}

const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'research', label: 'Research' },
  { key: 'pdf',      label: 'PDF' },
  { key: 'news',     label: 'News' },
]

// ── Skeleton loaders ──────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div style={{ padding: '0.5rem' }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton" style={{ height: 10, width: '30%' }} />
          <div className="skeleton" style={{ height: 13, width: '85%' }} />
          <div className="skeleton" style={{ height: 10, width: '50%' }} />
        </div>
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '1.5rem' }}>
      <div className="skeleton" style={{ height: 28, width: '70%' }} />
      <div className="skeleton" style={{ height: 14, width: '40%' }} />
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[100, 90, 95, 80, 92, 75, 88].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: 13, width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [tab,        setTab]        = useState('all')
  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null)   // the clicked history item
  const [detail,     setDetail]     = useState(null)   // full content loaded from API
  const [detailLoad, setDetailLoad] = useState(false)
  const [error,      setError]      = useState(null)

  // ── Load unified history ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const feature = tab === 'all' ? 'all' : tab === 'pdf' ? 'pdf' : tab
        const res  = await apiClient.get(`/api/history/unified?feature=${feature}&limit=50`)
        setItems(res.data?.items || [])
      } catch (e) {
        setError(e.message || 'Failed to load history')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tab])

  // ── Load full detail when item is clicked ─────────────────────────────────
  const loadDetail = useCallback(async (item) => {
    setSelected(item)
    setDetail(null)
    setDetailLoad(true)

    try {
      if (item.type === 'research') {
        // Fetch the full research report (includes full report text)
        const res = await apiClient.get(`/api/history/${item.id}`)
        setDetail({ type: 'research', data: res.data })

      } else if (item.type === 'rag') {
        // PDF sessions don't have a "full content" view — show metadata
        setDetail({ type: 'rag', data: item })

      } else if (item.type === 'news') {
        // News topics — show topic info
        setDetail({ type: 'news', data: item })
      }
    } catch (e) {
      setDetail({ type: 'error', message: e.message })
    } finally {
      setDetailLoad(false)
    }
  }, [])

  // ── Render detail panel content ────────────────────────────────────────────
  const renderDetail = () => {
    if (detailLoad) return <DetailSkeleton />

    if (!selected) return (
      <div className="history-empty-detail">
        <div style={{ fontSize: '2.5rem' }}>👈</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Select an item from the list to view its full content
        </p>
      </div>
    )

    if (!detail) return <DetailSkeleton />

    if (detail.type === 'error') return (
      <div style={{ padding: '1.5rem' }}>
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
          Failed to load: {detail.message}
        </div>
      </div>
    )

    if (detail.type === 'research') {
      const run = detail.data
      return (
        <div className="history-detail-body">
          {/* Header meta */}
          <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 8 }}>
              {run.topic}
            </h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {run.score && (
                <span style={{ padding: '2px 8px', background: 'var(--gold-dim)', color: 'var(--gold)', border: '1px solid var(--gold-border)', borderRadius: 99, fontWeight: 700 }}>
                  Score {run.score}/10
                </span>
              )}
              {run.word_count > 0 && <span>{run.word_count.toLocaleString()} words</span>}
              {run.source_count > 0 && <span>{run.source_count} sources</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ClockIcon /> {formatDate(run.created_at)}</span>
            </div>
          </div>

          {/* Copy button */}
          <div style={{ marginBottom: '1rem', display: 'flex', gap: 8 }}>
            <button
              className="research-toolbar-btn"
              onClick={() => {
                navigator.clipboard.writeText(run.report || '')
                  .then(() => alert('Report copied to clipboard!'))
              }}
            >
              📋 Copy Report
            </button>
            <button
              className="research-toolbar-btn"
              onClick={() => {
                const blob = new Blob([run.report || ''], { type: 'text/markdown' })
                const url  = URL.createObjectURL(blob)
                const a    = document.createElement('a')
                a.href     = url
                a.download = `${run.topic.slice(0, 40)}.md`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              ⬇️ Download .md
            </button>
          </div>

          {/* Full report rendered as markdown */}
          <div className="report-content">
            <ReactMarkdown>{run.report || '_No report content available._'}</ReactMarkdown>
          </div>

          {/* Feedback / critique */}
          {run.feedback && (
            <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: 8 }}>
                AI Critique
              </div>
              <div className="report-content" style={{ fontSize: 13 }}>
                <ReactMarkdown>{run.feedback}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )
    }

    if (detail.type === 'rag') {
      const s = detail.data
      return (
        <div className="history-detail-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
            <div style={{ width: 48, height: 48, background: 'color-mix(in srgb, var(--agent-critic) 14%, transparent)', color: 'var(--agent-critic)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📄</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{s.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {s.page_count > 0 && `${s.page_count} pages · `}
                {s.chunk_count > 0 && `${s.chunk_count} chunks · `}
                {formatDate(s.created_at)}
              </div>
            </div>
          </div>
          <div style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--accent-border)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65 }}>
              This PDF was processed and indexed for chat. To chat with this document again, open the <strong style={{ color: 'var(--text-primary)' }}>PDF Chat</strong> page and select this session.
            </p>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
            <a href="/pdf-chat" className="btn-primary" style={{ textDecoration: 'none', padding: '7px 16px', fontSize: 13 }}>
              Open PDF Chat →
            </a>
          </div>
        </div>
      )
    }

    if (detail.type === 'news') {
      const t = detail.data
      return (
        <div className="history-detail-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
            <div style={{ width: 48, height: 48, background: '#FEF3C7', color: '#F59E0B', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📰</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Category: <strong>{t.category || 'general'}</strong> · Tracked {formatDate(t.created_at)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
            <a href={`/news?topic=${encodeURIComponent(t.title)}`} className="btn-primary" style={{ textDecoration: 'none', padding: '7px 16px', fontSize: 13 }}>
              Search this topic again →
            </a>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="page-container page-fade">

      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-icon">📋</span>
          History
        </h1>
        <p className="page-subtitle">
          All your past research, PDF sessions, and news topics in one place.
          Click any item to view its full content.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="history-layout">

        {/* ── Left: List panel ── */}
        <div className="history-list-panel">

          {/* Header */}
          <div className="history-list-header">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Activity
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {loading ? '...' : `${items.length} items`}
            </span>
          </div>

          {/* Feature tabs */}
          <div className="history-tabs">
            {TABS.map(t => (
              <button
                key={t.key}
                className={`history-tab${tab === t.key ? ' history-tab--active' : ''}`}
                onClick={() => { setTab(t.key); setSelected(null); setDetail(null) }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="history-item-list">
            {loading ? (
              <ListSkeleton />
            ) : items.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <div className="empty-state-icon">🔍</div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  No {tab === 'all' ? 'activity' : tab} history yet
                </p>
              </div>
            ) : (
              items.map(item => {
                const meta   = TYPE_META[item.type] || TYPE_META.research
                const Icon   = meta.Icon
                const active = selected?.id === item.id && selected?.type === item.type

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    className={`history-item${active ? ' history-item--active' : ''}`}
                    onClick={() => loadDetail(item)}
                  >
                    <div className="history-item-type" style={{ color: meta.color }}>
                      <Icon /> {meta.label}
                    </div>
                    <div className="history-item-title">{item.title}</div>
                    <div className="history-item-meta">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <ClockIcon /> {formatDate(item.created_at)}
                      </span>
                      {item.score != null && (
                        <span style={{ color: 'var(--gold)' }}>★ {item.score}/10</span>
                      )}
                      {item.word_count > 0 && (
                        <span>{item.word_count.toLocaleString()}w</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Right: Detail panel ── */}
        <div className="history-detail-panel">
          {selected && (
            <div className="history-detail-header">
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: 4 }}>
                {TYPE_META[selected.type]?.label || 'Detail'}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
                {selected.title}
              </div>
            </div>
          )}
          {renderDetail()}
        </div>

      </div>
    </div>
  )
}