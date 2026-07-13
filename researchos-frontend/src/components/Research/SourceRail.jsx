/**
 * SourceRail.jsx
 * Location: src/components/Research/SourceRail.jsx
 *
 * Live source rail — shows the actual titles/URLs the Search Agent found,
 * as soon as they're known (not after the whole run finishes), and marks
 * which one the Reader Agent actually opened.
 *
 * This is the frontend half of a full-stack change: the backend
 * (agents.py + pipeline.py) now captures Tavily's raw search results
 * before the search agent's LLM paraphrases them into a summary, and
 * emits them as a `sources` SSE event. See pipeline.py's
 * `_parse_search_sources` for the parsing side.
 */
import { memo, useState } from 'react'

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function SourceRail({ sources, readUrl, isRunning }) {
  const [expanded, setExpanded] = useState(null)

  if (!sources || sources.length === 0) {
    if (!isRunning) return null
    return (
      <section style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)', padding: '1.25rem' }}>
        <RailHeader count={0} isRunning={isRunning} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              height: 52, borderRadius: 10, background: 'var(--bg-inset)',
              border: '1px solid var(--border)', animation: 'pulse-slow 1.6s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)', padding: '1.25rem' }}>
      <RailHeader count={sources.length} isRunning={isRunning} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {sources.map((source, i) => {
          const isRead = readUrl && source.url === readUrl
          const isOpen = expanded === i
          return (
            <div
              key={source.url + i}
              className="source-rail-item"
              style={{
                borderRadius: 10,
                border: `1px solid ${isRead ? 'var(--accent-border)' : 'var(--border)'}`,
                background: isRead ? 'var(--accent-dim)' : 'var(--bg-inset)',
                overflow: 'hidden',
                animation: 'sourceRailIn 0.4s cubic-bezier(0.16,1,0.3,1) both',
                animationDelay: `${i * 60}ms`,
              }}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                  background: isRead ? 'var(--accent)' : 'var(--bg-card)',
                  border: `1px solid ${isRead ? 'var(--accent)' : 'var(--border-strong)'}`,
                  color: isRead ? '#fff' : 'var(--text-muted)',
                  fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 1,
                }}>
                  {i + 1}
                </span>

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {source.title}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {hostname(source.url)}
                    </span>
                    {isRead && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, color: 'var(--accent)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        · opened by Reader
                      </span>
                    )}
                  </span>
                </span>

                <span style={{
                  flexShrink: 0, color: 'var(--text-faint)', fontSize: 12,
                  transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s',
                  marginTop: 3,
                }}>
                  ›
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: '0 12px 12px 42px' }}>
                  {source.snippet && (
                    <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {source.snippet}
                    </p>
                  )}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}
                  >
                    Open source →
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RailHeader({ count, isRunning }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16.5, color: 'var(--text-primary)', margin: 0 }}>Sources</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
          {count > 0 ? 'Found live by the Search Agent.' : 'Waiting on the Search Agent…'}
        </p>
      </div>
      {count > 0 && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 600,
          color: 'var(--text-secondary)', background: 'var(--bg-inset)',
          border: '1px solid var(--border)', borderRadius: 99, padding: '3px 10px',
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

export default memo(SourceRail)