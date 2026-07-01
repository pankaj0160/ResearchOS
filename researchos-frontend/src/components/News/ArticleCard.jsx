/**
 * ArticleCard.jsx
 * Location: src/components/News/ArticleCard.jsx
 *
 * Premium article card with:
 *  - Source favicon + domain badge
 *  - Relevance score bar
 *  - Published date
 *  - "Research this" quick action
 *  - CSS vars (works in light + dark mode)
 */

import { useNavigate } from 'react-router-dom'

function formatDate(raw) {
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  } catch { return raw }
}

export function ArticleCard({ article, index }) {
  const navigate      = useNavigate()
  const domain        = article.source || ''
  const faviconUrl    = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
    : null
  const relevancePct  = Math.min(100, Math.round((article.score ?? 0) * 100))
  const scoreColor    = relevancePct >= 70 ? 'var(--accent)' : relevancePct >= 40 ? '#F59E0B' : 'var(--text-faint)'

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display:        'block',
        textDecoration: 'none',
        padding:        '0.875rem 1rem',
        borderBottom:   '1px solid var(--border)',
        transition:     'background .1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ display: 'flex', gap: 10 }}>

        {/* Index number */}
        <div style={{
          width:          20,
          height:         20,
          borderRadius:   '50%',
          background:     'var(--accent-dim)',
          color:          'var(--accent)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize:       10,
          fontWeight:     800,
          flexShrink:     0,
          marginTop:      2,
          fontFamily:     'var(--font-mono)',
        }}>
          {index + 1}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Source + date row */}
          <div style={{
            display:    'flex',
            alignItems: 'center',
            gap:        8,
            marginBottom: 4,
            flexWrap:   'wrap',
          }}>
            {/* Source badge */}
            <span style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          4,
              padding:      '2px 7px',
              background:   'var(--bg-base)',
              border:       '1px solid var(--border)',
              borderRadius: 99,
              fontSize:     10,
              fontWeight:   600,
              color:        'var(--text-muted)',
              flexShrink:   0,
            }}>
              {faviconUrl && (
                <img
                  src={faviconUrl}
                  alt=""
                  width={10}
                  height={10}
                  style={{ borderRadius: 2 }}
                  onError={e => { e.target.style.display = 'none' }}
                />
              )}
              {domain}
            </span>

            {/* Date */}
            {article.published_date && (
              <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                {formatDate(article.published_date)}
              </span>
            )}
          </div>

          {/* Title */}
          <div style={{
            fontSize:    13.5,
            fontWeight:  600,
            color:       'var(--text-primary)',
            lineHeight:  1.45,
            marginBottom: 6,
            display:     '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow:    'hidden',
          }}>
            {article.title}
          </div>

          {/* Snippet */}
          {article.snippet && (
            <div style={{
              fontSize:  12.5,
              color:     'var(--text-muted)',
              lineHeight: 1.55,
              marginBottom: 8,
              display:   '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow:  'hidden',
            }}>
              {article.snippet}
            </div>
          )}

          {/* Relevance + actions row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

            {/* Relevance score bar */}
            {article.score > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 60, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${relevancePct}%`, background: scoreColor, borderRadius: 2, transition: 'width .3s' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                  {relevancePct}% relevant
                </span>
              </div>
            )}

            {/* Research this topic quick action */}
            <button
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                navigate(`/research?topic=${encodeURIComponent(article.title)}`)
              }}
              style={{
                padding:      '2px 8px',
                background:   'var(--accent-dim)',
                border:       '1px solid var(--accent-border)',
                borderRadius: 6,
                color:        'var(--accent)',
                fontSize:     10,
                fontWeight:   600,
                cursor:       'pointer',
                transition:   'background .1s',
                marginLeft:   'auto',
                fontFamily:   'inherit',
                flexShrink:   0,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)' && (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent-dim)'; e.currentTarget.style.color = 'var(--accent)' }}
            >
              🔬 Research →
            </button>
          </div>
        </div>
      </div>
    </a>
  )
}