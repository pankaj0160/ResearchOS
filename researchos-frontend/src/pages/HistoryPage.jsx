import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth }   from '../context/AuthContext'
import { searchApi } from '../services/searchApi'


import { API_BASE_URL } from '../services/config.js'
const BASE = API_BASE_URL

const TABS = [
  { id: 'research', label: 'Research',  icon: '🔬', color: '#818cf8' },
  { id: 'pdf',      label: 'PDF Chat',  icon: '📄', color: '#2dd4bf' },
  { id: 'news',     label: 'News',       icon: '📰', color: '#fbbf24' },
  { id: 'activity', label: 'All Activity', icon: '⚡', color: '#c084fc' },
]

const SOURCE_BADGE = {
  pdf:           { label: 'PDF',          bg: 'rgba(20,184,166,.12)',  color: '#2dd4bf' },
  research_run:  { label: 'From Research', bg: 'rgba(99,102,241,.12)', color: '#818cf8' },
  text_ingest:   { label: 'Text Import',   bg: 'rgba(34,197,94,.12)',  color: '#4ade80' },
}

function fmtDate(ts) {
  if (!ts) return '—'
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(ts) {
  if (!ts) return ''
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate     = useNavigate()
  const { getToken } = useAuth()

  const activeTab = searchParams.get('tab') ?? 'research'
  const setTab = (t) => setSearchParams({ tab: t })

  const [data,      setData]      = useState({})
  const [loading,   setLoading]   = useState(true)
  const [query,     setQuery]     = useState('')
  const [srResults, setSrResults] = useState(null)  // null = not searching
  const [srLoading, setSrLoading] = useState(false)
  const [limit,     setLimit]     = useState(20)
  const debounceRef = useRef(null)

  const headers = useCallback(() => ({
    Authorization: `Bearer ${getToken()}`
  }), [getToken])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`${BASE}/api/history/unified?limit=${limit}&feature=all`, { headers: headers() })
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [limit, headers])

  useEffect(() => { load() }, [load])

  // Live search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (query.length < 2) { setSrResults(null); return }
    debounceRef.current = setTimeout(async () => {
      setSrLoading(true)
      try {
        const d = await searchApi.history(query, 50)
        setSrResults(d.results ?? [])
      } catch (e) { console.error(e) }
      setSrLoading(false)
    }, 280)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const deleteRun = async (id) => {
    if (!confirm('Delete this research run? This cannot be undone.')) return
    await fetch(`${BASE}/api/history/${id}`, { method: 'DELETE', headers: headers() })
    load()
  }

  const tabMeta = TABS.find(t => t.id === activeTab) ?? TABS[0]

  // Data for current tab
  const tabData = {
    research: srResults ?? data.research ?? [],
    pdf:      data.pdf      ?? [],
    news:     data.news     ?? [],
    activity: data.activity ?? [],
  }[activeTab] ?? []

  return (
    <div style={{ padding: '0', minHeight: '100vh', background: '#09090b' }}>

      {/* ── Premium header ── */}
      <div style={{
        padding: '2rem 2rem 0',
        background: 'linear-gradient(180deg, rgba(99,102,241,0.06) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: '1.5rem' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6366f1', marginBottom: 6 }}>ResearchOS</p>
              <h1 style={{ fontSize: 'clamp(1.5rem,4vw,2.2rem)', fontWeight: 800, letterSpacing: '-.04em' }}>History</h1>
              <p style={{ color: '#71717a', fontSize: 14, marginTop: 4 }}>Everything you've researched, read, and tracked</p>
            </div>

            {/* Search bar */}
            <div style={{ position: 'relative', width: 'min(340px,100%)' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: 0.4 }}>⌕</span>
              <input
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search all history…"
                style={{
                  width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, color: '#fafafa', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                }}
              />
              {srLoading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#6366f1' }}>…</span>}
            </div>
          </div>

          {/* Tab strip */}
          <div style={{ display: 'flex', gap: 2 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
                  color: activeTab === tab.id ? tab.color : '#71717a',
                  transition: 'color .15s, border-color .15s',
                  marginBottom: '-1px',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                  background: activeTab === tab.id ? `${tab.color}20` : 'rgba(255,255,255,0.05)',
                  color: activeTab === tab.id ? tab.color : '#52525b',
                }}>
                  {(tabData).length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 2rem' }}>

        {loading && (
          <div style={{ display: 'grid', gap: 10 }}>
            {[1,2,3].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && tabData.length === 0 && (
          <EmptyState tab={activeTab} tabMeta={tabMeta} navigate={navigate} />
        )}

        {!loading && activeTab === 'research' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {tabData.map(run => (
              <ResearchCard key={run.id} run={run} navigate={navigate} onDelete={deleteRun} token={getToken()} base={BASE} />
            ))}
            <LoadMoreBar limit={limit} setLimit={setLimit} total={tabData.length} color="#818cf8" />
          </div>
        )}

        {!loading && activeTab === 'pdf' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {tabData.map(s => <PDFCard key={s.session_id} session={s} navigate={navigate} />)}
          </div>
        )}

        {!loading && activeTab === 'news' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {tabData.map(t => <NewsCard key={t.id} topic={t} navigate={navigate} />)}
          </div>
        )}

        {!loading && activeTab === 'activity' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {tabData.map(ev => <ActivityRow key={ev.id} event={ev} navigate={navigate} />)}
            <LoadMoreBar limit={limit} setLimit={setLimit} total={tabData.length} color="#c084fc" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResearchCard({ run, navigate, onDelete, token, base }) {
  const score = run.score ? parseFloat(run.score) : null
  const scoreColor = score >= 8 ? '#4ade80' : score >= 6 ? '#fbbf24' : '#f87171'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '1.1rem 1.25rem',
      transition: 'border-color .15s, background .15s',
      cursor: 'pointer',
    }}
      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor='rgba(99,102,241,0.35)' }}
      onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)' }}
      onClick={() => navigate(`/research?run_id=${run.id}`)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Accent bar */}
        <div style={{ width: 3, borderRadius: 3, background: '#6366f1', alignSelf: 'stretch', flexShrink: 0, minHeight: 40 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fafafa', flex: 1, minWidth: 0 }}>
              {run.topic}
            </span>
            {score !== null && (
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                background: `${scoreColor}18`, color: scoreColor, border: `1px solid ${scoreColor}40`, flexShrink: 0,
              }}>
                {score}/10
              </span>
            )}
          </div>

          {/* Excerpt */}
          {run.excerpt && (
            <p style={{ fontSize: 13, color: '#71717a', lineHeight: 1.6, marginBottom: 10, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {run.excerpt}
            </p>
          )}

          {/* Meta + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#52525b' }}>{fmtDate(run.created_at)}</span>
            {run.word_count > 0 && <span style={{ fontSize: 11, color: '#52525b' }}>{run.word_count?.toLocaleString()} words</span>}
            {run.source_count > 0 && <span style={{ fontSize: 11, color: '#52525b' }}>{run.source_count} sources</span>}
            <div style={{ flex: 1 }} />
            <ActionBtn
              label="Open" color="#818cf8"
              onClick={e => { e.stopPropagation(); navigate(`/research?run_id=${run.id}`) }}
            />
            <ActionBtn
              label="Export" color="#2dd4bf"
              onClick={async e => {
                e.stopPropagation()
                const res  = await fetch(`${base}/api/history/${run.id}/export`, { headers: { Authorization: `Bearer ${token}` } })
                const blob = await res.blob()
                const url  = URL.createObjectURL(blob); const a = document.createElement('a')
                a.href = url; a.download = `research-${run.id}.md`; a.click(); URL.revokeObjectURL(url)
              }}
            />
            <ActionBtn
              label="Delete" color="#f87171"
              onClick={e => { e.stopPropagation(); onDelete(run.id) }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function PDFCard({ session, navigate }) {
  const badge = SOURCE_BADGE[session.source_type] ?? SOURCE_BADGE.pdf
  return (
    <div
      onClick={() => navigate(`/pdf-chat?session=${session.session_id}`)}
      style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: '1rem 1.25rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
      }}
      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor='rgba(20,184,166,0.3)' }}
      onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)' }}
    >
      <div style={{ width: 3, borderRadius: 3, background: '#2dd4bf', alignSelf: 'stretch', minHeight: 40, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fafafa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.filename}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: badge.bg, color: badge.color, flexShrink: 0 }}>{badge.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#52525b' }}>{fmtDate(session.created_at)}</span>
          {session.chunk_count > 0 && <span style={{ fontSize: 11, color: '#52525b' }}>{session.chunk_count} chunks</span>}
        </div>
      </div>
      <span style={{ fontSize: 13, color: '#52525b' }}>→</span>
    </div>
  )
}

function NewsCard({ topic, navigate }) {
  return (
    <div
      onClick={() => navigate(`/news?topic=${encodeURIComponent(topic.topic)}&category=${topic.category}`)}
      style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: '1rem 1.25rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
      }}
      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor='rgba(245,158,11,0.3)' }}
      onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)' }}
    >
      <div style={{ width: 3, borderRadius: 3, background: '#fbbf24', alignSelf: 'stretch', minHeight: 36, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fafafa', marginBottom: 3 }}>{topic.topic}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>{topic.category}</span>
          <span style={{ fontSize: 11, color: '#52525b' }}>Tracked since {fmtDate(topic.created_at)}</span>
        </div>
      </div>
      <span style={{ fontSize: 13, color: '#52525b' }}>→</span>
    </div>
  )
}

const ACT_META = {
  research_run:      { icon: '🔬', color: '#818cf8', label: 'Research',  url: p => `/research?run_id=${p.run_id}` },
  pdf_upload:        { icon: '📄', color: '#2dd4bf', label: 'PDF Upload', url: p => `/pdf-chat?session=${p.session_id}` },
  text_ingested:     { icon: '💾', color: '#4ade80', label: 'Saved Doc',  url: p => `/pdf-chat?session=${p.session_id}` },
  news_search:       { icon: '📰', color: '#fbbf24', label: 'News',       url: p => `/news?topic=${encodeURIComponent(p.topic||'')}` },
  workspace_created: { icon: '📁', color: '#c084fc', label: 'Workspace',  url: p => `/workspace/${p.workspace_id}` },
}

function ActivityRow({ event, navigate }) {
  const m = ACT_META[event.event_type] ?? { icon: '⚡', color: '#71717a', label: event.event_type, url: () => '/' }
  const p = event.payload ?? {}
  const title = p.topic || p.name || p.filename || p.title || event.event_type
  return (
    <div
      onClick={() => navigate(m.url(p))}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
        borderRadius: 10, cursor: 'pointer',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
      }}
      onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{m.icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0, minWidth: 70 }}>{m.label}</span>
      <span style={{ fontSize: 13, color: '#fafafa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ fontSize: 11, color: '#52525b', flexShrink: 0 }}>{fmtDate(event.created_at)}, {fmtTime(event.created_at)}</span>
    </div>
  )
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
      background: `${color}12`, border: `1px solid ${color}30`,
      borderRadius: 6, color,
    }}>{label}</button>
  )
}

function LoadMoreBar({ limit, setLimit, total, color }) {
  if (total < limit) return null
  return (
    <div style={{ textAlign: 'center', paddingTop: 12 }}>
      <button onClick={() => setLimit(l => l + 20)} style={{
        padding: '8px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 8, color,
      }}>Load more</button>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 18, width: '60%', background: 'rgba(255,255,255,0.06)', borderRadius: 6 }} />
      <div style={{ height: 14, width: '85%', background: 'rgba(255,255,255,0.04)', borderRadius: 5 }} />
      <div style={{ height: 14, width: '40%', background: 'rgba(255,255,255,0.03)', borderRadius: 5 }} />
    </div>
  )
}

function EmptyState({ tab, tabMeta, navigate }) {
  const actions = {
    research: { cta: 'Start a research run', path: '/research' },
    pdf:      { cta: 'Upload a PDF',          path: '/pdf-chat' },
    news:     { cta: 'Track a topic',          path: '/news' },
    activity: { cta: 'Start using ResearchOS', path: '/dashboard' },
  }
  const action = actions[tab]
  return (
    <div style={{ textAlign: 'center', padding: '4rem 0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{tabMeta.icon}</div>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#fafafa', marginBottom: 8 }}>No {tabMeta.label} history yet</p>
      <p style={{ fontSize: 13, color: '#52525b', marginBottom: 20 }}>Your activity will appear here once you get started.</p>
      <button onClick={() => navigate(action.path)} style={{
        padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        background: tabMeta.color + '18', border: `1px solid ${tabMeta.color}40`, borderRadius: 10, color: tabMeta.color,
      }}>{action.cta}</button>
    </div>
  )
}