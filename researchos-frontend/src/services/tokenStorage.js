/**
 * tokenStorage.js
 *
 * LOCATION: src/services/tokenStorage.js
 *
 * Single source of truth for JWT storage. Both apiClient.js and AuthContext.jsx
 * import from here so the storage key can never drift out of sync again.
 */

export const TOKEN_KEY = 'researchos_token'
const USER_KEY = 'researchos_user' // kept separate in case you cache user data later

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}