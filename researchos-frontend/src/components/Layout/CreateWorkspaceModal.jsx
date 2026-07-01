/**
 * CreateWorkspaceModal.jsx
 * Location: src/components/Layout/CreateWorkspaceModal.jsx
 *
 * Fixed: was 100% hardcoded dark-only colors (#111113, rgba(255,255,255,...)).
 * Now uses CSS variables so it works in light AND dark mode.
 */

import { useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'

export function CreateWorkspaceModal({ open, onClose }) {
  const { createWorkspace, selectWorkspace, workspaces } = useWorkspace()
  const [name,   setName]   = useState('')
  const [topic,  setTopic]  = useState('')
  const [desc,   setDesc]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !topic.trim()) { setError('Name and topic are required'); return }
    setSaving(true); setError('')
    try {
      const wid = await createWorkspace(name.trim(), topic.trim(), desc.trim())
      const fresh = [...workspaces].find(w => w.id === wid) ?? { id: wid, name: name.trim(), topic: topic.trim() }
      selectWorkspace(fresh)
      setName(''); setTopic(''); setDesc('')
      onClose()
    } catch (err) {
      setError(err.message ?? 'Failed to create workspace')
    }
    setSaving(false)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px,96vw)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '1.5rem',
          boxShadow: 'var(--shadow-lg, 0 25px 60px rgba(0,0,0,0.35))',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', margin: 0 }}>
            New Workspace
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit}>

          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Workspace name *
            </label>
            <input
              className="auth-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. AI Research Q3"
              autoFocus
            />
          </div>

          {/* Topic */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Research topic *
            </label>
            <input
              className="auth-input"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. artificial intelligence"
            />
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, margin: '4px 0 0' }}>
              Used to auto-fill research and news searches from this workspace
            </p>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Description <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              className="auth-input"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Notes about this workspace"
            />
          </div>

          {/* Error */}
          {error && (
            <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 12, margin: '0 0 12px' }}>
              {error}
            </p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 600,
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}