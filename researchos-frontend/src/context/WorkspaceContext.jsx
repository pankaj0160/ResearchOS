/**
 * WorkspaceContext.jsx
 *
 * LOCATION: src/context/WorkspaceContext.jsx
 * REPLACE your entire existing file with this.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED:
 *
 * Added useMemo around the Provider value object.
 *
 * WHY THIS MATTERS:
 * Without useMemo, every time WorkspaceProvider re-renders it creates a NEW
 * object literal for the value prop: value={{ workspaces, activeWorkspace, ... }}
 * A new object = React thinks the context changed = ALL context consumers re-render.
 * This means AppShell, ResearchPage, and every component calling useWorkspace()
 * re-renders even when workspaces haven't changed at all.
 *
 * With useMemo, the value object is only recreated when the actual data changes.
 * React compares the memoized reference — if it's the same object, no re-renders.
 *
 * Everything else is IDENTICAL to your existing WorkspaceContext.jsx.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ← useMemo added to the import
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth }        from './AuthContext'
import { workspaceApi }   from '../services/workspaceApi'

const WorkspaceContext = createContext(null)
const STORAGE_KEY = 'researchos_active_workspace'

export function WorkspaceProvider({ children }) {
  const [workspaces,      setWorkspaces]      = useState([])
  const [activeWorkspace, setActiveWorkspace] = useState(null)
  const [loading,         setLoading]         = useState(false)
  const { user } = useAuth()

  // Fetch workspaces whenever user logs in/changes
  const fetchWorkspaces = useCallback(async () => {
    if (!user) { setWorkspaces([]); setActiveWorkspace(null); return }
    setLoading(true)
    try {
      const data = await workspaceApi.getAll()
      const list = data?.workspaces ?? []
      setWorkspaces(list)

      // Restore last active workspace from localStorage
      const savedId = localStorage.getItem(STORAGE_KEY)
      if (savedId) {
        const found = list.find(w => String(w.id) === savedId)
        if (found) setActiveWorkspace(found)
      }
    } catch (e) {
      console.error('[WorkspaceContext] fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { fetchWorkspaces() }, [fetchWorkspaces])

  /** Create a workspace and refresh the list */
  const createWorkspace = useCallback(async (name, topic, description = '') => {
    const result = await workspaceApi.create(name, topic, description)
    await fetchWorkspaces()
    return result?.data?.workspace_id
  }, [fetchWorkspaces])

  /** Set the active workspace and persist to localStorage */
  const selectWorkspace = useCallback((ws) => {
    setActiveWorkspace(ws)
    if (ws) {
      localStorage.setItem(STORAGE_KEY, String(ws.id))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  /** Delete a workspace — clears active if it was the deleted one */
  const deleteWorkspace = useCallback(async (workspaceId) => {
    await workspaceApi.delete(workspaceId)
    if (activeWorkspace?.id === workspaceId) selectWorkspace(null)
    await fetchWorkspaces()
  }, [activeWorkspace, fetchWorkspaces, selectWorkspace])

  // ── THE KEY CHANGE ────────────────────────────────────────────────────────
  // useMemo creates a stable object reference.
  // The context value only changes when one of the listed dependencies changes.
  // Without this, every Provider re-render creates a new object → all consumers
  // re-render even when nothing relevant changed.
  //
  // Dependencies listed:
  //   workspaces       → changes when workspaces are fetched or modified
  //   activeWorkspace  → changes when user selects/clears a workspace
  //   loading          → changes during fetch operations
  //   fetchWorkspaces  → stable (useCallback with [user] dep)
  //   createWorkspace  → stable (useCallback with [fetchWorkspaces] dep)
  //   selectWorkspace  → stable (useCallback with [] dep — never changes)
  //   deleteWorkspace  → stable (useCallback with [...] dep)
  const contextValue = useMemo(() => ({
    workspaces,
    activeWorkspace,
    loading,
    fetchWorkspaces,
    createWorkspace,
    selectWorkspace,
    deleteWorkspace,
  }), [
    workspaces,
    activeWorkspace,
    loading,
    fetchWorkspaces,
    createWorkspace,
    selectWorkspace,
    deleteWorkspace,
  ])

  return (
    // ← value={contextValue} instead of value={{ workspaces, ... }}
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}