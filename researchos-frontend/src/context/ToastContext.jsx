/**
 * ToastContext.jsx
 *
 * LOCATION: src/context/ToastContext.jsx
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS:
 * The brain of the toast system. Stores the list of active toasts and
 * provides showToast() and removeToast() to any component in the app.
 *
 * WHY CONTEXT:
 * Without context, to show a toast from ResearchPage you would have to
 * pass a showToast prop from main.jsx → AppShell → ResearchPage.
 * That is called "prop drilling" — messy and fragile.
 * With context, any component just calls useToast() and it works instantly.
 *
 * HOW A TOAST OBJECT LOOKS:
 * {
 *   id:        "abc123",      ← unique ID so React can track and remove it
 *   message:   "Run saved!",  ← the text shown to the user
 *   type:      "success",     ← "success" | "error" | "info" | "warning"
 *   duration:  4000,          ← milliseconds before auto-dismiss (default 4s)
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { createContext, useCallback, useContext, useState } from 'react'

// ── Create the context ────────────────────────────────────────────────────────
// null as default — if someone calls useToast() outside ToastProvider,
// we catch that below and throw a helpful error message.
const ToastContext = createContext(null)

// ── ToastProvider — wrap your app once in main.jsx ────────────────────────────

export function ToastProvider({ children }) {
  // toasts is the list of currently visible toast objects
  // Each toast has: id, message, type, duration
  const [toasts, setToasts] = useState([])

  // ── showToast — the main function components call ─────────────────────────
  // useCallback means this function reference never changes between renders.
  // Without useCallback, every component that uses showToast would re-render
  // every time the toasts list changes — wasteful.
  const showToast = useCallback((
    message,
    type     = 'info',     // 'success' | 'error' | 'info' | 'warning'
    duration = 4000,       // milliseconds — 4 seconds is the standard
  ) => {
    // Generate a unique ID using timestamp + random number
    // This is simpler than importing uuid for such a small use case
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    // Add the new toast to the list
    setToasts(prev => [
      ...prev,
      { id, message, type, duration },
    ])

    // Schedule automatic removal after duration
    // clearTimeout not needed — if the user manually dismisses first,
    // removeToast() filters it out and the timeout just runs on nothing
    setTimeout(() => {
      removeToast(id)
    }, duration)

    // Return the id in case the caller wants to dismiss it manually
    return id
  }, [])

  // ── removeToast — dismiss one toast by its id ─────────────────────────────
  // Called by: the auto-dismiss setTimeout above, and the × button in ToastContainer
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  // ── Convenience shortcuts ─────────────────────────────────────────────────
  // These make call sites cleaner:
  //   showToast('Saved!', 'success')  ← without shortcuts
  //   toast.success('Saved!')         ← with shortcuts
  const toast = {
    success: (msg, duration) => showToast(msg, 'success', duration),
    error:   (msg, duration) => showToast(msg, 'error',   duration ?? 6000), // errors stay longer
    info:    (msg, duration) => showToast(msg, 'info',    duration),
    warning: (msg, duration) => showToast(msg, 'warning', duration),
  }

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast, toast }}>
      {children}
    </ToastContext.Provider>
  )
}

// ── useToastContext — internal hook used by ToastContainer ────────────────────
// Exported separately so ToastContainer can read the toasts list
export function useToastContext() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error(
      'useToastContext must be used inside <ToastProvider>. ' +
      'Make sure ToastProvider wraps your app in main.jsx.'
    )
  }
  return ctx
}