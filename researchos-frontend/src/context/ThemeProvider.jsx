/**
 * ThemeProvider.jsx
 * Location: src/context/ThemeProvider.jsx
 *
 * Bug fixed: was only adding .dark class to <html>.
 * Some components (ToastContainer, legacy news styles) use [data-theme="dark"].
 * Now we set BOTH:
 *   document.documentElement.classList   → .dark  (Tailwind + AppShell)
 *   document.documentElement.setAttribute → data-theme="dark"  (CSS selectors)
 *
 * This means ALL dark mode selectors work regardless of which convention
 * the component was written with.
 */

import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('researchos_theme')
      if (stored) return stored === 'dark'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return true  // default dark if storage unavailable
    }
  })

  useEffect(() => {
    const root = document.documentElement

    // Method 1: .dark class (used by Tailwind + AppShell)
    root.classList.toggle('dark', isDark)

    // Method 2: data-theme attribute (used by CSS [data-theme="dark"] selectors)
    root.setAttribute('data-theme', isDark ? 'dark' : 'light')

    // Method 3: color-scheme property (tells browser to use dark scrollbars etc.)
    root.style.colorScheme = isDark ? 'dark' : 'light'

    // Persist preference
    try {
      localStorage.setItem('researchos_theme', isDark ? 'dark' : 'light')
    } catch { /* storage might be blocked */ }
  }, [isDark])

  const toggleTheme = () => setIsDark(v => !v)

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

export default ThemeProvider