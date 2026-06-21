import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth }    from '../context/AuthContext'

const BASE = import.meta.env.VITE_API_URL ?? ''
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December']

const TYPE_DOT = {
  research_run:      '#818cf8',
  pdf_upload:        '#2dd4bf',
  text_ingested:     '#4ade80',
  news_search:       '#fbbf24',
  workspace_created: '#c084fc',
}

const TYPE_META = {
  research_run:      { icon: '🔬', label: 'Research',  url: p => `/research?run_id=${p.run_id}` },
  pdf_upload:        { icon: '📄', label: 'PDF',       url: p => `/pdf-chat?session=${p.session_id}` },
  text_ingested:     { icon: '💾', label: 'Saved Doc', url: p => `/pdf-chat?session=${p.session_id}` },
  news_search:       { icon: '📰', label: 'News',      url: p => `/news?topic=${encodeURIComponent(p.topic||'')}` },
  workspace_created: { icon: '📁', label: 'Workspace', url: p => `/workspace/${p.workspace_id}` },
}

function toDateKey(ts) {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function CalendarPage() {
  const now      = new Date()
  const [year,   setYear]    = useState(now.getFullYear())
  const [month,  setMonth]   = useState(now.getMonth())
  const [events, setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)  // selected date key e.g. "2025-06-19"
  const auth = useAuth()
  const getToken = auth?.getToken ?? (() => localStorage.getItem('researchos_token') ?? '')

  const navigate     = useNavigate()

  useEffect(() => {
    fetch(`${BASE}/api/activity?limit=500`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
      .then(r => r.json())
      .then(d => { setEvents(d.events ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [getToken])

  // Group events by date key
  const byDate = useMemo(() => {
    const map = {}
    for (const ev of events) {
      const key = toDateKey(ev.created_at)
      if (!map[key]) map[key] = []
      map[key].push(ev)
    }
    return map
  }, [events])

  // Build calendar grid
  const { cells, monthLabel } = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return { cells, monthLabel: `${MONTHS[month]} ${year}` }
  }, [year, month])

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const todayKey = toDateKey(Date.now() / 1000)
  const selectedEvents = selected ? (byDate[selected] ?? []) : []

  return (
    <div style={{ minHeight: '100vh', background: '#09090b' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '2rem 2rem 1.5rem',
        background: 'linear-gradient(180deg, rgba(168,85,247,0.06) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#a855f7', marginBottom: 6 }}>ResearchOS</p>
          <h1 style={{ fontSize: 'clamp(1.5rem,4vw,2rem)', fontWeight: 800, letterSpacing: '-.04em', marginBottom: 4 }}>Activity Calendar</h1>
          <p style={{ color: '#71717a', fontSize: 13 }}>Click any day to see what you worked on</p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 2rem', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>

        {/* ── Calendar ── */}
        <div>
          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <button onClick={prevMonth} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', color: '#a1a1aa', cursor: 'pointer', fontSize: 14 }}>‹</button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-.02em' }}>{monthLabel}</p>
              <p style={{ fontSize: 11, color: '#52525b' }}>{Object.keys(byDate).filter(k => k.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)).length} active days</p>
            </div>
            <button onClick={nextMonth} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', color: '#a1a1aa', cursor: 'pointer', fontSize: 14 }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
            {DAYS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 0' }}>{d}</div>)}
          </div>

          {/* Grid cells */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#52525b', fontSize: 13 }}>Loading calendar…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} />
                const key    = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const dayEvs = byDate[key] ?? []
                const isToday = key === todayKey
                const isSel   = key === selected
                // Get unique event types for dots
                const types  = [...new Set(dayEvs.map(e => e.event_type))].slice(0, 4)

                return (
                  <div
                    key={key}
                    onClick={() => setSelected(isSel ? null : key)}
                    style={{
                      aspectRatio: '1', borderRadius: 10, padding: '6px',
                      background: isSel ? 'rgba(168,85,247,0.15)' : dayEvs.length ? 'rgba(255,255,255,0.04)' : 'transparent',
                      border: isSel ? '1px solid rgba(168,85,247,0.5)' : isToday ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                      cursor: dayEvs.length ? 'pointer' : 'default',
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      transition: 'background .12s, border-color .12s',
                    }}
                    onMouseEnter={e => { if (dayEvs.length && !isSel) e.currentTarget.style.background='rgba(255,255,255,0.07)' }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = dayEvs.length ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  >
                    <span style={{
                      fontSize: 12, fontWeight: isToday ? 800 : 500,
                      color: isToday ? '#a855f7' : dayEvs.length ? '#fafafa' : '#52525b',
                    }}>{day}</span>
                    {types.length > 0 && (
                      <div style={{ display: 'flex', gap: 2, marginTop: 'auto', flexWrap: 'wrap' }}>
                        {types.map(type => (
                          <div key={type} style={{ width: 6, height: 6, borderRadius: 3, background: TYPE_DOT[type] ?? '#71717a' }} />
                        ))}
                        {dayEvs.length > 4 && <span style={{ fontSize: 9, color: '#52525b' }}>+{dayEvs.length - 4}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, marginTop: '1.25rem', flexWrap: 'wrap' }}>
            {Object.entries(TYPE_DOT).map(([type, color]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
                <span style={{ fontSize: 11, color: '#71717a' }}>{TYPE_META[type]?.label ?? type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Day detail panel ── */}
        <div style={{ position: 'sticky', top: 20 }}>
          {!selected && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '2rem 1.25rem', textAlign: 'center' }}>
              <p style={{ fontSize: 24, marginBottom: 10 }}>👆</p>
              <p style={{ fontSize: 13, color: '#52525b', lineHeight: 1.6 }}>Click any day with activity to see what you worked on</p>
            </div>
          )}

          {selected && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>
                    {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  <p style={{ fontSize: 12, color: '#52525b', marginTop: 2 }}>{selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>

              {selectedEvents.length === 0 && (
                <div style={{ padding: '1.5rem 1.25rem', color: '#52525b', fontSize: 13, textAlign: 'center' }}>No activity this day</div>
              )}

              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                {selectedEvents.map(ev => {
                  const m = TYPE_META[ev.event_type] ?? { icon: '⚡', label: ev.event_type, url: () => '/' }
                  const p = ev.payload ?? {}
                  const title = p.topic || p.name || p.filename || p.title || ev.event_type
                  const d = typeof ev.created_at === 'string' ? new Date(ev.created_at) : new Date(ev.created_at * 1000)
                  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <div
                      key={ev.id}
                      onClick={() => navigate(m.url(p))}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      {/* Timeline dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, marginTop: 3 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 4, background: TYPE_DOT[ev.event_type] ?? '#71717a' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: TYPE_DOT[ev.event_type] ?? '#71717a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{m.icon} {m.label}</span>
                          <span style={{ fontSize: 10, color: '#52525b', marginLeft: 'auto' }}>{time}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}