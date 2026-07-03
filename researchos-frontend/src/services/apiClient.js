/**
 * apiClient.js
 *
 * LOCATION: src/services/apiClient.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SINGLE FUNCTION ALL SERVICE FILES USE INSTEAD OF fetch().
 *
 * WHAT IT HANDLES AUTOMATICALLY (so no service file ever has to):
 *   ✓ Attaches Authorization header with JWT token
 *   ✓ Sets Content-Type: application/json on every request
 *   ✓ 401 Unauthorized  → silently refreshes the access token and retries
 *                         the request ONCE; only clears session + redirects
 *                         to /login if the refresh itself fails (refresh
 *                         token expired/revoked — a real logout condition)
 *   ✓ 429 Too Many Requests → shows "slow down" toast warning
 *   ✓ 500+ Server Error → shows "something went wrong" toast
 *   ✓ Network offline   → shows "check your connection" toast
 *   ✓ Always returns the same shape — { ok, data, error, code, status }
 *
 * HOW SERVICE FILES USE IT:
 *
 *   // BEFORE (raw fetch — every file different):
 *   const res = await fetch(`${API_BASE_URL}/api/runs`, {
 *     headers: { Authorization: `Bearer ${token}` }
 *   })
 *   if (!res.ok) throw new Error('Failed')
 *   return res.json()
 *
 *   // AFTER (apiClient — consistent, automatic error handling):
 *   const result = await apiClient.get('/api/history')
 *   if (!result.ok) return   // toast already shown automatically
 *   return result.data       // { runs: [...] }
 *
 * RETURN SHAPE — always one of these two:
 *
 *   SUCCESS: { ok: true,  data: {...},    status: 200 }
 *   FAILURE: { ok: false, error: "...",   status: 404, code: "NOT_FOUND" }
 *
 * TOKEN STORAGE:
 *   Token read/write/clear logic lives in ./tokenStorage.js — the single
 *   source of truth for the localStorage keys. AuthContext.jsx imports the
 *   same module, so the keys can never drift out of sync between the two
 *   (this previously caused a silent bug where apiClient read a different
 *   key than AuthContext wrote to, making every authenticated request
 *   except /api/auth/me fail with 401).
 *
 * ACCESS/REFRESH TOKEN FLOW:
 *   The backend now issues a short-lived (15 min) access token plus a
 *   long-lived (30 day) refresh token. When a request 401s because the
 *   access token expired, this file automatically calls POST /api/auth/refresh
 *   with the stored refresh token, stores the new pair, and retries the
 *   original request — the caller never sees the 401 at all. Multiple
 *   requests that 401 around the same time share a single in-flight refresh
 *   call (see `refreshPromise` below) instead of each firing their own
 *   refresh and racing to rotate the token out from under each other.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { API_BASE_URL } from './config.js'
import { getToken, setToken, getRefreshToken, setRefreshToken, clearToken } from './tokenStorage.js'


// ── Toast integration ─────────────────────────────────────────────────────────
// apiClient needs to show toasts for automatic error handling (401, 429, 500).
// We import lazily to avoid circular dependency issues.
// If toast system is unavailable (e.g. before app mounts), we fall back to console.

function showErrorToast(message) {
  try {
    // Dynamic import avoids circular deps — ToastContext → apiClient → ToastContext
    // Instead we use a simple global event that ToastContainer listens for
    window.dispatchEvent(new CustomEvent('researchos:toast', {
      detail: { message, type: 'error' }
    }))
  } catch {
    console.error('[API Error]', message)
  }
}

function showWarningToast(message) {
  try {
    window.dispatchEvent(new CustomEvent('researchos:toast', {
      detail: { message, type: 'warning' }
    }))
  } catch {
    console.warn('[API Warning]', message)
  }
}


// ── Build success response ─────────────────────────────────────────────────────
function successResult(data, status) {
  return { ok: true, data, status, error: null, code: null }
}

// ── Build error response ───────────────────────────────────────────────────────
function errorResult(error, status, code = 'UNKNOWN_ERROR') {
  return { ok: false, data: null, status, error, code }
}


// ── Token refresh coordination ─────────────────────────────────────────────────
// Routes that must NEVER trigger a refresh-and-retry — refreshing on a 401
// from these would either recurse (refresh itself 401ing) or make no sense
// (login/register aren't authenticated requests in the first place).
const NO_REFRESH_PATHS = ['/api/auth/refresh', '/api/auth/login', '/api/auth/register']

// Shared in-flight refresh call. If three components each get a 401 within
// the same instant (e.g. three widgets loading on Dashboard mount right as
// the access token expires), all three should await the SAME refresh
// request and share its result — not each fire their own. Firing three
// concurrent refreshes would rotate the refresh token three times, and only
// the last response's tokens would end up being the "real" current ones,
// silently invalidating the other two in-flight callers' assumptions.
let refreshPromise = null

/**
 * Exchange the stored refresh token for a new access+refresh pair.
 * Returns true on success (new tokens are already stored), false on failure
 * (refresh token missing/expired/revoked — caller should treat this as a
 * real "session ended" and log the user out).
 *
 * Uses raw fetch(), not request(), so this never recurses through the 401
 * handling logic below.
 */
