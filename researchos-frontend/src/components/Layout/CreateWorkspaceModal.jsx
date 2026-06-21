import { useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'

export function CreateWorkspaceModal({ open, onClose }) {
  const { createWorkspace, selectWorkspace, workspaces } = useWorkspace()
  const [name,    setName]    = useState('')
  const [topic,   setTopic]   = useState('')
  const [desc,    setDesc]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !topic.trim()) { setError('Name and topic are required'); return }
    setSaving(true); setError('')
    try {
      const wid = await createWorkspace(name.trim(), topic.trim(), desc.trim())
      // auto-select the new workspace
      const fresh = [...workspaces].find(w => w.id === wid) ?? { id: wid, name: name.trim(), topic: topic.trim() }
      selectWorkspace(fresh)
      setName(''); setTopic(''); setDesc('')
      onClose()
    } catch (err) {
      setError(err.message ?? 'Failed to create workspace')
    }
    setSaving(false)
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', fontSize: 14,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#fafafa', fontFamily: 'inherit', outline: 'none',
  }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#a1a1aa', marginBottom: 6 }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(480px,96vw)', background: '#111113',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
        padding: '1.5rem', boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>New Workspace</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Workspace name *</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. AI Research Q3" style={inputStyle} autoFocus
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Research topic *</label>
            <input
              value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. artificial intelligence" style={inputStyle}
            />
            <p style={{ fontSize: 11, color: '#52525b', marginTop: 4 }}>
              Used to auto-fill research and news searches from this workspace
            </p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Description (optional)</label>
            <input
              value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Notes about this workspace" style={inputStyle}
            />
          </div>

          {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, color: '#a1a1aa', cursor: 'pointer',
            }}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600,
              background: '#6366f1', border: 'none',
              borderRadius: 8, color: '#fff', cursor: 'pointer',
              opacity: saving ? 0.7 : 1,
            }}>{saving ? 'Creating…' : 'Create workspace'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}