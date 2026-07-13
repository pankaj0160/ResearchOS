/**
 * AIDashboardPage.jsx - Production dashboard
 * Location: src/pages/AIDashboardPage.jsx
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { apiClient } from '../services/apiClient'
import { useDashboard } from '../hooks/useDashboard'
import { WeatherCard }     from '../components/Dashboard/WeatherCard'
import { HeadlinesFeed }   from '../components/Dashboard/HeadlinesFeed'
import { DashboardChat }   from '../components/Dashboard/DashboardChat'
import { TravelSafetyCard } from '../components/Dashboard/TravelSafetyCard'
import ContinueResearchDigest from '../components/Dashboard/ContinueResearchDigest'
import DashboardSkeleton   from '../components/skeletons/DashboardSkeleton'

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 5)  return { text: 'Late Night',      emoji: '✨', sub: 'Building while the world sleeps.' }
  if (h < 8)  return { text: 'Early Start',     emoji: '🌅', sub: 'A perfect time to get ahead.' }
  if (h < 12) return { text: 'Good Morning',    emoji: '☀️', sub: 'Fresh insights and opportunities await.' }
  if (h < 14) return { text: 'Good Afternoon',  emoji: '🌤️', sub: 'Take a moment to review what matters most.' }
  if (h < 17) return { text: 'Good Afternoon',  emoji: '🚀', sub: 'Stay focused — consistency compounds.' }
  if (h < 20) return { text: 'Good Evening',    emoji: '🌇', sub: 'Catch up on the latest updates.' }
  return        { text: 'Good Evening',          emoji: '🌙', sub: 'Some of the best ideas come after sunset.' }
}

function formatRelative(ts) {
  if (!ts) return ''
  const d    = new Date(typeof ts === 'number' ? ts * 1000 : ts)
  const diff = (Date.now() - d) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const EVENT_META = {
  research_run:      { icon: '🔬', color: 'var(--agent-search)', label: 'Research' },
  research_complete: { icon: '✅', color: 'var(--success)',     label: 'Research done' },
  pdf_upload:        { icon: '📄', color: 'var(--agent-critic)', label: 'PDF uploaded' },
  news_search:       { icon: '📰', color: 'var(--agent-writer)', label: 'News' },
  news_summarize:    { icon: '📊', color: 'var(--agent-writer)', label: 'Summarized' },
  workspace_created: { icon: '📁', color: 'var(--accent)',       label: 'Workspace' },
}

// ── Quick stat card ───────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, onClick }) {
  const accent = color || 'var(--accent)'
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '1rem', cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .15s, box-shadow .15s, transform .15s',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      {/* Colored top accent bar — quiet signal of what this card represents */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: accent, opacity: 0.85 }} />

      <div className="dash-icon-chip" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1, marginTop: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────
