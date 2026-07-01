/**
 * ToastContainer.jsx
 * Location: src/components/ToastContainer.jsx
 *
 * Bug fixed: toast colors were hardcoded light-only values.
 * In dark mode: white background toasts on dark page = invisible / jarring.
 *
 * Fix: use CSS variables for colors + respect prefers-color-scheme.
 * Also fixed: listens for 'researchos:toast' DOM events from apiClient.js.
 */

import { useEffect, useRef, useState } from 'react'
import { useToastContext } from '../context/ToastContext'
import { useTheme } from '../context/ThemeProvider'

// ── Toast type configs — uses CSS vars so they adapt to theme ─────────────────
function getConfig(type, isDark) {
  const configs = {
    success: {
      icon:        '✓',
      bg:          isDark ? '#052E1C' : '#E1F5EE',
      border:      isDark ? '#0D5C3A' : '#085041',
      iconColor:   isDark ? '#34D399' : '#085041',
      textColor:   isDark ? '#A7F3D0' : '#042B22',
    },
    error: {
      icon:        '✕',
      bg:          isDark ? '#2D0F0A' : '#FAECE7',
      border:      isDark ? '#7F1D1D' : '#993C1D',
      iconColor:   isDark ? '#F87171' : '#993C1D',
      textColor:   isDark ? '#FECACA' : '#5C1F0A',
    },
    warning: {
      icon:        '⚠',
      bg:          isDark ? '#291900' : '#FAEEDA',
      border:      isDark ? '#78350F' : '#854F0B',
      iconColor:   isDark ? '#FCD34D' : '#854F0B',
      textColor:   isDark ? '#FDE68A' : '#3D2200',
    },
    info: {
      icon:        'ℹ',
      bg:          isDark ? '#0C1A2E' : '#E6F1FB',
      border:      isDark ? '#1E3A5F' : '#0C447C',
      iconColor:   isDark ? '#60A5FA' : '#0C447C',
      textColor:   isDark ? '#BFDBFE' : '#062442',
    },
  }
  return configs[type] || configs.info
}

// ── Individual Toast ──────────────────────────────────────────────────────────
function Toast({ id, message, type, onRemove }) {
  const [visible, setVisible]  = useState(false)
  const removeRef              = useRef(null)
  const { isDark }             = useTheme()
  const config                 = getConfig(type, isDark)

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const t = setTimeout(() => dismiss(), 4000)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    setVisible(false)
    removeRef.current = setTimeout(() => onRemove(id), 300)
  }

  useEffect(() => () => {
    if (removeRef.current) clearTimeout(removeRef.current)
  }, [])

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        display:         'flex',
        alignItems:      'flex-start',
        gap:             '0.625rem',
        padding:         '0.75rem 1rem',
        borderRadius:    10,
        border:          `1px solid ${config.border}`,
        backgroundColor: config.bg,
        boxShadow:       isDark
          ? '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)'
          : '0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
        pointerEvents:   'all',
        transform:       visible ? 'translateX(0)' : 'translateX(110%)',
        opacity:         visible ? 1 : 0,
        transition:      'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
        maxWidth:        '100%',
      }}
    >
      {/* Type icon */}
      <span style={{
        fontSize:   '0.875rem',
        fontWeight: 700,
        color:      config.iconColor,
        flexShrink: 0,
        marginTop:  '0.1rem',
      }}>
        {config.icon}
      </span>

      {/* Message */}
      <span style={{
        fontSize:   '0.875rem',
        lineHeight: 1.5,
        flex:       1,
        color:      config.textColor,
        fontFamily: 'var(--font-sans, system-ui)',
      }}>
        {message}
      </span>

      {/* Dismiss button */}
      <button
        onClick={dismiss}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          fontSize:   '1.1rem',
          lineHeight: 1,
          color:      config.iconColor,
          opacity:    0.6,
          padding:    '0 0 0 0.25rem',
          flexShrink: 0,
          transition: 'opacity .1s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
      >
        ×
      </button>
    </div>
  )
}

// ── ToastContainer ────────────────────────────────────────────────────────────
export default function ToastContainer() {
  const { toasts, removeToast, showToast } = useToastContext()

  // Listen for DOM events dispatched by apiClient.js
  // (apiClient can't import useToast directly — circular dependency)
  useEffect(() => {
    function handleApiToast(event) {
      const { message, type = 'error' } = event.detail || {}
      if (message) showToast(message, type)
    }
    window.addEventListener('researchos:toast', handleApiToast)
    return () => window.removeEventListener('researchos:toast', handleApiToast)
  }, [showToast])

  if (toasts.length === 0) return null

  return (
    <div
      aria-label="Notifications"
      style={{
        position:      'fixed',
        bottom:        '1.5rem',
        right:         '1.5rem',
        zIndex:        9999,
        display:       'flex',
        flexDirection: 'column-reverse',
        gap:           '0.5rem',
        width:         '100%',
        maxWidth:      380,
        pointerEvents: 'none',
      }}
    >
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          onRemove={removeToast}
        />
      ))}
    </div>
  )
}