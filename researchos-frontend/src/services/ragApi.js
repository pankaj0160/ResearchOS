/**
 * ragApi.js
 *
 * LOCATION: src/services/ragApi.js
 *
 * Handles: PDF upload, ingestion status polling, session list,
 *          chat streaming, chat history, session deletion, text ingest.
 *
 * NOTE ON STREAMING:
 * /api/rag/chat returns a streaming SSE response.
 * apiClient is not used for streaming — we use EventSource or raw fetch
 * for those because they need a ReadableStream, not parsed JSON.
 */

import { apiClient } from './apiClient.js'
import { API_BASE_URL } from './config.js'

export const ragApi = {

  // ── Sessions ──────────────────────────────────────────────────────────────

  /** Upload a PDF — returns immediately with status="processing" */
  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.upload('/api/rag/upload', form)
  },

  /** Poll this until status becomes "ready" or "error" */
  /** Get basic session status (ready / processing / error) */
  getStatus: (sessionId) =>
    apiClient.get(`/api/rag/status/${sessionId}`),

  /**
   * Poll /api/rag/progress/{id} until processing is complete.
   * Calls onProgress(pct, stage) on every poll tick.
   * Resolves with the final session object when status becomes 'ready'.
   *
   * This uses our new Week 2 progress endpoint that returns fine-grained
   * percentage info: { pct: 45, stage: "Embedding chunks 40-50 of 87..." }
   */
  waitUntilReady: async (sessionId, onProgress) => {
    const MAX_POLLS   = 180   // 3 minutes max (180 × 1s)
    const POLL_MS     = 1000  // check every 1 second

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_MS))

      try {
        // First try the fine-grained progress endpoint (Week 2)
        const progRes = await apiClient.get(`/api/rag/progress/${sessionId}`)
        const prog    = progRes.data || {}
        onProgress?.(prog.pct || 0, prog.stage || 'Processing...')

        if (prog.done && !prog.error) {
          // Done — fetch full session metadata and return it
          const statusRes = await apiClient.get(`/api/rag/status/${sessionId}`)
          return statusRes.data
        }
        if (prog.error) {
          throw new Error(prog.error)
        }
      } catch (progressErr) {
        // Progress endpoint not available — fall back to status polling
        try {
          const res  = await apiClient.get(`/api/rag/status/${sessionId}`)
          const data = res.data || {}
          const pct  = data.status === 'ready' ? 100 : Math.min(30 + i * 2, 90)
          onProgress?.(pct, data.status === 'ready' ? 'Ready!' : 'Processing...')
          if (data.status === 'ready') return data
          if (data.status === 'error') throw new Error(data.error_msg || 'Processing failed')
        } catch (statusErr) {
          if (i > 10) throw statusErr   // give up after 10 consecutive failures
        }
      }
    }
    throw new Error('PDF processing timed out after 3 minutes. Please try a smaller PDF.')
  },

  /** Get all PDF sessions for the logged-in user */
  getSessions: () =>
    apiClient.get('/api/rag/sessions'),

  /** Delete a session and its uploaded file */
  deleteSession: (sessionId) =>
    apiClient.delete(`/api/rag/session/${sessionId}`),

  /** Ingest plain text as a RAG session (no file upload needed) */
  ingestText: (title, content) =>
    apiClient.post('/api/rag/ingest-text', {
      body: { title, content },
    }),

  // ── Chat ──────────────────────────────────────────────────────────────────

  /**
   * Get the full conversation history for a session.
   * Returns list of { role: "user"|"assistant", content: string } messages.
   */
  getHistory: (sessionId) =>
    apiClient.get(`/api/rag/history/${sessionId}`),

  getRelated: (runId) =>
    apiClient.get(`/api/research/runs/${runId}/related`),

  /**
   * Stream a chat answer from the PDF.
   *
   * WHY RAW FETCH HERE (not apiClient):
   * The chat endpoint returns a streaming SSE response — a long-lived
   * connection that sends chunks one by one.
   * apiClient.post() reads the entire response as JSON before returning.
   * For streaming we need direct access to response.body (a ReadableStream).
   * So we use raw fetch here and handle the stream manually.
   *
   * @param {string} sessionId
   * @param {string} question
   * @param {function} onChunk   - called with each text chunk as it arrives
   * @param {function} onSources - called once with the source citations array
   * @param {function} onDone    - called when the stream finishes
   * @param {function} onError   - called if the stream errors
   */
  streamChat: async (sessionId, question, { onChunk, onSources, onDone, onError }) => {
    const token = localStorage.getItem('researchos_token') || ''

    let response
    try {
      response = await fetch(`${API_BASE_URL}/api/rag/chat`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, question }),
      })
    } catch {
      onError?.('Network error — cannot reach the server')
      return
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      onError?.(err.message || 'Chat request failed')
      return
    }

    // Read the SSE stream line by line
    const reader  = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text  = decoder.decode(value, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'sources') onSources?.(event.sources)
            if (event.type === 'chunk')   onChunk?.(event.chunk)
            if (event.type === 'done')    onDone?.()
            if (event.type === 'error')   onError?.(event.msg)
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } catch (streamError) {
      onError?.(streamError.message || 'Stream interrupted')
    }
  },
}

export default ragApi