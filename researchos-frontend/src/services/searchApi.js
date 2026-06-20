/**
 * searchApi.js
 * Global search (Cmd+K) and history full-text search.
 * Powers the CommandPalette component built on Day 4.
 */

const BASE = import.meta.env.VITE_API_URL ?? ''

function authHeaders() {
  const token = localStorage.getItem('researchos_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function get(path) {
  const res  = await fetch(`${BASE}${path}`, { headers: { ...authHeaders() } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.detail ?? `Request failed (${res.status})`
    throw new Error(Array.isArray(msg) ? msg.map(e => e.msg).join(', ') : msg)
  }
  return data
}

export const searchApi = {
  /**
   * Global search across all features.
   * @param {string} query - search string (min 2 chars)
   *
   * Returns:
   * {
   *   query: str,
   *   total: number,
   *   results: {
   *     research:   [{ type, id, title, subtitle, url }],
   *     pdf:        [{ type, id, title, subtitle, url }],
   *     news:       [{ type, id, title, subtitle, url }],
   *     workspaces: [{ type, id, title, subtitle, url }],
   *   }
   * }
   *
   * Used by: CommandPalette (Cmd+K) on Day 4
   */
  global: (query) =>
    get(`/api/search?q=${encodeURIComponent(query)}`),

  /**
   * Full-text search over research history (topic + report content).
   * @param {string} query - search string (min 2 chars)
   * @param {number} limit - max results (default 20)
   *
   * Returns:
   * {
   *   query: str,
   *   count: number,
   *   results: [{ id, topic, score, word_count, source_count, created_at, excerpt }]
   * }
   *
   * Used by: history search input built on Day 7
   */
  history: (query, limit = 20) =>
    get(`/api/history/search?q=${encodeURIComponent(query)}&limit=${limit}`),
}