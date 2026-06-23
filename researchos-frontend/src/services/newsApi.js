
import { API_BASE_URL } from './config.js'
const BASE = API_BASE_URL

function authHeaders() {
  const token = localStorage.getItem('researchos_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeaders() } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.detail ?? `Request failed (${res.status})`
    throw new Error(Array.isArray(msg) ? msg.map(e => e.msg).join(', ') : msg)
  }
  return data
}

export const CATEGORIES = [
  { value: 'general',    label: 'General',    icon: '🌐' },
  { value: 'technology', label: 'Technology', icon: '💻' },
  { value: 'finance',    label: 'Finance',    icon: '📈' },
  { value: 'science',    label: 'Science',    icon: '🔬' },
  { value: 'health',     label: 'Health',     icon: '🏥' },
  { value: 'politics',   label: 'Politics',   icon: '🏛' },
  { value: 'business',   label: 'Business',   icon: '💼' },
  { value: 'world',      label: 'World',      icon: '🗺' },
  { value: 'sports',     label: 'Sports',     icon: '⚽' },
]

export const newsApi = {
  /** Fetch articles only (no summary) */
  search: (topic, category = 'general', days = 7) =>
    get(`/api/news/search?topic=${encodeURIComponent(topic)}&category=${category}&days=${days}`),

  /**
   * Fetch articles + stream AI summary.
   * Calls: onArticles(articles[]), onChunk(text), onDone(count), onError(msg)
   */
    async summarize(topic, category = 'general', days = 7, { onArticles, onChunk, onDone, onError } = {}) {
    const url = `${BASE}/api/news/summarize?topic=${encodeURIComponent(topic)}&category=${category}&days=${days}`
    const res = await fetch(url, { headers: { ...authHeaders() } })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      onError?.(err?.detail ?? `News request failed (${res.status})`)
      return
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if      (event.type === 'articles') onArticles?.(event.articles)
          else if (event.type === 'chunk')    onChunk?.(event.chunk)
          else if (event.type === 'done')     onDone?.(event.article_count)
          else if (event.type === 'error')    onError?.(event.msg)
        } catch {}
      }
    }
  },

  // ── NEW: Topic tracking ──────────────────────────────────────────────────────

  getTracked: () => get('/api/news/tracked'),

  track: (topic, category = 'general', workspaceId = null) => {
    const token = localStorage.getItem('researchos_token')

    return fetch(`${BASE}/api/news/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        topic,
        category,
        workspace_id: workspaceId,
      }),
    }).then(r => r.json())
  },

  untrack: (topicId) => {
    const token = localStorage.getItem('researchos_token')

    return fetch(`${BASE}/api/news/tracked/${topicId}`, {
      method: 'DELETE',
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    }).then(r => r.json())
  },
}
