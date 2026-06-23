/**
 * activityApi.js
 * Fetches the user's cross-feature activity feed.
 * Powers the Dashboard activity feed built on Day 6.
 */

import { API_BASE_URL } from './config.js'
const BASE = API_BASE_URL

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

export const activityApi = {
  /**
   * Fetch recent activity events for current user.
   * @param {number} limit - max events to return (1–50, default 20)
   * Returns { events: [{ id, event_type, payload, workspace_id, created_at }] }
   *
   * event_type values:
   *   'research_run'      → payload: { run_id, topic, word_count, rag_session_id }
   *   'pdf_upload'        → payload: { session_id, filename }
   *   'news_search'       → payload: { topic, category, article_count }
   *   'workspace_created' → payload: { workspace_id, name, topic }
   *   'text_ingested'     → payload: { session_id, title }
   */
  getRecent: (limit = 20) =>
    get(`/api/activity?limit=${limit}`),
}