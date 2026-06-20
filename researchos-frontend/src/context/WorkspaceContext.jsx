import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { workspaceApi } from '../services/workspaceApi'

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
      const data = await workspaceApi.list()
      const list = data.workspaces ?? []
      setWorkspaces(list)

      // Restore last active workspace from localStorage
      const savedId = localStorage.getItem(STORAGE_KEY)
      if (savedId) {
        const found = list.find(w => String(w.id) === savedId)
        if (found) setActiveWorkspace(found)
      }
    } catch (e) {
      console.error('[WorkspaceContext] fetch failed:', e)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { fetchWorkspaces() }, [fetchWorkspaces])

  /** Create a workspace and set it as active */
  const createWorkspace = useCallback(async (name, topic, description = '') => {
    const data = await workspaceApi.create(name, topic, description)
    await fetchWorkspaces()          // refresh list
    return data.workspace_id
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

  /** Delete a workspace. Clears active if it was the deleted one. */
  const deleteWorkspace = useCallback(async (workspaceId) => {
    await workspaceApi.delete(workspaceId)
    if (activeWorkspace?.id === workspaceId) selectWorkspace(null)
    await fetchWorkspaces()
  }, [activeWorkspace, fetchWorkspaces, selectWorkspace])

  return (
    <WorkspaceContext.Provider
      value={{ workspaces, activeWorkspace, loading, fetchWorkspaces, createWorkspace, selectWorkspace, deleteWorkspace }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}