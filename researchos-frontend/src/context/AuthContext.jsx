import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient.js'
import { getToken, setToken, clearToken } from '../services/tokenStorage.js'

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

  const login = useCallback((token, userData) => {
    setToken(token)
    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
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