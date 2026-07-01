/**
 * MiniHistoryStrip.jsx
 * Location: src/components/History/MiniHistoryStrip.jsx
 *
 * Bug fixed: was reading d[feature] from /api/history/unified
 * but that endpoint returns { items: [...] } — d[feature] was always undefined.
 *
 * Fix: use /api/history/recent which returns { research: [], pdf: [], news: [] }
 * This matches exactly what MiniHistoryStrip needs per feature.
 *
 * Also fixed: inline styles now use CSS vars so it works in light + dark mode.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../services/apiClient'

const FEATURE_CONFIG = {
  research: {
    label:    'Recent Research',
    color:    'var(--accent)',
    getTitle: r => r.title || r.topic || 'Untitled',
    getUrl:   r => `/research?run_id=${r.id}`,
    getMeta:  r => r.score ? `Score ${r.score}/10` : r.word_count ? `${r.word_count}w` : '',
  },
  pdf: {
    label:    'Recent PDFs',
    color:    '#8B5CF6',
    getTitle: s => s.filename || s.title || 'Untitled',
    getUrl:   s => `/pdf-chat?session=${s.id || s.session_id}`,
    getMeta:  s => s.page_count ? `${s.page_count} pages` : '',
  },
  news: {
    label:    'Tracked Topics',
    color:    '#F59E0B',
    getTitle: t => t.title || t.topic || 'Untitled',
    getUrl:   t => `/news?topic=${encodeURIComponent(t.title || t.topic || '')}`,
    getMeta:  t => t.category || '',
  },
}

export const MiniHistoryStrip = React.memo(function MiniHistoryStrip({ feature }) {
  const [items,   setItems]   = useState([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const cfg      = FEATURE_CONFIG[feature]

  const load = useCallback(async () => {
    if (items.length) return   // already loaded — no refetch
    setLoading(true)
    try {
      // /api/history/recent returns { research: [], pdf: [], news: [] }
      const res  = await apiClient.get('/api/history/recent')
      const data = res.data || {}
      // Map feature key: 'pdf' stays 'pdf', others match directly
      setItems(data[feature] || [])
    } catch {
      /* silent — strip is non-critical */
    } finally {
      setLoading(false)
    }
  }, [feature, items.length])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  if (!cfg) return null

  return (
    <div style={{
      background:   'var(--bg-card)',
      border:       '1px solid var(--border)',
      borderRadius: 12,
      overflow:     'hidden',
    }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:           '100%',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          padding:         '10px 14px',
          background:      'transparent',
          border:          'none',
          cursor:          'pointer',
          color:           cfg.color,
          fontSize:        12,
          fontWeight:      700,
          textTransform:   'uppercase',
          letterSpacing:   '0.09em',
          fontFamily:      'var(--font-mono)',
        }}
      >
        <span>{cfg.label}</span>
        <span style={{
          fontSize:   10,
          opacity:    0.7,
          transform:  open ? 'rotate(180deg)' : 'none',
          transition: 'transform .2s',
          display:    'inline-block',
        }}>▾</span>
      </button>

      {/* Collapsible content */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border)' }}>

          {/* Loading state */}
          {loading && (
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 12, width: i === 0 ? '80%' : i === 1 ? '60%' : '70%', borderRadius: 4 }} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>
              Nothing here yet
            </div>
          )}

          {/* Items */}
          {!loading && items.map((item, i) => (
            <div
              key={item.id || i}
              onClick={() => navigate(cfg.getUrl(item))}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          8,
                padding:      '8px 14px',
                borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
                cursor:       'pointer',
                transition:   'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize:     13,
                  fontWeight:   500,
                  color:        'var(--text-primary)',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}>
                  {cfg.getTitle(item)}
                </div>
                {cfg.getMeta(item) && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
                    {cfg.getMeta(item)}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>→</span>
            </div>
          ))}

          {/* View all link */}
          <div
            onClick={() => navigate(`/history`)}
            style={{
              padding:    '9px 14px',
              fontSize:   12,
              fontWeight: 700,
              color:      cfg.color,
              cursor:     'pointer',
              textAlign:  'center',
              borderTop:  items.length > 0 ? '1px solid var(--border)' : 'none',
              transition: 'opacity .1s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            View all history →
          </div>
        </div>
      )}
    </div>
  )
})