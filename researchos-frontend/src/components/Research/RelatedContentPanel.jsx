import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ragApi } from '../../services/ragApi'

export const RelatedContentPanel = React.memo(function RelatedContentPanel({ runId }) {

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate              = useNavigate()

  useEffect(() => {
    if (!runId) return
    setLoading(true)
    ragApi.getRelated(runId)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [runId])

  // Don't render if no runId, still loading, or no related content at all
  if (!runId || loading || !data) return null

  const hasContent =
    data.related_runs?.length ||
    data.related_rag_sessions?.length ||
    data.related_news_topics?.length

  if (!hasContent) return (
    <aside style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '1rem',
    }}>
      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#52525b', marginBottom: 8 }}>
        Related Content
      </p>
      <p style={{ fontSize: 12, color: '#52525b' }}>
        No related content found yet. Upload a PDF or track a news topic to see connections here.
      </p>
    </aside>
  )

  return (
    <aside style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '1rem',
    }}>
      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6366f1', marginBottom: 12 }}>
        Related Content
      </p>

      {data.related_runs?.length > 0 && (
        <RelatedSection label="Other research">
          {data.related_runs.map(r => (
            <RelatedItem
              key={r.id} icon="🔬" text={r.topic}
              onClick={() => navigate(`/research?run_id=${r.id}`)}
            />
          ))}
        </RelatedSection>
      )}

      {data.related_rag_sessions?.length > 0 && (
        <RelatedSection label="Related PDFs">
          {data.related_rag_sessions.map(s => (
            <RelatedItem
              key={s.session_id} icon="📄" text={s.filename}
              sub={s.source_type !== 'pdf' ? s.source_type?.replace('_', ' ') : null}
              onClick={() => navigate(`/pdf-chat?session=${s.session_id}`)}
            />
          ))}
        </RelatedSection>
      )}

      {data.related_news_topics?.length > 0 && (
        <RelatedSection label="Tracked news">
          {data.related_news_topics.map(t => (
            <RelatedItem
              key={t.id} icon="📰" text={t.topic}
              onClick={() => navigate(`/news?topic=${encodeURIComponent(t.topic)}&category=${t.category}`)}
            />
          ))}
        </RelatedSection>
      )}
    </aside>
  )
})

function RelatedSection({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#52525b', marginBottom: 6 }}>{label}</p>
      {children}
    </div>
  )
}

function RelatedItem({ icon, text, sub, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 0', cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</div>
        {sub && <div style={{ fontSize: 10, color: '#52525b' }}>{sub}</div>}
      </div>
    </div>
  )
}