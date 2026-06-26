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
 *   ✓ 401 Unauthorized  → clears token + redirects to /login
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
 *   source of truth for the localStorage key. AuthContext.jsx imports the
 *   same module, so the key can never drift out of sync between the two
 *   (this previously caused a silent bug where apiClient read a different
 *   key than AuthContext wrote to, making every authenticated request
 *   except /api/auth/me fail with 401).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { API_BASE_URL } from './config.js'
import { getToken, clearToken } from './tokenStorage.js'


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

  // 401 Unauthorized — token expired or invalid
  // Clear stored credentials and redirect to login automatically
  if (response.status === 401) {
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