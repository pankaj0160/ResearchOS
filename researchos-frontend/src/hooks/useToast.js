/**
 * useToast.js
 *
 * LOCATION: src/hooks/useToast.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS:
 * The public API for showing toasts. Import this hook in any component
 * and call toast.success(), toast.error(), or showToast() directly.
 *
 * WHY A SEPARATE HOOK FILE:
 * ToastContext.jsx owns the state and logic.
 * useToast.js is just the clean public interface.
 * Components import from here — they never import from ToastContext directly.
 * This means if we ever change how context works internally, no component
 * needs to update — they all still import from useToast.
 *
 * USAGE IN ANY COMPONENT:
 *
 *   import { useToast } from '../hooks/useToast'
 *
 *   function MyComponent() {
 *     const { toast } = useToast()
 *
 *     const handleSave = async () => {
 *       try {
 *         await saveData()
 *         toast.success('Saved successfully!')
 *       } catch (err) {
 *         toast.error('Failed to save. Please try again.')
 *       }
 *     }
 *   }
 *
 * AVAILABLE METHODS:
 *   toast.success(message, duration?)  → green toast, 4s default
 *   toast.error(message, duration?)    → red toast, 6s default (errors need more time to read)
 *   toast.info(message, duration?)     → blue toast, 4s default
 *   toast.warning(message, duration?)  → amber toast, 4s default
 *   showToast(message, type, duration) → manual version with full control
 *   removeToast(id)                    → dismiss a specific toast by id
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useToastContext } from '../context/ToastContext'

export function useToast() {
  // useToastContext reads from ToastContext and throws a helpful error
  // if this hook is used outside of ToastProvider
  const { showToast, removeToast, toast } = useToastContext()

  return {
    // Shortcut methods — the ones you will use 95% of the time
    toast,

    // Full control version — use when you need a custom duration or type
    showToast,

    // Manual dismiss — useful for "undo" patterns where you dismiss on click
    removeToast,
  }
}