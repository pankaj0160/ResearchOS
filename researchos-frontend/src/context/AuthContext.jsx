import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient.js'
import { authApi } from '../services/authApi.js'
import { getToken, setToken, getRefreshToken, setRefreshToken, clearToken } from '../services/tokenStorage.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount, try to rehydrate session from localStorage
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    apiClient.get('/api/auth/me', { silent: true })
      .then(result => {
        if (result.ok) {
          setUser(result.data)
        } else {
          clearToken()
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback((token, userData, refreshToken) => {
    setToken(token)
    if (refreshToken) setRefreshToken(refreshToken)
    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    // Best-effort revoke on the backend — fire-and-forget so logout still
    // feels instant even on a slow/offline connection. Local state is
    // cleared immediately regardless of whether the revoke call succeeds;
    // worst case the server-side refresh token row just expires naturally
    // in 30 days instead of being revoked right now.
    const currentRefreshToken = getRefreshToken()
    if (currentRefreshToken) {
      authApi.logout(currentRefreshToken).catch(() => {})
    }
    clearToken()
    setUser(null)
  }, [])

  /** Revoke every session for this account (all devices) and log out locally too */
  const logoutAll = useCallback(async () => {
    const result = await authApi.logoutAll()
    clearToken()
    setUser(null)
    return result
  }, [])

  /** Update city and/or default_topic */
  const updateProfile = useCallback(async (updates) => {
    const result = await apiClient.patch('/api/auth/me', { body: updates })
    if (result.ok) {
      setUser(prev => (prev ? { ...prev, ...updates } : prev))
    }
    return result
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        logoutAll,
        getToken,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}