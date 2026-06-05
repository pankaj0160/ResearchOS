const BASE = import.meta.env.VITE_API_URL ?? ''

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

export const dashboardApi = {
  /** GET /api/dashboard/weather?city= */
  getWeather: (city) =>
    get(`/api/dashboard/weather?city=${encodeURIComponent(city)}`),

  /** GET /api/dashboard/travel-safety?destination= */
  getTravelSafety: (destination) =>
    get(`/api/dashboard/travel-safety?destination=${encodeURIComponent(destination)}`),

  /** GET /api/dashboard/headlines?topic= */
  getHeadlines: (topic = 'world news') =>
    get(`/api/dashboard/headlines?topic=${encodeURIComponent(topic)}`),

  /**
   * POST /api/dashboard/chat — streams SSE
   * Calls onChunk(text), onDone(), onError(msg)
   */
  async chat(query, { onChunk, onDone, onError } = {}) {
    const res = await fetch(`${BASE}/api/dashboard/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ query }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      onError?.(err?.detail ?? `Chat failed (${res.status})`)
      return
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let   buffer  = ''

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
          if      (event.type === 'chunk') onChunk?.(event.chunk)
          else if (event.type === 'done')  onDone?.()
          else if (event.type === 'error') onError?.(event.msg)
        } catch { /* skip malformed */ }
      }
    }
  },
}
