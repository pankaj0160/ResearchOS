import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { activityApi } from '../../services/activityApi'

// Metadata for each event type — icon, label, colour, URL builder
const EVENT_META = {
  research_run: {
    icon: '🔬', label: 'Researched', color: '#818cf8',
    url: (p) => p.run_id ? `/research?run_id=${p.run_id}` : '/research',
    title: (p) => p.topic || 'Research run',
    meta: (p) => p.word_count ? `${p.word_count.toLocaleString()} words` : null,
  },
  pdf_upload: {
    icon: '📄', label: 'Uploaded PDF', color: '#2dd4bf',
    url: (p) => p.session_id ? `/pdf-chat?session=${p.session_id}` : '/pdf-chat',
    title: (p) => p.filename || 'PDF document',
    meta: () => null,
  },
  text_ingested: {
    icon: '💾', label: 'Saved as doc', color: '#4ade80',
    url: (p) => p.session_id ? `/pdf-chat?session=${p.session_id}` : '/pdf-chat',
    title: (p) => p.title || 'Saved document',
    meta: () => null,
  },
  news_search: {
    icon: '📰', label: 'Searched news', color: '#fbbf24',
    url: (p) => `/news?topic=${encodeURIComponent(p.topic || '')}&category=${p.category || 'general'}`,
    title: (p) => p.topic || 'News search',
    meta: (p) => p.article_count ? `${p.article_count} articles` : null,
  },
  workspace_created: {
    icon: '📁', label: 'Created workspace', color: '#c084fc',
    url: (p) => p.workspace_id ? `/workspace/${p.workspace_id}` : '/',
    title: (p) => p.name || 'New workspace',
    meta: (p) => p.topic || null,
  },
}

const DEFAULT_META = {
  icon: '⚡', label: 'Activity', color: '#71717a',
  url: () => '/',
  title: (p, type) => type,
  meta: () => null,
}

function timeAgo(unixTs) {
  const secs = Math.floor(Date.now() / 1000) - unixTs
  if (secs < 60)   return 'just now'
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`
  if (secs < 86400)return `${Math.floor(secs/3600)}h ago`
  return new Date(unixTs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ActivityFeed({ limit = 15 }) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const navigate              = useNavigate()

  useEffect(() => {
    let cancelled = false

    setLoading(true)

    activityApi.getRecent(limit).then(result => {
      if (cancelled) return

      if (result.ok) {
        setEvents(result.data?.events ?? [])
      } else {
        // apiClient already shows a toast for 429/500/network errors,
        // and redirects to /login on 401. For other failures (404/422
        // if the route or limit is malformed) we just fall back to empty.
        setEvents([])
      }
      setLoading(false)
    })

    // Cleanup: if `limit` changes again or component unmounts before
    // this resolves, skip the stale setState calls.
    return () => { cancelled = true }
  }, [limit])

  if (loading) return (
    <div style={{ padding: '1rem 0' }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ height: 44, background: 'rgba(255,255,255,0.03)', borderRadius: 10, marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  )

  if (events.length === 0) return (
    <p style={{ fontSize: 13, color: '#52525b', padding: '1rem 0' }}>
      No activity yet — run a research query, upload a PDF, or search news to get started.
    </p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map(event => {
        const meta    = EVENT_META[event.event_type] ?? DEFAULT_META
        const payload = event.payload ?? {}
        const url     = meta.url(payload)
        const title   = meta.title(payload, event.event_type)
        const detail  = meta.meta(payload)

        return (
          <div
            key={event.id}
            onClick={() => navigate(url)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              transition: 'background .12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 13, color: '#fafafa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </span>
              </div>
              {detail && <div style={{ fontSize: 11, color: '#52525b', marginTop: 2 }}>{detail}</div>}
            </div>
            <span style={{ fontSize: 11, color: '#52525b', flexShrink: 0, whiteSpace: 'nowrap' }}>
              {timeAgo(event.created_at)}
            </span>
          </div>
        )
      })}
    </div>
  )
}