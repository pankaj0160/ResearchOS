import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth }      from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'

import { API_BASE_URL } from '../services/config.js'
const BASE = API_BASE_URL

export default function WorkspacePage() {
  const { id }                                     = useParams()
  const navigate                                   = useNavigate()
  const { getToken }                               = useAuth()
  const { workspaces, selectWorkspace, deleteWorkspace } = useWorkspace()
  const [workspace,  setWorkspace]  = useState(null)
  const [runs,       setRuns]       = useState([])
  const [sessions,   setSessions]   = useState([])
  const [newsTopics, setNewsTopics] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [deleting,   setDeleting]   = useState(false)

  useEffect(() => {
    const headers = { Authorization: `Bearer ${getToken()}` }

    // Resolve workspace from context (avoids extra API call)
    const ws = workspaces.find(w => String(w.id) === String(id))
    if (ws) setWorkspace(ws)

    // Fetch all 3 feature datasets in parallel
    Promise.all([
      fetch(`${BASE}/api/history`,      { headers }).then(r => r.json()),
      fetch(`${BASE}/api/rag/sessions`,  { headers }).then(r => r.json()),
      fetch(`${BASE}/api/news/tracked`,  { headers }).then(r => r.json()),
    ]).then(([histData, ragData, newsData]) => {
      // Filter each list by workspace_id matching this page's :id
      setRuns(
        (histData.runs ?? []).filter(r => String(r.workspace_id) === String(id))
      )
      setSessions(
        (ragData.sessions ?? []).filter(s => String(s.workspace_id) === String(id))
      )
      setNewsTopics(
        (newsData.topics ?? []).filter(t => String(t.workspace_id) === String(id))
      )
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id, getToken, workspaces])

  const handleDelete = async () => {
    if (!confirm(`Delete workspace "${workspace?.name}"? This won't delete the runs or sessions inside.`)) return
    setDeleting(true)
    await deleteWorkspace(Number(id))
    navigate('/')
  }

  if (loading) return (
    <div style={{ padding: '2rem', color: '#a1a1aa' }}>Loading workspace…</div>
  )

  if (!workspace) return (
    <div style={{ padding: '2rem' }}>
      <p style={{ color: '#f87171', marginBottom: 12 }}>Workspace not found.</p>
      <Link to="/" style={{ color: '#818cf8' }}>← Go home</Link>
    </div>
  )

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#818cf8', marginBottom: 6 }}>Workspace</p>
          <h1 style={{ fontSize: 'clamp(1.4rem,4vw,2rem)', fontWeight: 800, letterSpacing: '-.03em', marginBottom: 4 }}>{workspace.name}</h1>
          <p style={{ color: '#a1a1aa', fontSize: 13 }}>Topic: {workspace.topic}{workspace.description && ` · ${workspace.description}`}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => selectWorkspace(workspace)}
            style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: '#818cf8' }}
          >Set active</button>
          <button
            onClick={handleDelete} disabled={deleting}
            style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#f87171' }}
          >{deleting ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10, marginBottom: '1.5rem' }}>
        {[
          { label: 'Research runs', value: runs.length,       color: '#818cf8' },
          { label: 'PDF sessions',  value: sessions.length,   color: '#2dd4bf' },
          { label: 'News topics',   value: newsTopics.length, color: '#fbbf24' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '1rem' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#71717a', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Quick actions ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '2rem' }}>
        <button
          onClick={() => navigate(`/research?topic=${encodeURIComponent(workspace.topic)}`)}
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: '#818cf8' }}
        >🔬 Research this topic</button>
        <button
          onClick={() => navigate(`/news?topic=${encodeURIComponent(workspace.topic)}`)}
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)', borderRadius: 8, color: '#2dd4bf' }}
        >📰 Latest news on this topic</button>
        <button
          onClick={() => navigate('/pdf-chat')}
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8, color: '#c084fc' }}
        >📄 Upload PDF</button>
      </div>

      {/* ── Research Runs ── */}
      <Section title="Research Runs" color="#818cf8" count={runs.length}
        emptyMsg="No research runs yet. Click 'Research this topic' above.">
        {runs.map(r => (
          <ContentRow
            key={r.id}
            icon="🔬"
            title={r.topic}
            meta={[
              r.word_count ? `${r.word_count.toLocaleString()} words` : null,
              r.score ? `score ${r.score}/10` : null,
              r.created_at ? new Date(r.created_at * 1000).toLocaleDateString() : null,
            ].filter(Boolean).join(' · ')}
            onClick={() => navigate(`/research?run_id=${r.id}`)}
          />
        ))}
      </Section>

      {/* ── PDF Sessions ── */}
      <Section title="PDF Documents" color="#2dd4bf" count={sessions.length}
        emptyMsg="No PDFs yet. Upload a PDF from the PDF Chat page.">
        {sessions.map(s => (
          <ContentRow
            key={s.session_id ?? s.id}
            icon={s.source_type === 'research_run' ? '🔬' : s.source_type === 'text_ingest' ? '📝' : '📄'}
            title={s.filename}
            meta={[
              s.source_type && s.source_type !== 'pdf' ? s.source_type.replace('_', ' ') : null,
              s.chunk_count ? `${s.chunk_count} chunks` : null,
            ].filter(Boolean).join(' · ')}
            onClick={() => navigate(`/pdf-chat?session=${s.session_id ?? s.id}`)}
          />
        ))}
      </Section>

      {/* ── Tracked News Topics ── */}
      <Section title="Tracked News Topics" color="#fbbf24" count={newsTopics.length}
        emptyMsg="No tracked topics. Go to News and click 'Track this topic'.">
        {newsTopics.map(t => (
          <ContentRow
            key={t.id}
            icon="📰"
            title={t.topic}
            meta={t.category}
            onClick={() => navigate(`/news?topic=${encodeURIComponent(t.topic)}&category=${t.category}`)}
          />
        ))}
      </Section>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, color, count, emptyMsg, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
        <span style={{ fontSize: 11, background: `${color}20`, color, padding: '1px 8px', borderRadius: 999, fontWeight: 500 }}>{count}</span>
      </h3>
      {count === 0 ? (
        <p style={{ fontSize: 13, color: '#52525b', padding: '12px 0' }}>{emptyMsg}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
      )}
    </div>
  )
}

function ContentRow({ icon, title, meta, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        cursor: 'pointer', transition: 'background .12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#fafafa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {meta && <div style={{ fontSize: 11, color: '#52525b', marginTop: 2 }}>{meta}</div>}
      </div>
      <span style={{ fontSize: 12, color: '#52525b' }}>→</span>
    </div>
  )
}