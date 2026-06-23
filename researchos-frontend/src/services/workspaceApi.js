/**
 * workspaceApi.js
 * All workspace CRUD operations.
 * Calls: GET/POST/DELETE /api/workspaces
 */

import { API_BASE_URL } from './config.js'
const BASE = API_BASE_URL

function authHeaders() {
  const token = localStorage.getItem('researchos_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers ?? {}) },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.detail ?? `Request failed (${res.status})`
    throw new Error(Array.isArray(msg) ? msg.map(e => e.msg).join(', ') : msg)
  }
  return data
}

export const workspaceApi = {
  /** List all workspaces for the current user. Returns { workspaces: [...] } */
  list: () => request('/api/workspaces'),

  /**
   * Create a new workspace.
   * @param {string} name        - e.g. "AI Research Q3"
   * @param {string} topic       - e.g. "artificial intelligence"
   * @param {string} description - optional notes
   * Returns { workspace_id, name, topic }
   */
  create: (name, topic, description = '') =>
    request('/api/workspaces', {
      method: 'POST',
      body:   JSON.stringify({ name, topic, description }),
    }),

  /**
   * Delete a workspace by id.
   * Returns { deleted: true, workspace_id }
   */
  delete: (workspaceId) =>
    request(`/api/workspaces/${workspaceId}`, { method: 'DELETE' }),
}