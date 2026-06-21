import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useTheme } from '../../context/ThemeProvider'

export function WorkspaceSwitcher({ collapsed, onOpenCreate }) {
  const { workspaces, activeWorkspace, selectWorkspace } = useWorkspace()
  const { isDark } = useTheme()   // ← ADD THIS LINE
  const [open, setOpen] = useState(false)
  const navigate        = useNavigate()
  const menuRef         = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Collapsed sidebar: just show the icon
  if (collapsed) {
    return (
      <button
        title={activeWorkspace ? activeWorkspace.name : 'No workspace'}
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', minHeight: 40, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 18, borderRadius: 10,
        }}
      >📁</button>
    )
  }

  return (
    <div ref={menuRef} style={{ position: 'relative', margin: '8px 12px 4px' }}>

      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
          background: open ? 'rgba(99,102,241,0.1)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          border: `1px solid ${open ? 'rgba(99,102,241,0.3)' : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
          color: isDark ? '#fafafa' : '#111827', fontSize: 13, fontWeight: 500,
          transition: 'background .15s, border-color .15s',
        }}
      >
        <span>📁</span>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeWorkspace ? activeWorkspace.name : 'No workspace'}
        </span>
        <span style={{ fontSize: 10, opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: isDark ? '#18181b' : '#ffffff',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.10)'}`,
          boxShadow: isDark ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 40px rgba(0,0,0,0.12)',
          borderRadius: 12,
          overflow: 'hidden',
        }}>

          {/* Workspace list */}
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '6px 0' }}>
            {/* "None" option */}
            <div
              onClick={() => { selectWorkspace(null); setOpen(false) }}
              style={{
                padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                color: !activeWorkspace ? '#818cf8' : '#a1a1aa',
                fontWeight: !activeWorkspace ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {!activeWorkspace && <span>✓</span>}
              <span style={{ opacity: 0.5, marginLeft: !activeWorkspace ? 0 : 18 }}>None (global)</span>
            </div>

            {workspaces.map(ws => (
              <div
                key={ws.id}
                style={{
                  padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                  color: activeWorkspace?.id === ws.id ? '#818cf8' : isDark ? '#fafafa' : '#111827',
                  fontWeight: activeWorkspace?.id === ws.id ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {activeWorkspace?.id === ws.id
                  ? <span style={{ color: '#818cf8', fontSize: 11 }}>✓</span>
                  : <span style={{ width: 11 }} />}
                <span
                  style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => { selectWorkspace(ws); setOpen(false) }}
                >{ws.name}</span>
                <span
                  style={{ fontSize: 11, color: '#52525b', cursor: 'pointer' }}
                  title="Open workspace"
                  onClick={(e) => { e.stopPropagation(); navigate(`/workspace/${ws.id}`); setOpen(false) }}
                >↗</span>
              </div>
            ))}

            {workspaces.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 12, color: '#52525b' }}>
                No workspaces yet
              </div>
            )}
          </div>

          {/* Footer: create new */}
          <div style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'}`, padding: '8px 14px' }}>
            <button
              onClick={() => { setOpen(false); onOpenCreate() }}
              style={{
                width: '100%', background: 'none', border: 'none',
                color: '#818cf8', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', textAlign: 'left', padding: '4px 0',
              }}
            >
              + New workspace
            </button>
          </div>
        </div>
      )}
    </div>
  )
}