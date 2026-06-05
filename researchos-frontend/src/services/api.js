const BASE = '/api'

/**
 * Thin fetch wrapper with error normalization.
 */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── History ────────────────────────────────────────────────────────────────

export const api = {
  /** Fetch all past research runs */
  getHistory: () => apiFetch('/history'),

  /** Fetch a single run by id */
  getRun: (id) => apiFetch(`/history/${id}`),

  /** Delete a run */
  deleteRun: (id) => apiFetch(`/history/${id}`, { method: 'DELETE' }),

  /** Health check */
  health: () => apiFetch('/health'),
}

export default api
