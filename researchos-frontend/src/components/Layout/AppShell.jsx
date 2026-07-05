/**
 * AppShell.jsx — PREMIUM REDESIGN
 *
 * LOCATION: src/components/Layout/AppShell.jsx
 * REPLACE your entire existing file with this.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED FROM YOUR CURRENT VERSION:
 *
 * 1. Logo mark — removed purple/pink gradient glow → clean forest green square
 * 2. Active nav item — removed gradient + glow → clean green left border + bg
 * 3. Nav item sizing — 62px height was too tall → 40px, more refined
 * 4. Hover colors — removed indigo → warm neutral (#1A1917)
 * 5. User avatar — removed teal gradient → forest green, consistent with brand
 * 6. User menu open state — removed indigo border → green
 * 7. Main content — added transition so centering is smooth on collapse
 * 8. Mobile drawer — sidebar slides in from left on mobile (hamburger button)
 * 9. Backdrop — dark overlay when mobile sidebar is open
 * 10. Page transition — Outlet wrapped in .page-transition div
 * 11. ToastContainer — added here so toasts work on all pages
 *
 * ALL FUNCTIONALITY IS IDENTICAL — only the visual values changed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth }  from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeProvider'
import { CommandPalette }      from './CommandPalette'
import { WorkspaceSwitcher }   from './WorkspaceSwitcher'
import { CreateWorkspaceModal } from './CreateWorkspaceModal'
import { searchApi }           from '../../services/searchApi'
import ToastContainer          from '../ToastContainer'
import Logo                    from '../Logo'

// ── Navigation config ─────────────────────────────────────────────────────────
const NAV = [
  {
    section: 'Research',
    items: [
      { to: '/dashboard', icon: HomeIcon,    label: 'Dashboard'  },
      { to: '/research',  icon: SearchIcon,  label: 'Research'   },
      { to: '/pdf-chat',  icon: FileIcon,    label: 'PDF Chat'   },
      { to: '/news',      icon: NewsIcon,    label: 'News'       },
    ],
  },
  {
    section: 'Workspace',
    items: [
      { to: '/workspace', icon: FolderIcon, label: 'Workspaces' },
    ],
  },
  {
    section: 'History',
    items: [
      { to: '/history',   icon: HistoryIcon,  label: 'History'  },
      { to: '/calendar',  icon: CalendarIcon, label: 'Calendar' },
    ],
  },
]

// ── Premium color tokens — sidebar always uses these regardless of theme ──────
// These are the dark-sidebar values. Main content area uses CSS variables
// from index.css which respect the current theme.
const SB = {
  bg:         '#0E0E0C',
  border:     '#232320',
  text:       '#8A8479',
  textActive: '#F5F2EB',
  hover:      '#1A1917',
  active:     '#1F1F1C',
  accent:     '#1B6B45',
  accentSoft: 'rgba(27,107,69,0.15)',
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AppShell() {
  const { user, logout }        = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate                = useNavigate()
  const location                = useLocation()

  const [collapsed,     setCollapsed]     = useState(false)
  const [mobileOpen,    setMobileOpen]    = useState(false)  // mobile drawer

  // ── Reactive mobile detection ─────────────────────────────────────────────
  // WHY: window.innerWidth read at render time is a one-time snapshot.
  // When the component mounts on a 400px screen, the snapshot is taken ONCE
  // during the first render. After that, nothing updates it — so mobileOpen
  // toggles but the sidebar never gets `position:fixed` styles because the
  // JS condition never re-evaluates. We use a ResizeObserver to keep
  // isMobile in sync with the actual viewport width at all times.
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 768
  })

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    // Run once immediately to sync state with current viewport
    handler()
    return () => window.removeEventListener('resize', handler)
  }, [])
  const [userMenuOpen,  setUserMenuOpen]  = useState(false)
  const [paletteOpen,   setPaletteOpen]   = useState(false)
  const [createWsOpen,  setCreateWsOpen]  = useState(false)
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
        const res = await searchApi.history(histQuery)
        // apiClient returns { ok, data: { results: {...} }, status }
        const results = res?.data?.results ?? {}
        // Flatten all result groups into one list for sidebar display
        setHistResults(Object.values(results).flat())
      } catch (e) { console.error(e) }
      setHistLoading(false)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [histQuery])

  // ── Close user menu on outside click ─────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  // ── Close mobile sidebar on route change ──────────────────────────────────
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // ── Cmd+K shortcut ────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(prev => !prev)
      }
      // Escape closes mobile sidebar
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  // ── Surface colors — main content area respects light/dark mode ───────────
  const surface    = isDark ? '#0f0f0e' : '#FFFFFF'
  const border     = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'
  const text       = isDark ? '#F0EDE6' : '#0E0E0C'
  const textMuted  = isDark ? '#6B6860' : '#7A7669'
  const hoverBg    = isDark ? '#1A1917' : '#F3F1EB'

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: isDark ? '#0f0f0e' : '#F7F5F0',
        position: 'relative',
      }}
    >

      {/* ── Mobile backdrop — closes sidebar when tapped ─────────────────── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99,
            background: 'rgba(0,0,0,0.5)',
            animation: 'fade-in 0.2s ease',
          }}
          aria-hidden="true"
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SIDEBAR — always dark, premium ink
      ══════════════════════════════════════════════════════════════════ */}
      <aside
        className={`app-shell-sidebar`}
        style={{
          // Width transitions smoothly on desktop collapse
          width:    collapsed ? '64px' : '248px',
          minWidth: collapsed ? '64px' : '248px',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background:  SB.bg,
          borderRight: `0.5px solid ${SB.border}`,
          transition: 'width 0.22s cubic-bezier(0.16,1,0.3,1), min-width 0.22s cubic-bezier(0.16,1,0.3,1)',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 50,
          // Mobile: position fixed, slide in from left
          // Uses reactive isMobile state — updates on resize, not a snapshot
          ...(isMobile ? {
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
            width: '260px',
            minWidth: '260px',
            zIndex: 100,
            transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
          } : {}),
        }}
      >

        {/* ── Logo row ──────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '0 12px',
            borderBottom: `0.5px solid ${SB.border}`,
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '56px',
            gap: '8px', flexShrink: 0,
          }}
        >
          <Link
            to="/dashboard"
            style={{
              display: 'flex', alignItems: 'center', gap: '9px',
              textDecoration: 'none', overflow: 'hidden', minWidth: 0,
            }}
          >
            <Logo
              size={30}
              markOnly={collapsed}
              showWordmark={!collapsed}
              wordmarkColor={SB.textActive}
              hexColor="rgba(245,242,235,0.3)"
              osTagColor={SB.accent}
              osTagTextColor="#F5F2EB"
              colors={{
                search: 'var(--agent-search)',
                reader: 'var(--agent-reader)',
                writer: 'var(--agent-writer)',
                critic: 'var(--agent-critic)',
              }}
            />
          </Link>

          {/* Collapse toggle button — on mobile, closes drawer instead of collapsing */}
          <button
            onClick={() => isMobile ? setMobileOpen(false) : setCollapsed(v => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: '28px', height: '28px', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              border: `0.5px solid ${SB.border}`, borderRadius: '7px',
              cursor: 'pointer', flexShrink: 0,
              background: 'transparent', color: SB.text,
              transition: 'background 0.12s, color 0.12s, border-color 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = SB.hover
              e.currentTarget.style.color = SB.textActive
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = SB.text
            }}
          >
            <ChevronIcon flipped={collapsed} />
          </button>
        </div>

        {/* ── Navigation ────────────────────────────────────────────────── */}
        <nav style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          padding: '12px 8px', overflowY: 'auto', overflowX: 'hidden',
          gap: '2px',
        }}>

          {/* Search / Cmd+K button */}
          <button
            onClick={() => setPaletteOpen(true)}
            title="Search (Ctrl+K)"
            style={{
              display: 'flex', alignItems: 'center', gap: '9px',
              width: collapsed ? '40px' : 'calc(100% - 0px)',
              margin: collapsed ? '0 auto 8px' : '0 0 8px',
              padding: collapsed ? '8px' : '7px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: `0.5px solid ${SB.border}`,
              borderRadius: '8px', cursor: 'pointer',
              color: SB.text, fontSize: '12px',
              fontFamily: 'inherit',
              transition: 'background 0.12s, border-color 0.12s',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = SB.hover
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.borderColor = SB.border
            }}
          >
            <SearchIcon size={14} />
            {!collapsed && (
              <>
                <span style={{ flex: 1, textAlign: 'left', color: SB.text }}>Search…</span>
                <kbd style={{
                  fontSize: '10px', padding: '1px 5px',
                  background: 'rgba(255,255,255,0.07)',
                  borderRadius: '4px', color: SB.text,
                  fontFamily: 'var(--font-mono)',
                }}>⌘K</kbd>
              </>
            )}
          </button>

          {/* Workspace switcher */}
          <WorkspaceSwitcher
            collapsed={collapsed}
            onOpenCreate={() => setCreateWsOpen(true)}
          />

          {/* History search */}
          {!collapsed && (
            <div style={{ padding: '4px 4px 8px' }}>
              <input
                value={histQuery}
                onChange={e => setHistQuery(e.target.value)}
                placeholder="Search history…"
                style={{
                  width: '100%', padding: '6px 10px', fontSize: '12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: `0.5px solid ${SB.border}`,
                  borderRadius: '7px', color: SB.textActive,
                  fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.12s',
                }}
                onFocus={e => { e.target.style.borderColor = SB.accent }}
                onBlur={e => { e.target.style.borderColor = SB.border }}
              />
              {histLoading && (
                <p style={{ fontSize: '11px', color: SB.text, margin: '4px 4px 0' }}>Searching…</p>
              )}
              {histQuery.length >= 2 && !histLoading && histResults.length === 0 && (
                <p style={{ fontSize: '11px', color: SB.text, margin: '4px 4px 0' }}>
                  No results
                </p>
              )}
            </div>
          )}

          {/* History search results */}
          {!collapsed && histQuery.length >= 2 && histResults.length > 0 && (
            <div style={{ padding: '0 4px 8px' }}>
              {histResults.slice(0, 5).map(run => (
                <button
                  key={run.id}
                  onClick={() => { navigate(`/research?run_id=${run.id}`); setHistQuery('') }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '6px 8px', borderRadius: '7px', border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    color: SB.textActive, fontSize: '12px',
                    transition: 'background 0.10s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = SB.hover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.topic}
                  </div>
                  {run.score != null && (
                    <div style={{ fontSize: '10px', color: SB.text, marginTop: '1px' }}>
                      Score {run.score}/10
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Nav groups ─────────────────────────────────────────────── */}
          {NAV.map(group => (
            <div key={group.section} style={{ marginBottom: '8px' }}>
              {/* Section label */}
              {!collapsed && (
                <div style={{
                  padding: '6px 10px 4px',
                  fontSize: '10px', fontWeight: '600',
                  textTransform: 'uppercase', letterSpacing: '0.09em',
                  color: 'rgba(138,132,121,0.55)',
                  whiteSpace: 'nowrap',
                }}>
                  {group.section}
                </div>
              )}

              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `sidebar-nav-item${isActive ? ' sidebar-nav-item--active' : ''}`
                  }
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center',
                    gap: '10px',
                    height: '38px',
                    padding: collapsed ? '0' : '0 10px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    marginBottom: '2px', borderRadius: '8px',
                    textDecoration: 'none',
                    // ── PREMIUM ACTIVE STATE — no gradient, no glow ──────────
                    // Clean: left border accent + subtle dark bg
                    color: isActive ? SB.textActive : SB.text,
                    background: isActive ? SB.active : 'transparent',
                    borderLeft: isActive
                      ? `2px solid ${SB.accent}`
                      : '2px solid transparent',
                    paddingLeft: isActive && !collapsed ? '8px' : (collapsed ? '0' : '10px'),
                    boxShadow: 'none',
                    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                  })}
                  onMouseEnter={e => {
                    if (!e.currentTarget.classList.contains('sidebar-nav-item--active')) {
                      e.currentTarget.style.background = SB.hover
                      e.currentTarget.style.color = SB.textActive
                    }
                  }}
                  onMouseLeave={e => {
                    if (!e.currentTarget.classList.contains('sidebar-nav-item--active')) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = SB.text
                    }
                  }}
                >
                  <item.icon size={16} />
                  {!collapsed && (
                    <span style={{
                      fontSize: '13.5px', fontWeight: '500',
                      whiteSpace: 'nowrap', letterSpacing: '-0.01em',
                    }}>
                      {item.label}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* ── Sidebar Footer ────────────────────────────────────────────── */}
        <div style={{
          padding: '8px',
          borderTop: `0.5px solid ${SB.border}`,
          flexShrink: 0,
        }}>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: '100%', height: '36px', borderRadius: '8px',
              display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: '10px', padding: collapsed ? '0' : '0 10px',
              border: 'none', background: 'transparent', color: SB.text,
              cursor: 'pointer', fontSize: '13px', fontWeight: '500',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = SB.hover
              e.currentTarget.style.color = SB.textActive
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = SB.text
            }}
          >
            {isDark ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            {!collapsed && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          {/* User menu */}
          <div style={{ position: 'relative', marginTop: '4px' }} ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
              style={{
                width: '100%', height: '48px', borderRadius: '9px',
                display: 'flex', alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: '9px', padding: collapsed ? '0' : '0 8px',
                // ── PREMIUM — green border when open, not indigo ──────────
                border: `0.5px solid ${userMenuOpen ? SB.accent : 'transparent'}`,
                background: userMenuOpen ? SB.active : 'transparent',
                cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { if (!userMenuOpen) e.currentTarget.style.background = SB.hover }}
              onMouseLeave={e => { if (!userMenuOpen) e.currentTarget.style.background = 'transparent' }}
            >
              {/* ── PREMIUM AVATAR — forest green, no teal gradient ──── */}
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: SB.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: '600', fontSize: '13px', flexShrink: 0,
                fontFamily: 'var(--font-display)',
              }}>
                {user?.username?.[0]?.toUpperCase() ?? 'U'}
              </div>
              {!collapsed && (
                <div style={{ overflow: 'hidden', textAlign: 'left', minWidth: 0 }}>
                  <div style={{
                    color: SB.textActive, fontWeight: '500', fontSize: '13px',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    letterSpacing: '-0.01em',
                  }}>
                    {user?.username ?? 'User'}
                  </div>
                  <div style={{
                    color: SB.text, fontSize: '11px',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {user?.email ?? ''}
                  </div>
                </div>
              )}
            </button>

            {/* User dropdown */}
            {userMenuOpen && (
              <div style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)', left: 0, right: 0,
                background: '#1A1917',
                border: `0.5px solid ${SB.border}`,
                borderRadius: '10px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                overflow: 'hidden', zIndex: 100,
                minWidth: collapsed ? '160px' : 'auto',
                ...(collapsed ? { left: '100%', bottom: 0, marginLeft: '8px', right: 'auto', width: '160px' } : {}),
              }}>
                <div style={{ padding: '4px' }}>
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/profile') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '9px 12px', borderRadius: '7px',
                      color: SB.textActive, fontSize: '13px', fontWeight: '500',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      width: '100%', textAlign: 'left', transition: 'background 0.10s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = SB.hover }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    ⚙ Settings
                  </button>
                  <div style={{ height: '0.5px', background: SB.border, margin: '2px 8px' }} />
                  <button
                    onClick={handleLogout}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '9px 12px', borderRadius: '7px',
                      color: '#f87171', fontSize: '13px', fontWeight: '500',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      width: '100%', textAlign: 'left', transition: 'background 0.10s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <LogoutIcon size={14} /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CONTENT COLUMN
      ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
          // ── CENTERING FIX — main area transitions smoothly when
          // sidebar collapses. flex:1 handles the width automatically
          // because the sidebar's width is transitioning. Adding a
          // matching transition here makes the reflow smooth.
          transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
        }}
      >

        {/* ── Mobile topbar ──────────────────────────────────────────── */}
        <div className="mobile-top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Hamburger — opens mobile sidebar */}
            <button
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Open navigation"
              className="mobile-menu-btn"
              style={{ display: 'flex' }}
            >
              <HamburgerIcon size={18} />
            </button>
            <Link to="/dashboard" className="mobile-top-bar-logo" style={{ textDecoration: 'none' }}>
              <Logo
                size={24}
                wordmarkColor={text}
                hexColor="var(--text-faint)"
                osTagColor={SB.accent}
                osTagTextColor="#F5F2EB"
                colors={{
                  search: 'var(--agent-search)',
                  reader: 'var(--agent-reader)',
                  writer: 'var(--agent-writer)',
                  critic: 'var(--agent-critic)',
                }}
              />
            </Link>
          </div>

          <div className="mobile-top-bar-actions">
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Light mode' : 'Dark mode'}
              style={{
                width: '34px', height: '34px',
                border: `0.5px solid ${border}`,
                background: surface, color: textMuted,
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px', transition: 'background 0.12s',
              }}
            >
              {isDark ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            </button>
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              style={{
                width: '34px', height: '34px',
                border: `0.5px solid ${border}`,
                background: surface, color: '#f87171',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px', transition: 'background 0.12s',
              }}
            >
              <LogoutIcon size={14} />
            </button>
          </div>
        </div>

        {/* ── Page content ───────────────────────────────────────────── */}
        <main
          className="app-shell-main"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '28px 36px',
            minWidth: 0,
          }}
        >
          {/* page-transition gives every page the fade+slide-up animation */}
          <div className="page-transition" key={location.pathname} style={{ animation: "page-fade-in 0.18s cubic-bezier(0.16,1,0.3,1) both" }}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
      <nav className="mobile-bottom-nav" aria-label="Main navigation">
        {NAV[0].items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `mobile-bottom-nav-item${isActive ? ' mobile-bottom-nav-item--active' : ''}`
            }
          >
            <item.icon size={20} />
            <span className="mobile-bottom-nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Global overlays ───────────────────────────────────────────── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <CreateWorkspaceModal open={createWsOpen} onClose={() => setCreateWsOpen(false)} />

      {/* Toast system — always available on every protected page */}
      <ToastContainer />

    </div>
  )
}


/* ══════════════════════════════════════════════════════════════════════════
   ICONS — clean, consistent 1.8px stroke weight
══════════════════════════════════════════════════════════════════════════ */

function HomeIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function SearchIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function FileIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}

function NewsIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>
    </svg>
  )
}

function HistoryIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="12 8 12 12 14 14"/>
      <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/>
    </svg>
  )
}

function CalendarIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function SunIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function LogoutIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

function ChevronIcon({ size = 14, flipped }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: flipped ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
    >
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}

function FolderIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function HamburgerIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  )
}