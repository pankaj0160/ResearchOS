import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeProvider'
import { CommandPalette } from './CommandPalette'   // NEW
import { WorkspaceSwitcher }      from './WorkspaceSwitcher'
import { CreateWorkspaceModal }   from './CreateWorkspaceModal'
import { searchApi }              from '../../services/searchApi'

const NAV = [
  {
    section: 'Workspace',
    items: [
      { to: '/dashboard', icon: HomeIcon,   label: 'Dashboard' },
      { to: '/research',  icon: SearchIcon, label: 'Research'  },
      { to: '/pdf-chat',  icon: FileIcon,   label: 'PDF Chat'  },
      { to: '/news',      icon: NewsIcon,   label: 'News'      },
    ],
  },
]

export default function AppShell() {
  const { user, logout }        = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate                = useNavigate()
  const [collapsed, setCollapsed]       = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [paletteOpen,  setPaletteOpen]  = useState(false)  // NEW
  const [createWsOpen, setCreateWsOpen] = useState(false)
  const userMenuRef = useRef(null)

  // ── History search ────────────────────────────────────────────────────────
  const [histQuery,   setHistQuery]   = useState('')
  const [histResults, setHistResults] = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (histQuery.length < 2) { setHistResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setHistLoading(true)
      try {
        const data = await searchApi.history(histQuery)
        setHistResults(data.results ?? [])
      } catch (e) { console.error(e) }
      setHistLoading(false)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [histQuery])

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  const text      = isDark ? 'rgba(255,255,255,.85)' : 'rgba(15,15,25,.85)'
  const textMuted = isDark ? 'rgba(255,255,255,.45)' : 'rgba(15,15,25,.45)'
  const border    = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.09)'
  const surface   = isDark ? '#0f0f19'               : '#ffffff'
  const hoverBg   = isDark ? 'rgba(139,92,246,.10)'  : 'rgba(99,102,241,.08)'
  const chevronBg = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)'
  const chevronFg = isDark ? 'rgba(255,255,255,.7)'  : 'rgba(15,15,25,.7)'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100vh',
        overflow: 'hidden',
        background: isDark ? '#07070f' : '#f4f4f8',
      }}
    >

      {/* ══════════════════════════════════════════
          DESKTOP SIDEBAR
          Hidden on mobile via .app-shell-sidebar
          in mobile-responsive.css
      ══════════════════════════════════════════ */}
      <aside
        className="app-shell-sidebar"
        style={{
          width: collapsed ? '72px' : '256px',
          minWidth: collapsed ? '72px' : '256px',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: surface,
          borderRight: `1px solid ${border}`,
          transition: 'width .25s ease, min-width .25s ease',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 10,
        }}
      >

        {/* ── Logo row ── */}
        <div
          style={{
            padding: '0 12px',
            borderBottom: `1px solid ${border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '64px',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <Link
            to="/dashboard"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              textDecoration: 'none', overflow: 'hidden', minWidth: 0,
            }}
          >
            <div
              style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#ec4899 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 18px rgba(139,92,246,.35)', flexShrink: 0,
              }}
            >
              <span style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>R</span>
            </div>
            <span
              style={{
                fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-0.04em',
                ...(isDark
                  ? { background: 'linear-gradient(135deg,#ffffff,#d8b4fe)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
                  : { color: '#111827' }),
                whiteSpace: 'nowrap',
                opacity: collapsed ? 0 : 1,
                width: collapsed ? 0 : 'auto',
                overflow: 'hidden',
              }}
            >
              ResearchOS
            </span>
          </Link>

          <button
            onClick={() => setCollapsed(v => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: '32px', height: '32px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', border: 'none', borderRadius: '8px',
              cursor: 'pointer', flexShrink: 0, background: chevronBg, color: chevronFg,
              transition: 'background .15s, color .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,.15)'; e.currentTarget.style.color = '#8b5cf6' }}
            onMouseLeave={e => { e.currentTarget.style.background = chevronBg; e.currentTarget.style.color = chevronFg }}
          >
            <ChevronIcon flipped={collapsed} />
          </button>
        </div>

        {/* ── Navigation ── */}
        <nav
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '16px 8px', overflowY: 'auto', overflowX: 'hidden',
          }}
        >

          <button
            onClick={() => setPaletteOpen(true)}
            title="Search (Ctrl+K)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: 'calc(100% - 24px)',
              margin: '8px 12px 14px',
              padding: '8px 12px',
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(2, 0, 0, 0.04)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
              borderRadius: 10,
              cursor: 'pointer',
              color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0, 0, 0, 0.4)',
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          >
            {collapsed ? (
              '⌕'
            ) : (
              <>
                <span style={{ fontSize: 16 }}>⌕</span>
                <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
                <kbd
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
                    borderRadius: 4,
                  }}
                >
                  Ctrl+K
                </kbd>
              </>
            )}
          </button>

          {/* NEW: WorkspaceSwitcher */}
          <WorkspaceSwitcher
            collapsed={collapsed}
            onOpenCreate={() => setCreateWsOpen(true)}
          />  

          {/* ── History search ── */}
          {!collapsed && (
            <div style={{ padding: '4px 12px 8px' }}>
              <input
                value={histQuery}
                onChange={e => setHistQuery(e.target.value)}
                placeholder="Search history…"
                style={{
                  width: '100%', padding: '7px 10px', fontSize: 12,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
                  borderRadius: 8,
                  color: isDark ? '#fafafa' : '#111827',
                  fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {histLoading && (
                <p style={{ fontSize: 11, color: textMuted, margin: '4px 0 0' }}>Searching…</p>
              )}
              {histQuery.length >= 2 && !histLoading && histResults.length === 0 && (
                <p style={{ fontSize: 11, color: textMuted, margin: '4px 0 0' }}>
                  No results for "{histQuery}"
                </p>
              )}
            </div>
          )}

          {/* ── History search results ── */}
          {!collapsed && histQuery.length >= 2 && histResults.length > 0 && (
            <div style={{ padding: '0 8px 8px' }}>
              {histResults.map(run => (
                <button
                  key={run.id}
                  onClick={() => navigate(`/research?run_id=${run.id}`)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 10px', borderRadius: 8, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    color: text, fontSize: 12,
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = hoverBg }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.topic}
                  </div>
                  {run.score != null && (
                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>
                      Score {run.score}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {NAV.map(group => (
            <div key={group.section}>
              {!collapsed && (
                <div style={{
                  padding: '0 12px', marginBottom: '6px', fontSize: '.69rem',
                  textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 700,
                  color: textMuted, whiteSpace: 'nowrap',
                }}>
                  {group.section}
                </div>
              )}
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => `sidebar-nav-item${isActive ? ' sidebar-nav-item--active' : ''}`}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center',
                    gap: '18px', minHeight: '62px',
                    padding: collapsed ? '0' : '0 18px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    marginBottom: '8px', borderRadius: '18px',
                    textDecoration: 'none',
                    color: isActive ? '#fff' : text,
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(9,123,26,0.75), rgba(139,92,246,.65))'
                      : 'transparent',
                    border: isActive ? '1px solid rgba(139,92,246,.35)' : '1px solid transparent',
                    boxShadow: isActive ? '0 10px 30px rgba(99,102,241,.25)' : 'none',
                    transition: 'all .22s ease',
                  })}
                  onMouseEnter={e => {
                    if (!e.currentTarget.classList.contains('sidebar-nav-item--active'))
                      e.currentTarget.style.background = hoverBg
                  }}
                  onMouseLeave={e => {
                    if (!e.currentTarget.classList.contains('sidebar-nav-item--active'))
                      e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <item.icon size={18} />
                  {!collapsed && (
                    <span style={{ fontSize: '.93rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* ── Sidebar Footer: theme toggle + user menu ── */}
        <div style={{ padding: '8px', borderTop: `1px solid ${border}`, flexShrink: 0 }}>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: '100%', minHeight: '40px', borderRadius: '10px',
              display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: '10px', padding: collapsed ? '0' : '0 12px',
              border: 'none', background: 'transparent', color: text,
              cursor: 'pointer', fontSize: '.9rem', fontWeight: 500,
              transition: 'background .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = hoverBg }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            {isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
            {!collapsed && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          {/* User menu */}
          <div style={{ position: 'relative', marginTop: '4px' }} ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
              style={{
                width: '100%', minHeight: '52px', borderRadius: '12px',
                display: 'flex', alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: '10px', padding: collapsed ? '0' : '0 10px',
                border: `1px solid ${userMenuOpen ? 'rgba(139,92,246,.4)' : 'transparent'}`,
                background: userMenuOpen ? hoverBg : 'transparent',
                cursor: 'pointer', transition: 'background .15s, border-color .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = hoverBg }}
              onMouseLeave={e => { if (!userMenuOpen) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{
                width: '34px', height: '34px', borderRadius: '9px',
                background: 'linear-gradient(135deg,#06b6d4,#14b8a6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0,
              }}>
                {user?.username?.[0]?.toUpperCase() ?? 'U'}
              </div>
              {!collapsed && (
                <div style={{ overflow: 'hidden', textAlign: 'left', minWidth: 0 }}>
                  <div style={{ color: text, fontWeight: 600, fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.username ?? 'User'}
                  </div>
                  <div style={{ color: textMuted, fontSize: '.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.email ?? ''}
                  </div>
                </div>
              )}
            </button>

            {/* Dropdown */}
            {userMenuOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
                background: surface, border: `1px solid ${border}`, borderRadius: '12px',
                boxShadow: isDark ? '0 8px 32px rgba(0,0,0,.5)' : '0 8px 32px rgba(0,0,0,.12)',
                overflow: 'hidden', zIndex: 100,
                minWidth: collapsed ? '160px' : 'auto',
                ...(collapsed ? { left: '100%', bottom: 0, marginLeft: '8px', right: 'auto', width: '160px' } : {}),
              }}>
                <div style={{ padding: '4px' }}>
                  <div style={{ height: '1px', background: border, margin: '2px 0' }} />
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/profile') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px',
                      color: text, fontSize: '.9rem', fontWeight: 500,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      width: '100%', textAlign: 'left', transition: 'background .12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = hoverBg }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    ⚙ Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px',
                      color: '#f87171', fontSize: '.9rem', fontWeight: 500,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      width: '100%', textAlign: 'left', transition: 'background .12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <LogoutIcon size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MAIN CONTENT COLUMN
          Contains: mobile top bar + page content
      ══════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',   /* ← stacks top bar above main */
          overflow: 'hidden',
          minWidth: 0,
        }}
      >

        {/* ── Mobile Top Bar ──────────────────────
            Visible only on mobile (≤768px).
            CSS in mobile-responsive.css shows it.
        ─────────────────────────────────────────── */}
        <div className="mobile-top-bar">
          <Link to="/dashboard" className="mobile-top-bar-logo">
            <div className="mobile-top-bar-logo-mark">R</div>
            <span className="mobile-top-bar-logo-text">ResearchOS</span>
          </Link>

          <div className="mobile-top-bar-actions">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                width: '36px', height: '36px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px',
                transition: 'background .15s, color .15s',
              }}
            >
              {isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
            </button>

            {/* Sign out */}
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              style={{
                width: '36px', height: '36px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px',
                transition: 'background .15s',
              }}
            >
              <LogoutIcon size={16} />
            </button>
          </div>
        </div>

        {/* ── Page content ── */}
        <main
          className="app-shell-main"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '32px 40px',
            minWidth: 0,
          }}
        >
          <Outlet />
        </main>

      </div>

      {/* ══════════════════════════════════════════
          MOBILE BOTTOM NAV
          Visible only on mobile (≤768px).
          CSS in mobile-responsive.css shows it.
      ══════════════════════════════════════════ */}
      <nav className="mobile-bottom-nav" aria-label="Main navigation">
        {NAV[0].items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `mobile-bottom-nav-item${isActive ? ' mobile-bottom-nav-item--active' : ''}`
            }
          >
            <item.icon size={22} />
            <span className="mobile-bottom-nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />

      {/* NEW: CreateWorkspaceModal */}
      <CreateWorkspaceModal
        open={createWsOpen}
        onClose={() => setCreateWsOpen(false)}
      />

    </div>
  )
}

/* ══════════════════════════════════════════════════════
   ICONS
══════════════════════════════════════════════════════ */

function HomeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function SearchIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function FileIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}

function NewsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>
    </svg>
  )
}

function SunIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1"  x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22"   x2="5.64" y2="5.64"  /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1"    y1="12"     x2="3"    y2="12"    /><line x1="21"    y1="12"    x2="23"    y2="12"   />
      <line x1="4.22" y1="19.78"  x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64"  x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function LogoutIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

function ChevronIcon({ size = 16, flipped }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: flipped ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
    >
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}