function performTokenRefresh() {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const storedRefreshToken = getRefreshToken()
    if (!storedRefreshToken) return false

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: storedRefreshToken }),
      })
      if (!res.ok) return false

      const data = await res.json()
      if (!data?.token || !data?.refresh_token) return false

      setToken(data.token)
      setRefreshToken(data.refresh_token)
      return true
    } catch {
      // Network error during refresh — treat as failure, don't crash the app
      return false
    }
  })()

  // Clear the shared promise once it settles so the NEXT expiry cycle
  // (potentially minutes later) starts a fresh refresh instead of reusing
  // this resolved one forever.
  refreshPromise.finally(() => { refreshPromise = null })

  return refreshPromise
}


// ── Core request function ─────────────────────────────────────────────────────

async function request(
  method,    // 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path,      // e.g. '/api/history' — always starts with /api/
  options = {},
) {
  const {
    body,           // object → sent as JSON, FormData → sent as-is
    token,          // override token (for SSE which can't use headers)
    headers = {},   // extra headers to merge
    skipAuth,       // true → don't attach Authorization header (public routes)
    silent,         // true → don't show error toasts (caller handles display)
    _isRetry,       // internal — true when this call is a post-refresh retry;
                     // prevents an infinite refresh→retry→401→refresh loop
                     // if the NEW access token also somehow gets rejected
  } = options

  // ── Build headers ─────────────────────────────────────────────────────────
  const requestHeaders = { ...headers }

  // Attach auth token unless this is a public route
  if (!skipAuth) {
    const authToken = token || getToken()
    if (authToken) {
      requestHeaders['Authorization'] = `Bearer ${authToken}`
    }
  }

  // Only set Content-Type for JSON bodies — not for FormData (file uploads)
  // FormData sets its own Content-Type with boundary automatically
  if (body && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  // ── Build fetch options ───────────────────────────────────────────────────
  const fetchOptions = {
    method,
    headers: requestHeaders,
  }

  if (body) {
    // FormData (file upload) → send as-is
    // Everything else → serialize to JSON
    fetchOptions.body = body instanceof FormData
      ? body
      : JSON.stringify(body)
  }

  // ── Execute the request ───────────────────────────────────────────────────
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, fetchOptions)
  } catch (networkError) {
    // fetch() itself threw — this means the network is unreachable
    // Common causes: no internet, server is down, CORS preflight failed
    const isOffline = !navigator.onLine
    const message = isOffline
      ? 'No internet connection — please check your network'
      : 'Cannot reach the server — please try again'

    if (!silent) showErrorToast(message)

    return errorResult(message, 0, 'NETWORK_ERROR')
  }

  // ── Handle specific status codes ──────────────────────────────────────────

  // 401 Unauthorized — access token expired, invalid, or (rarely) rejected
  // for another reason. Try a silent refresh-and-retry before giving up.
  if (response.status === 401) {
    const canAttemptRefresh =
      !skipAuth &&                              // public routes were never authenticated — nothing to refresh
      !_isRetry &&                              // don't refresh twice for the same original request
      !NO_REFRESH_PATHS.includes(path) &&       // don't refresh in response to auth endpoints themselves
      !!getRefreshToken()                       // nothing to refresh with if there's no refresh token stored

    if (canAttemptRefresh) {
      const refreshed = await performTokenRefresh()
      if (refreshed) {
        // Retry the original request exactly once with the new access token
        return request(method, path, { ...options, _isRetry: true })
      }
    }

    // Refresh wasn't attempted, or it failed — the session is genuinely over.
    clearToken()
    // Only redirect if we are not already on a public page
    // Prevents redirect loops on /login itself
    if (!window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/register')) {
      window.location.href = '/login'
    }
    return errorResult('Session expired — please log in again', 401, 'UNAUTHORIZED')
  }

  // 429 Too Many Requests — rate limit hit
  // Read Retry-After header if available to tell user how long to wait
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const waitMsg = retryAfter
      ? `Rate limit reached — please wait ${retryAfter} seconds`
      : 'Too many requests — please slow down'
    if (!silent) showWarningToast(waitMsg)
    return errorResult(waitMsg, 429, 'RATE_LIMITED')
  }

  // 500+ Server Error — something crashed on the backend
  if (response.status >= 500) {
    let message = 'Something went wrong on our end — please try again'
    try {
      // Try to read a more specific message from our error handler
      // (Phase 3 Task 3.1 makes every 500 return { error, message, code })
      const errorBody = await response.json()
      if (errorBody?.message) message = errorBody.message
    } catch {
      // Response wasn't JSON — use the generic message
    }
    if (!silent) showErrorToast(message)
    return errorResult(message, response.status, 'INTERNAL_ERROR')
  }

  // ── Parse response body ───────────────────────────────────────────────────
  // Handle successful responses (200–299) and client errors (400–499 except 401/429)

  // 204 No Content — success with no body (DELETE requests often return this)
  if (response.status === 204) {
    return successResult(null, 204)
  }

  // Try to parse JSON — most responses are JSON
  let data
  try {
    data = await response.json()
  } catch {
    // Response wasn't JSON (e.g. file download) — return raw response
    return successResult(response, response.status)
  }

  // Check if the response was successful (2xx status codes)
  if (response.ok) {
    return successResult(data, response.status)
  }

  // Client error (400, 403, 404, 422 etc.) — structured error from our backend
  // Our Phase 3.1 error handler always returns: { error, message, code, status_code }
  const errorMessage = data?.message || data?.detail || `Request failed (${response.status})`
  const errorCode    = data?.code    || 'CLIENT_ERROR'

  // Don't show toast for client errors by default — let the component decide
  // (e.g. a 404 on /api/history/999 is expected — no need to scare the user)
  return errorResult(errorMessage, response.status, errorCode)
}


