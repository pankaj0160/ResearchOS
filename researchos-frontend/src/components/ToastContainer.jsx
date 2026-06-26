/**
 * ToastContainer.jsx  — UPDATED VERSION
 *
 * LOCATION: src/components/ToastContainer.jsx
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED FROM TASK 3.3 VERSION:
 *
 * Added a useEffect that listens for 'researchos:toast' custom events.
 * apiClient.js dispatches these events when it catches 401, 429, or 500 errors.
 * This connects the API layer to the toast UI without circular imports.
 *
 * Everything else is identical to the Task 3.3 version.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef, useState } from 'react'
import { useToastContext } from '../context/ToastContext'

// ── Individual Toast component ────────────────────────────────────────────────

function Toast({ id, message, type, onRemove }) {
  const [visible, setVisible]       = useState(false)
  const removeTimeoutRef            = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    removeTimeoutRef.current = setTimeout(() => onRemove(id), 300)
  }

  useEffect(() => () => {
    if (removeTimeoutRef.current) clearTimeout(removeTimeoutRef.current)
  }, [])

  const config = {
    success: { icon: '✓', backgroundColor: '#E1F5EE', borderColor: '#085041', iconColor: '#085041', textColor: '#042B22' },
    error:   { icon: '✕', backgroundColor: '#FAECE7', borderColor: '#993C1D', iconColor: '#993C1D', textColor: '#5C1F0A' },
    warning: { icon: '⚠', backgroundColor: '#FAEEDA', borderColor: '#854F0B', iconColor: '#854F0B', textColor: '#3D2200' },
    info:    { icon: 'ℹ', backgroundColor: '#E6F1FB', borderColor: '#0C447C', iconColor: '#0C447C', textColor: '#062442' },
  }[type] || { icon: 'ℹ', backgroundColor: 'var(--color-background-secondary)', borderColor: 'var(--color-border-secondary)', iconColor: 'var(--color-text-secondary)', textColor: 'var(--color-text-primary)' }

  return (
    <div
      role      = "alert"
      aria-live = "polite"
      style     = {{
        ...styles.toast,
        backgroundColor: config.backgroundColor,
        borderColor:     config.borderColor,
        transform:  visible ? 'translateX(0)'   : 'translateX(110%)',
        opacity:    visible ? 1                 : 0,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
      }}
    >
      <span style={{ ...styles.icon, color: config.iconColor }}>{config.icon}</span>
      <span style={{ ...styles.message, color: config.textColor }}>{message}</span>
      <button style={styles.closeBtn} onClick={handleDismiss} aria-label="Dismiss">×</button>
    </div>
  )
}


// ── ToastContainer ─────────────────────────────────────────────────────────────

export default function ToastContainer() {
  const { toasts, removeToast, showToast } = useToastContext()

  // ── Listen for events dispatched by apiClient.js ──────────────────────────
  // apiClient cannot import useToast (circular dependency) so it dispatches
  // a custom DOM event instead. We listen here and show the toast.
  //
  // This is the "event bus" pattern — two modules communicate via DOM events
  // instead of importing each other. Clean, no circular deps.
  useEffect(() => {
    function handleApiToast(event) {
      const { message, type = 'error' } = event.detail || {}
      if (message) showToast(message, type)
    }

    // Listen for toasts triggered by apiClient automatic error handling
    window.addEventListener('researchos:toast', handleApiToast)

    // Cleanup — remove listener when ToastContainer unmounts
    return () => window.removeEventListener('researchos:toast', handleApiToast)
  }, [showToast])

  if (toasts.length === 0) return null

  return (
    <div style={styles.container} aria-label="Notifications">
      {toasts.map(toast => (
        <Toast
          key      = {toast.id}
          id       = {toast.id}
          message  = {toast.message}
          type     = {toast.type}
          onRemove = {removeToast}
        />
      ))}
    </div>
  )
}


// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    position:      'fixed',
    bottom:        '1.5rem',
    right:         '1.5rem',
    zIndex:        9999,
    display:       'flex',
    flexDirection: 'column-reverse',
    gap:           '0.5rem',
    width:         '100%',
    maxWidth:      '380px',
    pointerEvents: 'none',
  },
  toast: {
    display:       'flex',
    alignItems:    'flex-start',
    gap:           '0.625rem',
    padding:       '0.75rem 1rem',
    borderRadius:  '10px',
    border:        '0.5px solid',
    boxShadow:     '0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
    pointerEvents: 'all',
  },
  icon: {
    fontSize:   '0.875rem',
    fontWeight: '700',
    flexShrink: 0,
    marginTop:  '0.1rem',
  },
  message: {
    fontSize:   '0.875rem',
    lineHeight: '1.5',
    flex:       1,
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  },
  closeBtn: {
    background: 'none',
    border:     'none',
    cursor:     'pointer',
    fontSize:   '1.1rem',
    lineHeight: '1',
    color:      'inherit',
    opacity:    0.5,
    padding:    '0 0 0 0.25rem',
    flexShrink: 0,
  },
}