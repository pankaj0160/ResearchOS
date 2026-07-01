/**
 * WorkspacePage.jsx - Production workspace management page
 * Location: src/pages/WorkspacePage.jsx
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../services/apiClient'
import { useWorkspace } from '../context/WorkspaceContext'
import { useAuth } from '../context/AuthContext'

// ── Icons ─────────────────────────────────────────────────────────────────────
const PlusIcon    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const FolderIcon  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
const TrashIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
const SearchIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
const ArrowIcon   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
const NewsIcon    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/></svg>

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Create Workspace Modal ────────────────────────────────────────────────────
function CreateModal({ onClose, onCreate }) {
  const [name, setName]   = useState('')
  const [topic, setTopic] = useState('')
  const [desc, setDesc]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!topic.trim()) { setError('Topic is required'); return }
    setLoading(true)
    try {
      await onCreate(name.trim(), topic.trim(), desc.trim())
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to create workspace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 440 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '1.5rem' }}>
          New Workspace
        </h2>

        {error && (
          <div style={{ padding: '0.6rem 0.85rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Workspace Name *</label>
            <input
              className="auth-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Climate Change Research"
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Topic *</label>
            <input
              className="auth-input"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. climate change, carbon emissions"
            />
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Used for auto-search in Research and News features</p>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Description <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional)</span></label>
            <input
              className="auth-input"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Brief description of this workspace"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
          <button className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={loading}
            style={{ flex: 2, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Creating…' : 'Create Workspace'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function WorkspaceSkeleton() {
  return (
    <div className="workspace-grid">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="workspace-card" style={{ cursor: 'default', pointerEvents: 'none' }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 16, width: '70%', marginTop: 4 }} />
          <div className="skeleton" style={{ height: 12, width: '50%' }} />
          <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border)', marginTop: 'auto', display: 'flex', gap: 8 }}>
            <div className="skeleton" style={{ height: 10, width: '60%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { workspaces, loading, createWorkspace, deleteWorkspace, selectWorkspace } = useWorkspace()

  const [showCreate, setShowCreate] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [activity, setActivity]     = useState([])
  const [actLoading, setActLoading] = useState(true)

  // Load recent activity for the overview
  useEffect(() => {
    if (!user) return
    apiClient.get('/api/activity?limit=10')
      .then(res => setActivity(res.data?.events || []))
      .catch(() => {})
      .finally(() => setActLoading(false))
  }, [user])

  const handleCreate = useCallback(async (name, topic, desc) => {
    await createWorkspace(name, topic, desc)
  }, [createWorkspace])

  const handleDelete = useCallback(async (e, ws) => {
    e.stopPropagation()
    if (!confirm(`Delete "${ws.name}"? Research runs inside will not be deleted.`)) return
    setDeletingId(ws.id)
    try {
      await deleteWorkspace(ws.id)
    } finally {
      setDeletingId(null)
    }
  }, [deleteWorkspace])

  const handleSelect = useCallback((ws) => {
    selectWorkspace(ws)
    navigate(`/research?topic=${encodeURIComponent(ws.topic)}`)
  }, [selectWorkspace, navigate])

  const activityLabel = (type) => {
    const map = {
      research_run:       { icon: '🔬', label: 'Ran research' },
      research_complete:  { icon: '✅', label: 'Research done' },
      pdf_upload:         { icon: '📄', label: 'Uploaded PDF' },
      news_search:        { icon: '📰', label: 'Searched news' },
      news_summarize:     { icon: '📊', label: 'Summarized news' },
      workspace_created:  { icon: '📁', label: 'Created workspace' },
    }
    return map[type] || { icon: '⚡', label: type?.replace(/_/g, ' ') || 'Activity' }
  }

  return (
    <div className="page-container page-fade">

      {/* Header */}
      <div className="workspace-header-bar">
        <div>
          <h1 className="page-title">
            <span className="page-title-icon">📁</span>
            Workspaces
          </h1>
          <p className="page-subtitle">
            Group your research by topic. Each workspace links Research, PDF Chat, and News together.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <PlusIcon /> New Workspace
        </button>
      </div>

      {/* Workspaces grid */}
      {loading ? (
        <WorkspaceSkeleton />
      ) : workspaces.length === 0 ? (
        <div className="workspace-empty">
          <div style={{ fontSize: '3rem' }}>📁</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            No workspaces yet
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.65 }}>
            Create a workspace to group related research, PDFs, and news topics together by theme.
          </p>
          <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlusIcon /> Create your first workspace
          </button>
        </div>
      ) : (
        <div className="workspace-grid">
          {workspaces.map(ws => (
            <div
              key={ws.id}
              className="workspace-card"
              onClick={() => handleSelect(ws)}
            >
              {/* Icon */}
              <div className="workspace-card-icon">
                <FolderIcon />
              </div>

              {/* Name + topic */}
              <div className="workspace-card-name">{ws.name}</div>
              <div className="workspace-card-topic">{ws.topic}</div>
              {ws.description && (
                <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>{ws.description}</div>
              )}

              {/* Quick actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/research?topic=${encodeURIComponent(ws.topic)}`) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
                >
                  <SearchIcon /> Research
                </button>
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/news?topic=${encodeURIComponent(ws.topic)}`) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
                >
                  <NewsIcon /> News
                </button>
              </div>

              {/* Footer meta */}
              <div className="workspace-card-meta">
                <span>Created {formatDate(ws.created_at)}</span>
                <button
                  onClick={e => handleDelete(e, ws)}
                  disabled={deletingId === ws.id}
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11, padding: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-faint)'}
                >
                  <TrashIcon /> {deletingId === ws.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent activity */}
      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
          Recent Activity
        </h2>

        {actLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="skeleton" style={{ height: 12, width: '40%' }} />
                  <div className="skeleton" style={{ height: 10, width: '60%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : activity.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>No activity yet. Start by running a research or uploading a PDF.</p>
        ) : (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {activity.map((event, i) => {
              const { icon, label } = activityLabel(event.event_type)
              const payload = typeof event.payload === 'string' ? JSON.parse(event.payload || '{}') : (event.payload || {})
              const detail = payload.topic || payload.name || payload.filename || ''
              const ts = event.created_at ? new Date(event.created_at * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

              return (
                <div key={event.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem 1rem', borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 32, height: 32, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
                    {detail && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{ts}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}