function ActivityFeedCard({ events, loading }) {
  const navigate = useNavigate()

  const navForEvent = (event) => {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload || '{}') : (event.payload || {})
    if (event.event_type?.includes('research') && payload.topic) return () => navigate(`/research?topic=${encodeURIComponent(payload.topic)}`)
    if (event.event_type?.includes('pdf')) return () => navigate('/pdf-chat')
    if (event.event_type?.includes('news') && payload.topic) return () => navigate(`/news?topic=${encodeURIComponent(payload.topic)}`)
    return null
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Recent Activity</span>
        <button onClick={() => navigate('/history')} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
          View all →
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 11, width: '60%', marginBottom: 4 }} />
                <div className="skeleton" style={{ height: 10, width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
          No activity yet. Start by running research or uploading a PDF.
        </div>
      ) : (
        <div>
          {events.slice(0, 8).map((ev, i) => {
            const meta    = EVENT_META[ev.event_type] || { icon: '⚡', color: 'var(--text-muted)', label: ev.event_type }
            const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload || '{}') : (ev.payload || {})
            const detail  = payload.topic || payload.name || payload.filename || ''
            const handler = navForEvent(ev)

            return (
              <div
                key={ev.id || i}
                onClick={handler || undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem',
                  borderBottom: i < Math.min(events.length, 8) - 1 ? '1px solid var(--border)' : 'none',
                  cursor: handler ? 'pointer' : 'default',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (handler) e.currentTarget.style.background = 'var(--bg-base)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: 28, height: 28, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                    {detail && <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{formatRelative(ev.created_at)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Quick actions ─────────────────────────────────────────────────────────────
function QuickActions() {
  const navigate = useNavigate()
  const actions = [
    { icon: '🔬', label: 'New Research',  sub: 'AI-powered pipeline',  color: 'var(--accent)',  path: '/research' },
    { icon: '📄', label: 'PDF Chat',      sub: 'Chat with documents',  color: 'var(--agent-critic)', path: '/pdf-chat' },
    { icon: '📰', label: 'News Intel',    sub: 'AI news briefing',     color: 'var(--agent-writer)', path: '/news' },
    { icon: '📋', label: 'History',       sub: 'Past research',        color: 'var(--text-muted)', path: '/history' },
  ]
  return (
    <div className="dash-quick-actions-grid">
      {actions.map(a => (
        <button
          key={a.path}
          onClick={() => navigate(a.path)}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '0.85rem', cursor: 'pointer', textAlign: 'left',
            transition: 'border-color .15s, box-shadow .15s, transform .12s',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
        >
          <div className="dash-icon-chip" style={{ background: `color-mix(in srgb, ${a.color} 14%, transparent)` }}>
            {a.icon}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{a.label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{a.sub}</span>
        </button>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AIDashboardPage() {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const greet    = getGreeting()
  const now      = new Date()

  const [activity,     setActivity]     = useState([])
  const [actLoading,   setActLoading]   = useState(true)
  const [stats,        setStats]        = useState({ research: 0, pdfs: 0, news: 0 })

  const {
    weather, weatherLoading, weatherError,
    weatherInput, setWeatherInput, fetchWeather,
    safety, safetyLoading, safetyError,
    safetyInput, setSafetyInput, fetchSafety,
    headlines, headlinesLoading, headlinesError,
    headlinesTopic, setHeadlinesTopic, fetchHeadlines,
    chatMessages, chatInput, setChatInput,
    chatLoading, chatError, sendChat,
  } = useDashboard()

  // Load activity + stats — scoped to the active workspace when one is
  // selected, otherwise shows activity across all of the user's workspaces.
  // Re-runs whenever the user switches workspaces via the WorkspaceSwitcher.
  useEffect(() => {
    if (!user) return
    setActLoading(true)
    const wsParam = activeWorkspace?.id != null ? `&workspace_id=${activeWorkspace.id}` : ''
    Promise.all([
      apiClient.get(`/api/activity?limit=20${wsParam}`),
      apiClient.get(`/api/history/recent${wsParam ? `?${wsParam.slice(1)}` : ''}`),
    ]).then(([actRes, recentRes]) => {
      setActivity(actRes.data?.events || [])
      const r = recentRes.data || {}
      setStats({
        research: r.research?.length || 0,
        pdfs:     r.pdf?.length      || 0,
        news:     r.news?.length     || 0,
      })
    }).catch(() => {}).finally(() => setActLoading(false))
  }, [user, activeWorkspace?.id])

  const initialLoading = weatherLoading && headlinesLoading && chatMessages.length === 0 && actLoading
  if (initialLoading) return <DashboardSkeleton />

  return (
    <div className="page-container page-fade">

      {/* Greeting hero — dot-grain + grid pattern, same visual language as the auth pages */}
      <div className="dash-hero dash-stagger dash-stagger--1" style={{ marginBottom: '1.75rem' }}>
        <div className="dash-hero-dots" />
        <div className="dash-hero-grid-pattern" />

        <div className="dash-hero-content" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem,4vw,2rem)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.035em', marginBottom: 4 }}>
              {greet.emoji} {greet.text}, {user?.username || 'Researcher'}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{greet.sub}</p>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-faint)', flexShrink: 0 }}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="dash-stagger dash-stagger--2" style={{ marginBottom: '1.5rem' }}>
        <QuickActions />
      </div>

      {/* Stats row */}
      <div className="dash-stagger dash-stagger--3 dash-stats-grid" style={{ marginBottom: '1.5rem' }}>
        <StatCard icon="🔬" label="Research runs"  value={stats.research} sub="recent sessions" color="var(--agent-search)" onClick={() => window.location.href='/history?tab=research'} />
        <StatCard icon="📄" label="PDF sessions"   value={stats.pdfs}     sub="documents indexed" color="var(--agent-critic)" onClick={() => window.location.href='/pdf-chat'} />
        <StatCard icon="📰" label="News topics"    value={stats.news}     sub="topics tracked" color="var(--agent-writer)" onClick={() => window.location.href='/news'} />
      </div>

      {/* "Continue your research" — cross-references History against fresh
          News search, server-side, to surface only topics with genuinely
          new coverage. See ContinueResearchDigest.jsx + the backend's
          GET /api/news/continue-research. */}
      <div className="dash-stagger dash-stagger--4">
        <ContinueResearchDigest />
      </div>

      {/* Main grid — Weather / Headlines / Travel Safety.
          className was previously missing here entirely, so the matching
          .dash-top-grid breakpoints in index.css (1100px, 700px) never
          applied — this 3-column row stayed fixed-width all the way down
          to phone sizes, squeezing each card to roughly a third of a
          375px screen. */}
      <div className="dash-top-grid dash-stagger dash-stagger--5" style={{ marginBottom: '1rem' }}>
        <WeatherCard
          weather={weather} loading={weatherLoading} error={weatherError}
          cityInput={weatherInput} setCityInput={setWeatherInput} onFetch={fetchWeather}
        />
        <HeadlinesFeed
          headlines={headlines} loading={headlinesLoading} error={headlinesError}
          topic={headlinesTopic} setTopic={setHeadlinesTopic} onFetch={fetchHeadlines}
        />
        <TravelSafetyCard
          safety={safety} loading={safetyLoading} error={safetyError}
          destInput={safetyInput} setDestInput={setSafetyInput} onFetch={fetchSafety}
        />
      </div>

      {/* Bottom row: Activity + Chat.
          Same bug as above but worse — this had NO breakpoint at all
          anywhere (not even a dead/unused one), so it stayed a fixed
          1fr 1fr grid at every viewport width. Now uses .dash-bottom-grid,
          which collapses to one column under 900px. */}
      <div className="dash-bottom-grid">
        <ActivityFeedCard events={activity} loading={actLoading} />
        <DashboardChat
          messages={chatMessages} input={chatInput} setInput={setChatInput}
          loading={chatLoading} error={chatError} onSend={sendChat}
        />
      </div>
    </div>
  )
}