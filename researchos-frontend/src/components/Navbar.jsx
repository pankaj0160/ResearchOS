/**
 * Navbar.jsx
 * Location: src/components/Navbar.jsx
 *
 * In-app top bar (shown once a user is inside a workspace/module).
 * Previously: hardcoded Tailwind slate/indigo classes, disconnected
 * from the rest of the app's CSS-variable design system, plus the old
 * four-square "OrchestrAI" logo.
 *
 * Now: pulls every color from the existing var(--...) system in
 * index.css (so it automatically matches Dashboard/PDF/RAG/etc and
 * reacts to the theme rocker instantly), uses the new <Logo /> mark,
 * and adds the small interaction details — active state, focus rings,
 * a proper mobile sheet instead of nothing.
 */
import { memo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, Menu, X } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import Logo from './Logo'

const NAV_LINKS = [
  { to: '/research', label: 'Research' },
  { to: '/pdf-chat', label: 'PDF Chat' },
  { to: '/news', label: 'News' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/calendar', label: 'Calendar' },
]

function Navbar({ onReset }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <header className="app-navbar">
      <div className="app-navbar-inner">

        <Link to="/research" className="app-navbar-brand" aria-label="ResearchOS home">
          <Logo
            size={30}
            wordmarkColor="var(--text-primary)"
            hexColor="var(--text-faint)"
            osTagColor="var(--accent)"
            osTagTextColor="var(--bg-base)"
            colors={{
              search: 'var(--agent-search)',
              reader: 'var(--agent-reader)',
              writer: 'var(--agent-writer)',
              critic: 'var(--agent-critic)',
            }}
          />
        </Link>

        {/* Desktop links */}
        <nav className="app-navbar-links" aria-label="Primary">
          {NAV_LINKS.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`app-navbar-link${location.pathname.startsWith(link.to) ? ' app-navbar-link--active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop right side */}
        <div className="app-navbar-actions">
          {onReset && (
            <button type="button" onClick={onReset} className="app-navbar-reset">
              <Plus size={15} strokeWidth={2.25} />
              New Research
            </button>
          )}
          <ThemeToggle />
        </div>

        {/* Mobile right side */}
        <div className="app-navbar-actions app-navbar-actions--mobile">
          {onReset && (
            <button type="button" onClick={onReset} className="app-navbar-reset app-navbar-reset--compact" aria-label="New research">
              <Plus size={16} strokeWidth={2.25} />
            </button>
          )}
          <ThemeToggle iconOnly />
          <button
            type="button"
            className="app-navbar-menu-btn"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {menuOpen && (
        <nav className="app-navbar-sheet" aria-label="Primary mobile">
          {NAV_LINKS.map(link => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={`app-navbar-sheet-link${location.pathname.startsWith(link.to) ? ' app-navbar-sheet-link--active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

export default memo(Navbar)