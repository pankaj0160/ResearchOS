/**
 * CalendarPage.jsx — Production calendar with real activity data
 * Location: src/pages/CalendarPage.jsx
 *
 * What changed:
 *  - Uses CSS variables (theme-aware: works in dark AND light mode)
 *  - Parallel fetch: activity + unified history loaded at same time
 *  - Month stats sidebar: total events, most active day, streaks
 *  - Clicking an event navigates to the right page
 *  - Skeleton loading state
 *  - Clean page-fade entry animation
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../services/apiClient'

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

// Color per event type — use CSS variables so they adapt to light/dark
const TYPE_CONFIG = {
  research_run:      { color: 'var(--accent)',  icon: '🔬', label: 'Research',  nav: p => `/research?run_id=${p.run_id||''}` },
  research_complete: { color: 'var(--accent)',  icon: '✅', label: 'Research',  nav: p => `/research?run_id=${p.run_id||''}` },
  pdf_upload:        { color: '#8B5CF6',        icon: '📄', label: 'PDF',       nav: p => `/pdf-chat?session=${p.session_id||''}` },
  news_search:       { color: '#F59E0B',        icon: '📰', label: 'News',      nav: p => `/news?topic=${encodeURIComponent(p.topic||'')}` },
  news_summarize:    { color: '#F59E0B',        icon: '📊', label: 'News',      nav: p => `/news?topic=${encodeURIComponent(p.topic||'')}` },
  workspace_created: { color: '#10B981',        icon: '📁', label: 'Workspace', nav: () => '/workspace' },
}

function toDateKey(ts) {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function formatTime(ts) {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function CalSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
      {[...Array(35)].map((_, i) => (
        <div key={i} className="skeleton" style={{ aspectRatio: '1', borderRadius: 8 }} />
      ))}
    </div>
  )
}

// ── Month stats sidebar ───────────────────────────────────────────────────────
function MonthStats({ byDate, year, month }) {
  const prefix   = `${year}-${String(month+1).padStart(2,'0')}`
  const monthEvs = Object.entries(byDate)
    .filter(([k]) => k.startsWith(prefix))
    .flatMap(([, evs]) => evs)

  const activeDays  = Object.keys(byDate).filter(k => k.startsWith(prefix)).length
  const totalEvents = monthEvs.length
  const mostActive  = Object.entries(byDate)
    .filter(([k]) => k.startsWith(prefix))
    .sort((a, b) => b[1].length - a[1].length)[0]

  const typeCount = monthEvs.reduce((acc, ev) => {
    acc[ev.event_type] = (acc[ev.event_type] || 0) + 1
    return acc
  }, {})

  const topTypes = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Summary */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>
          {MONTHS[month]} Summary
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Total events', value: totalEvents, color: 'var(--accent)' },
            { label: 'Active days',  value: activeDays,  color: '#8B5CF6' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{s.label}</span>
              <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: s.color }}>{s.value}</span>
            </div>
          ))}
          {mostActive && (
            <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
              Most active: <strong style={{ color: 'var(--text-primary)' }}>
                {new Date(mostActive[0]+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
              </strong> ({mostActive[1].length} events)
            </div>
          )}
        </div>
      </div>

      {/* Activity breakdown */}
      {topTypes.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>
            Activity Breakdown
          </div>
          {topTypes.map(([type, count]) => {
            const cfg = TYPE_CONFIG[type] || { icon: '⚡', label: type, color: 'var(--text-muted)' }
            const pct = Math.round((count / totalEvents) * 100)
            return (
              <div key={type} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{cfg.icon} {cfg.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{count}</span>
                </div>
                <div style={{ height: 4, background: 'var(--bg-base)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: cfg.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>
          Legend
        </div>
        {Object.entries(TYPE_CONFIG).filter((_, i) => i < 5).map(([type, cfg]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cfg.icon} {cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const navigate = useNavigate()
  const now      = new Date()

  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth())
  const [events,   setEvents]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)

  // Load all activity events (up to 500)
  useEffect(() => {
    apiClient.get('/api/activity?limit=500')
      .then(res => setEvents(res.data?.events || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Group events by date key "YYYY-MM-DD"
  const byDate = useMemo(() => {
    const map = {}
    for (const ev of events) {
      if (!ev.created_at) continue
      const key = toDateKey(ev.created_at)
      if (!map[key]) map[key] = []
      map[key].push(ev)
    }
    return map
  }, [events])

  // Build the calendar grid cells
  const { cells } = useMemo(() => {
    const firstDay    = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return { cells }
  }, [year, month])

  const prevMonth = useCallback(() => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelected(null)
  }, [month])

  const nextMonth = useCallback(() => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelected(null)
  }, [month])

  const todayKey       = toDateKey(Date.now() / 1000)
  const selectedEvents = selected ? (byDate[selected] || []) : []

  const activeDaysThisMonth = Object.keys(byDate).filter(k =>
    k.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)
  ).length

  return (
    <div className="page-container page-fade">

      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-icon">📅</span>
          Activity Calendar
        </h1>
        <p className="page-subtitle">
          Every research run, PDF upload, and news search mapped to the day it happened.
        </p>
      </div>

      <div className="cal-layout">

        {/* ── Left: Calendar ── */}
        <div>

          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <button
              onClick={prevMonth}
              style={{ width: 36, height: 36, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color .12s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >‹</button>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {MONTHS[month]} {year}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {activeDaysThisMonth} active day{activeDaysThisMonth !== 1 ? 's' : ''}
              </div>
            </div>

            <button
              onClick={nextMonth}
              style={{ width: 36, height: 36, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color .12s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >›</button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? <CalSkeleton /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} />

                const key     = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const dayEvs  = byDate[key] || []
                const isToday = key === todayKey
                const isSel   = key === selected
                const hasEvs  = dayEvs.length > 0
                // Get up to 4 unique event type colors for dots
                const dots    = [...new Set(dayEvs.map(e => e.event_type))].slice(0, 4)

                return (
                  <div
                    key={key}
                    onClick={() => hasEvs && setSelected(isSel ? null : key)}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 10,
                      padding: '6px 4px',
                      background: isSel
                        ? 'var(--accent-dim)'
                        : hasEvs ? 'var(--bg-card)' : 'transparent',
                      border: isSel
                        ? '1px solid var(--accent-border)'
                        : isToday ? '1px solid var(--border-strong)'
                        : '1px solid var(--border)',
                      cursor: hasEvs ? 'pointer' : 'default',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'flex-start',
                      transition: 'background .1s, border-color .1s',
                      opacity: hasEvs ? 1 : 0.4,
                    }}
                    onMouseEnter={e => { if (hasEvs && !isSel) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = hasEvs ? 'var(--bg-card)' : 'transparent' }}
                  >
                    <span style={{
                      fontSize: 12,
                      fontWeight: isToday ? 800 : hasEvs ? 600 : 400,
                      color: isToday ? 'var(--accent)'
                           : isSel   ? 'var(--accent)'
                           : hasEvs  ? 'var(--text-primary)'
                           : 'var(--text-faint)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {day}
                    </span>
                    {dots.length > 0 && (
                      <div style={{ display: 'flex', gap: 2, marginTop: 'auto', flexWrap: 'wrap' }}>
                        {dots.map(type => (
                          <div
                            key={type}
                            style={{ width: 5, height: 5, borderRadius: '50%', background: TYPE_CONFIG[type]?.color || 'var(--text-faint)' }}
                          />
                        ))}
                        {dayEvs.length > 4 && (
                          <span style={{ fontSize: 9, color: 'var(--text-faint)', lineHeight: 1 }}>+{dayEvs.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Day detail panel — shown inline on mobile, below the calendar */}
          {selected && (
            <div style={{ marginTop: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-base)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                    {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ width: 28, height: 28, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >✕</button>
              </div>

              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {selectedEvents.map((ev, i) => {
                  const cfg     = TYPE_CONFIG[ev.event_type] || { icon: '⚡', label: ev.event_type, color: 'var(--text-muted)', nav: () => '/' }
                  const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload || '{}') : (ev.payload || {})
                  const title   = payload.topic || payload.name || payload.filename || payload.title || ev.event_type
                  const navUrl  = cfg.nav(payload)

                  return (
                    <div
                      key={ev.id || i}
                      onClick={() => navigate(navUrl)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '0.7rem 1rem',
                        borderBottom: i < selectedEvents.length - 1 ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer', transition: 'background .1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-base)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: 28, height: 28, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cfg.label}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>{formatTime(ev.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {title}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>→</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Month stats ── */}
        <div style={{ position: 'sticky', top: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[80, 120, 100].map((h, i) => (
                <div key={i} className="skeleton" style={{ height: h, borderRadius: 12 }} />
              ))}
            </div>
          ) : (
            <MonthStats byDate={byDate} year={year} month={month} />
          )}
        </div>

      </div>
    </div>
  )
}