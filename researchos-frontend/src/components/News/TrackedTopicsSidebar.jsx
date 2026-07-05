import { useEffect, useState } from 'react'
import { newsApi } from '../../services/newsApi'

export function TrackedTopicsSidebar({ onSelectTopic }) {
  const [topics,   setTopics]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [removing, setRemoving] = useState(null)  // topic id being removed

  const load = () => {
    newsApi.getTracked()
      .then(d => { setTopics(d.topics ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleRemove = async (e, id) => {
    e.stopPropagation()  // don't trigger the row click
    setRemoving(id)
    await newsApi.untrackTopic(id).catch(() => {})
    setTopics(prev => prev.filter(t => t.id !== id))
    setRemoving(null)
  }

  return (
    <aside style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 14, padding: '1rem',
      minWidth: 0,
    }}>
      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--agent-writer)', marginBottom: 10 }}>
        Tracked Topics
      </p>

      {loading && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
      )}

      {!loading && topics.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          No tracked topics yet. Search for a topic and click "📌 Track this topic".
        </p>
      )}

      {topics.map(t => (
        <div
          key={t.id}
          onClick={() => onSelectTopic(t.topic, t.category)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 0', cursor: 'pointer',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 14, flexShrink: 0 }}>📰</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.topic}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{t.category}</div>
          </div>
          <button
            onClick={(e) => handleRemove(e, t.id)}
            disabled={removing === t.id}
            title="Untrack"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 14, flexShrink: 0, padding: '2px',
              opacity: removing === t.id ? 0.4 : 1,
            }}
          >✕</button>
        </div>
      ))}
    </aside>
  )
}