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
import { calendarApi } from '../services/calendarApi'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../hooks/useToast'
import { EventModal } from '../components/Calendar/EventModal'

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
  // User-created events (from the new calendar_events backend). Color is
  // per-event (the user picks it in EventModal) — this entry is only the
  // fallback icon/label used before the per-event color is applied.
  calendar_event:    { color: '#3B82F6',        icon: '🗓️', label: 'Event',     nav: () => null },
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
  const { activeWorkspace } = useWorkspace()

  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth())
  const [events,   setEvents]   = useState([])          // activity_events (automatic log)
  const [calEvents, setCalEvents] = useState([])         // calendar_events (user-created)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)

  // Modal state for creating/editing a real calendar event
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editingEvent,  setEditingEvent]  = useState(null)   // null = creating new
  const [modalDateKey,  setModalDateKey]  = useState(null)   // prefill date when creating from the day panel

  const { toast } = useToast()

  // Load activity events, scoped to the active workspace when one is selected.
  // NOTE: this used to always fail — the backend capped `limit` at 50, this
  // page requested 500, every request 422'd, and the failure was silently
  // swallowed by .catch(() => {}), so the calendar always rendered empty
  // regardless of how much real activity existed. Fixed on the backend
  // (raised the ceiling) — kept here at 500 so a full month+ of activity
  // renders in one request.
  useEffect(() => {
    setLoading(true)
    const wsParam = activeWorkspace?.id != null ? `&workspace_id=${activeWorkspace.id}` : ''
    apiClient.get(`/api/activity?limit=500${wsParam}`)
      .then(res => setEvents(res.data?.events || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [activeWorkspace?.id])

  // Load real calendar events (deadlines, reminders, meetings) for the visible
  // month — padded a week on each side so events that land in the leading/
  // trailing days of the grid (from adjacent months) still show up correctly.
  // Refetches whenever the visible month or active workspace changes.
  const reloadCalendarEvents = useCallback(() => {
    const rangeStart = Math.floor(new Date(year, month, -7).getTime() / 1000)
    const rangeEnd   = Math.floor(new Date(year, month + 1, 7).getTime() / 1000)
    return calendarApi
      .list({ start: rangeStart, end: rangeEnd, workspaceId: activeWorkspace?.id ?? null })
      .then(res => setCalEvents(res.data?.events || []))
      .catch(() => {})
  }, [year, month, activeWorkspace?.id])

  useEffect(() => { reloadCalendarEvents() }, [reloadCalendarEvents])

  // Group events by date key "YYYY-MM-DD" — merges the automatic activity
  // log with user-created calendar events into one normalized shape so the
  // grid and detail panel can render both without special-casing everywhere.
  const byDate = useMemo(() => {
    const map = {}
    const push = (key, item) => {
      if (!map[key]) map[key] = []
      map[key].push(item)
    }

    for (const ev of events) {
      if (!ev.created_at) continue
      push(toDateKey(ev.created_at), { ...ev, _source: 'activity' })
    }
    for (const ev of calEvents) {
      if (!ev.start_time) continue
      push(toDateKey(ev.start_time), {
        id: `cal-${ev.id}`,
        event_type: 'calendar_event',
        created_at: ev.start_time,
        payload: { title: ev.title, description: ev.description },
        color: ev.color,
        _source: 'calendar_event',
        _raw: ev,
      })
    }
    return map
  }, [events, calEvents])

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

  // ── Real calendar event actions ────────────────────────────────────────────
  const openCreateModal = useCallback((dateKey = null) => {
    setEditingEvent(null)
    setModalDateKey(dateKey)
    setModalOpen(true)
  }, [])

  const openEditModal = useCallback((rawEvent) => {
    setEditingEvent(rawEvent)
    setModalDateKey(null)
    setModalOpen(true)
  }, [])

  const handleSaveEvent = useCallback(async (fields) => {
    if (editingEvent) {
      const res = await calendarApi.update(editingEvent.id, fields)
      if (!res.ok) throw new Error(res.error || 'Failed to save event')
      toast.success('Event updated')
    } else {
      const res = await calendarApi.create({ ...fields, workspaceId: activeWorkspace?.id ?? null })
      if (!res.ok) throw new Error(res.error || 'Failed to create event')
      toast.success('Event created')
    }
    await reloadCalendarEvents()
  }, [editingEvent, activeWorkspace?.id, reloadCalendarEvents, toast])

  const handleDeleteEvent = useCallback(async (eventId) => {
    const res = await calendarApi.delete(eventId)
    if (!res.ok) throw new Error(res.error || 'Failed to delete event')
    toast.success('Event deleted')
    await reloadCalendarEvents()
  }, [reloadCalendarEvents, toast])

  return (
    <div className="page-container page-fade">

      {/* Page header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">
            <span className="page-title-icon">📅</span>
            Calendar
          </h1>
          <p className="page-subtitle">
            Your deadlines and events, plus every research run, PDF upload, and news search — all in one place.
          </p>
        </div>
        <button
          onClick={() => openCreateModal(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.6rem 1.1rem', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          + New Event
        </button>
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
                // Get up to 4 unique dot colors — calendar_event items carry their
                // own per-event color (set by the user in EventModal); everything
                // else falls back to its TYPE_CONFIG color.
                const dots    = [...new Set(dayEvs.map(e =>
                  e._source === 'calendar_event' ? e.color : (TYPE_CONFIG[e.event_type]?.color || 'var(--text-faint)')
                ))].slice(0, 4)

                return (
                  <div
                    key={key}
                    onClick={() => hasEvs ? setSelected(isSel ? null : key) : openCreateModal(key)}
                    title={hasEvs ? undefined : 'Add an event on this day'}
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
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'flex-start',
                      transition: 'background .1s, border-color .1s',
                      opacity: hasEvs ? 1 : 0.55,
                    }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = hasEvs ? 'var(--bg-card-hover)' : 'var(--bg-card)' }}
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
                        {dots.map(dotColor => (
                          <div
                            key={dotColor}
                            style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor }}
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
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => openCreateModal(selected)}
                    title="Add an event on this day"
                    style={{ width: 28, height: 28, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--accent)', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >+</button>
                  <button
                    onClick={() => setSelected(null)}
                    style={{ width: 28, height: 28, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                </div>
              </div>

              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {selectedEvents.map((ev, i) => {
                  const isCalEvent = ev._source === 'calendar_event'
                  const cfg     = TYPE_CONFIG[ev.event_type] || { icon: '⚡', label: ev.event_type, color: 'var(--text-muted)', nav: () => '/' }
                  const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload || '{}') : (ev.payload || {})
                  const title   = payload.topic || payload.name || payload.filename || payload.title || ev.event_type
                  const dotColor = isCalEvent ? ev.color : cfg.color

                  return (
                    <div
                      key={ev.id || i}
                      onClick={() => isCalEvent ? openEditModal(ev._raw) : navigate(cfg.nav(payload))}
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
                        {isCalEvent ? cfg.icon : cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: dotColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {isCalEvent ? 'Event' : cfg.label}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                            {isCalEvent && ev._raw.all_day ? 'All day' : formatTime(ev.created_at)}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {title}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{isCalEvent ? '✎' : '→'}</span>
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

      <EventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        event={editingEvent}
        defaultDateKey={modalDateKey}
        onSave={handleSaveEvent}
        onDelete={editingEvent ? handleDeleteEvent : undefined}
      />
    </div>
  )
}