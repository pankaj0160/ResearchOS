/**
 * ThemeToggle.jsx
 * Location: src/components/ThemeToggle.jsx
 *
 * Bug fixed: this previously destructured { theme, setTheme } from
 * useTheme(), but ThemeProvider only ever exposed { isDark, toggleTheme } —
 * so every click threw / silently no-opped depending on call site. Now
 * wired to the provider's real API.
 *
 * Redesigned as a rocker switch (not a segmented pill or bare icon
 * button) to match the rest of the design system's instrument-panel
 * detailing — same pattern used in the marketing site's theme switch.
 */
import { memo } from 'react'
import { useTheme } from '../context/ThemeProvider'

function ThemeToggle({ iconOnly = false }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleTheme}
      className="theme-rocker"
      style={{
        width: iconOnly ? 40 : 52,
        height: iconOnly ? 40 : 28,
        borderRadius: iconOnly ? 10 : 20,
      }}
    >
      {iconOnly ? (
        isDark ? <MoonIcon /> : <SunIcon />
      ) : (
        <span className="theme-rocker-thumb" style={{ transform: isDark ? 'translateX(0)' : 'translateX(24px)' }}>
          {isDark ? <MoonIcon size={12} /> : <SunIcon size={12} />}
        </span>
      )}
    </button>
  )
}

export default memo(ThemeToggle)

/* ── Icons ── */

function SunIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4.3" />
      <line x1="12" y1="2.5" x2="12" y2="4.3" />
      <line x1="12" y1="19.7" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="4.3" y2="12" />
      <line x1="19.7" y1="12" x2="21.5" y2="12" />
      <line x1="5.3" y1="5.3" x2="6.6" y2="6.6" />
      <line x1="17.4" y1="17.4" x2="18.7" y2="18.7" />
      <line x1="5.3" y1="18.7" x2="6.6" y2="17.4" />
      <line x1="17.4" y1="6.6" x2="18.7" y2="5.3" />
    </svg>
  )
}

function MoonIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}