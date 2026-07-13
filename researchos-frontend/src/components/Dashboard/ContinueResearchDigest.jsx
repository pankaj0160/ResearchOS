/**
 * ContinueResearchDigest.jsx
 * Location: src/components/Dashboard/ContinueResearchDigest.jsx
 *
 * "Continue your research" — cross-references the user's research History
 * against fresh News search results server-side (see
 * GET /api/news/continue-research in routers/news_router.py) and surfaces
 * only topics where genuinely new coverage exists since the research ran.
 *
 * This is the one feature that ties Research and News together instead of
 * leaving them as two disconnected modules that happen to share a nav bar.
 */
import { memo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { newsApi } from '../../services/newsApi'

function timeAgo(daysAgo) {
  if (daysAgo <= 1) return 'yesterday'
  if (daysAgo < 7) return `${daysAgo} days ago`
  const weeks = Math.round(daysAgo / 7)
  return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
}

function ContinueResearchDigest() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: false, digest: [] })

  useEffect(() => {
    let cancelled = false
    newsApi.continueResearch(5).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setState({ loading: false, error: true, digest: [] })
        return
      }
      setState({ loading: false, error: false, digest: res.data?.digest || [] })
    })
    return () => { cancelled = true }
  }, [])

  // Nothing to show and nothing wrong — don't take up space with an empty card.
  if (!state.loading && !state.error && state.digest.length === 0) return null
  if (state.error) return null

  return (
    <section style={{
      borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)',
      boxShadow: 'var(--shadow-sm)', padding: '1.25rem', marginBottom: '1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16.5, color: 'var(--text-primary)', margin: 0 }}>
            Continue your research
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            New coverage on topics you've already researched.
          </p>
        </div>
        <span style={{
          fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--agent-writer)', fontFamily: 'var(--font-mono)',
          border: '1px solid color-mix(in srgb, var(--agent-writer) 35%, transparent)',
          background: 'color-mix(in srgb, var(--agent-writer) 10%, transparent)',
          borderRadius: 99, padding: '3px 10px',
        }}>
          Live
        </span>
      </div>

      {state.loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ height: 64, borderRadius: 10, background: 'var(--bg-inset)', animation: 'pulse-slow 1.6s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.digest.map((item) => (
            <button
              key={item.run_id}
              onClick={() => navigate(`/news?topic=${encodeURIComponent(item.topic)}`)}
              className="continue-research-item"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-inset)',
                padding: '12px 14px', cursor: 'pointer', width: '100%',
              }}
            >
              <span style={{
                flexShrink: 0, width: 34, height: 34, borderRadius: 8,
                background: 'color-mix(in srgb, var(--agent-writer) 14%, transparent)',
                color: 'var(--agent-writer)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)',
              }}>
                {item.new_article_count}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {item.topic}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Researched {timeAgo(item.days_ago)} · {item.new_article_count} new article{item.new_article_count === 1 ? '' : 's'}
                </span>
              </span>
              <span style={{ flexShrink: 0, color: 'var(--text-faint)', fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default memo(ContinueResearchDigest)