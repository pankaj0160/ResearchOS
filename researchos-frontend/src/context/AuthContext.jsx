import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'researchos_token'

import { API_BASE_URL } from '../services/config.js'
const BASE_URL = API_BASE_URL

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount, try to rehydrate session from localStorage
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }

    fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setUser(data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback((token, userData) => {
    localStorage.setItem(TOKEN_KEY, token)
    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  /** Update city and/or default_topic */
  const updateProfile = useCallback(async (updates) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return

    await fetch(`${BASE_URL}/api/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    })

    // Update local state immediately
    setUser(prev => (prev ? { ...prev, ...updates } : prev))
  }, [])

  /** Return the stored JWT (used by API calls) */
  const getToken = useCallback(() => localStorage.getItem(TOKEN_KEY), [])

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