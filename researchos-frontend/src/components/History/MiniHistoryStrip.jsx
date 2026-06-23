import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

import { API_BASE_URL } from '../../services/config.js'
const BASE = API_BASE_URL

const FEATURE_CONFIG = {
  research: {
    label: 'Recent research', color: '#818cf8',
    getTitle: r  => r.topic,
    getUrl:   r  => `/research?run_id=${r.id}`,
    getMeta:  r  => r.score ? `Score ${r.score}/10` : '',
  },
  pdf: {
    label: 'Recent sessions', color: '#2dd4bf',
    getTitle: s  => s.filename,
    getUrl:   s  => `/pdf-chat?session=${s.session_id}`,
    getMeta:  s  => s.chunk_count ? `${s.chunk_count} chunks` : '',
  },
  news: {
    label: 'Tracked topics', color: '#fbbf24',
    getTitle: t  => t.topic,
    getUrl:   t  => `/news?topic=${encodeURIComponent(t.topic)}&category=${t.category}`,
    getMeta:  t  => t.category,
  },
}

export function MiniHistoryStrip({ feature }) {
  const [items,    setItems]    = useState([])
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const { getToken } = useAuth()
  const navigate     = useNavigate()
  const cfg          = FEATURE_CONFIG[feature]

  useEffect(() => {
    if (!open || items.length) return  // lazy load on first open
    setLoading(true)
    fetch(`${BASE}/api/history/unified?limit=5&feature=${feature}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
      .then(r => r.json())
      .then(d => { setItems(d[feature] ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open, feature, getToken])

  if (!cfg) return null

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
          color: cfg.color, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
        }}
      >
        <span>{cfg.label}</span>
        <span style={{ fontSize: 10, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
      </button>

      {/* Expandable list */}
      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {loading && (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#52525b' }}>Loading…</div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#52525b' }}>Nothing here yet</div>
          )}
          {items.map((item, i) => (
            <div
              key={i}
              onClick={() => navigate(cfg.getUrl(item))}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#fafafa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cfg.getTitle(item)}
                </div>
                {cfg.getMeta(item) && <div style={{ fontSize: 11, color: '#52525b', marginTop: 1 }}>{cfg.getMeta(item)}</div>}
              </div>
              <span style={{ fontSize: 11, color: '#52525b' }}>→</span>
            </div>
          ))}
          {/* View all link */}
          <div
            onClick={() => navigate(`/history?tab=${feature}`)}
            style={{
              padding: '9px 14px', fontSize: 12, fontWeight: 700,
              color: cfg.color, cursor: 'pointer', textAlign: 'center',
            }}
          >View all {cfg.label} →</div>
        </div>
      )}
    </div>
  )
}