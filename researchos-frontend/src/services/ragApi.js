const BASE = import.meta.env.VITE_API_URL ?? ''

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

export const ragApi = {
  /** Upload a PDF — returns { session_id, filename, page_count, chunk_count } */
  upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const fd  = new FormData()
      fd.append('file', file)

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
      })

      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300) resolve(data)
          else reject(new Error(data?.detail ?? `Upload failed (${xhr.status})`))
        } catch {
          reject(new Error('Invalid server response'))
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error during upload')))

      xhr.open('POST', `${BASE}/api/rag/upload`)
      const token = localStorage.getItem('researchos_token')
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.send(fd)
    })
  },

  /** List active sessions for current user */
  listSessions: () => request('/api/rag/sessions'),

  /** Get chat history for a session */
  getHistory: (sessionId) => request(`/api/rag/history/${sessionId}`),

  /** Delete a session + its ChromaDB collection */
  deleteSession: (sessionId) =>
    request(`/api/rag/session/${sessionId}`, { method: 'DELETE' }),

  /**
   * Stream a chat response.
   * Calls onSources(sources[]), onChunk(text), onDone(), onError(msg)
   */
  async chat(sessionId, question, { onSources, onChunk, onDone, onError }) {
    const token = localStorage.getItem('researchos_token')
    const res = await fetch(`${BASE}/api/rag/chat`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ session_id: sessionId, question }),
    })


    

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      onError?.(err?.detail ?? `Chat request failed (${res.status})`)
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
      buffer = lines.pop() ?? ''   // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'sources') onSources?.(event.sources)
          else if (event.type === 'chunk')  onChunk?.(event.chunk)
          else if (event.type === 'done')   onDone?.()
          else if (event.type === 'error')  onError?.(event.msg)
        } catch { /* skip malformed */ }
      }
    }
  },


  // Poll status until ready or error
  async pollStatus(sessionId, onProgress) {
  const maxAttempts = 60   // 60 × 2s = 2 minutes max
  let attempts = 0

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 2000))

    const token = localStorage.getItem('researchos_token')
    const res = await fetch(`${BASE}/api/rag/status/${sessionId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

    if (!res.ok) throw new Error('Status check failed')

    const data = await res.json()

    if (data.status === 'ready') return data
    if (data.status === 'error') throw new Error(data.error || 'Processing failed')

    attempts++
    if (onProgress) {
      const pct = Math.min(10 + (attempts / maxAttempts) * 80, 90)
      onProgress(Math.round(pct))
    }
  }

  throw new Error('Processing timed out. Please try again.')
},
}