// ── Public API ────────────────────────────────────────────────────────────────
// Convenience methods for each HTTP verb.
// These are what service files import and use.

export const apiClient = {
  /**
   * GET request — fetch data
   * @example
   *   const result = await apiClient.get('/api/history')
   *   if (result.ok) console.log(result.data.runs)
   */
  get: (path, options = {}) =>
    request('GET', path, options),

  /**
   * POST request — create data
   * @example
   *   const result = await apiClient.post('/api/workspaces', {
   *     body: { name: 'AI Research', topic: 'artificial intelligence' }
   *   })
   */
  post: (path, options = {}) =>
    request('POST', path, options),

  /**
   * PATCH request — partial update
   * @example
   *   const result = await apiClient.patch('/api/auth/me', {
   *     body: { city: 'Mumbai' }
   *   })
   */
  patch: (path, options = {}) =>
    request('PATCH', path, options),

  /**
   * PUT request — full replace
   */
  put: (path, options = {}) =>
    request('PUT', path, options),

  /**
   * DELETE request — remove data
   * @example
   *   const result = await apiClient.delete(`/api/history/${runId}`)
   */
  delete: (path, options = {}) =>
    request('DELETE', path, options),

  /**
   * Upload a file (FormData) — automatically skips JSON Content-Type
   * @example
   *   const form = new FormData()
   *   form.append('file', pdfFile)
   *   const result = await apiClient.upload('/api/rag/upload', form)
   */
  upload: (path, formData, options = {}) =>
    request('POST', path, { ...options, body: formData }),
}

export default apiClient