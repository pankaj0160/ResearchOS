/**
 * tokenStorage.js
 *
 * LOCATION: src/services/tokenStorage.js
 *
 * Single source of truth for JWT + refresh token storage. apiClient.js and
 * AuthContext.jsx both import from here so the storage keys can never drift
 * out of sync again.
 *
 * Two tokens are stored now instead of one:
 *   researchos_token          — short-lived (15 min) access token
 *   researchos_refresh_token  — long-lived (30 days), used by apiClient.js
 *                                to silently mint a new access token when
 *                                the current one expires (see apiClient.js
 *                                for the refresh-on-401 flow).
 */

export const TOKEN_KEY = 'researchos_token'
export const REFRESH_TOKEN_KEY = 'researchos_refresh_token'
const USER_KEY = 'researchos_user' // kept separate in case you cache user data later

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || ''
}

export function setRefreshToken(refreshToken) {
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

