/**
 * dashboardApi.js
 * Location: src/services/dashboardApi.js
 *
 * Handles all dashboard API calls:
 *   - Weather (Open-Meteo via backend)
 *   - Headlines (Tavily via backend)
 *   - Travel Safety (AI via backend)
 *   - Chat (SSE stream via fetch — NOT EventSource, needs auth header)
 *
 * Why fetch() for chat instead of EventSource?
 *   EventSource cannot send Authorization headers.
 *   Our backend requires "Authorization: Bearer <token>" on every request.
 *   fetch() with a ReadableStream reader solves this cleanly.
 */

import { apiClient }    from './apiClient.js'
import { API_BASE_URL } from './config.js'
import { getToken }     from './tokenStorage.js'

export const dashboardApi = {

  /** Current weather for a city — returns { temp_c, feels_like_c, condition, ... } */
  getWeather: (city) =>
    apiClient.get(`/api/dashboard/weather?city=${encodeURIComponent(city)}`),

  /** Top headlines for a topic — returns { headlines: [...], topic } */
  getHeadlines: (topic = 'world news') =>
    apiClient.get(`/api/dashboard/headlines?topic=${encodeURIComponent(topic)}`),

  /** Travel safety briefing — returns { destination, analysis } */
  getTravelSafety: (destination) =>
    apiClient.get(`/api/dashboard/travel-safety?destination=${encodeURIComponent(destination)}`),

  /**
   * Dashboard AI chat — streams response via SSE using fetch().
   *
   * Why fetch() not EventSource?
   *   EventSource is browser-native SSE but cannot send custom headers.
   *   Our /api/dashboard/chat requires Authorization: Bearer <token>.
   *   fetch() supports headers + ReadableStream = manual SSE reading.
   *
   * @param {string} query  - user's message
   * @param {object} callbacks
   *   onChunk(chunk: string)  - called for each streamed text piece
   *   onDone()                - called when stream ends cleanly
   *   onError(msg: string)    - called on network or server error
   */
  chat: async (query, { onChunk, onDone, onError } = {}) => {
    const token = getToken() || ''
    const url   = `${API_BASE_URL}/api/dashboard/chat`

    let response
    try {
      response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept':        'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({ query }),
      })
    } catch (networkErr) {
      onError?.(`Network error — is the backend running? (${networkErr.message})`)
      return
    }

    if (!response.ok) {
      try {
        const errBody = await response.json()
        const msg = errBody?.detail?.message || errBody?.message || `Server error ${response.status}`
        onError?.(msg)
      } catch {
        onError?.(`Server error ${response.status}`)
      }
      return
    }

    // Read the SSE stream byte-by-byte
    const reader  = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let   buffer  = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE messages are separated by double newlines
        const messages = buffer.split('\n\n')
        buffer = messages.pop() ?? ''  // keep incomplete last chunk

        for (const msg of messages) {
          if (!msg.trim()) continue

          const dataLine = msg.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue

          const jsonStr = dataLine.slice(6).trim()
          if (!jsonStr) continue

          let parsed
          try { parsed = JSON.parse(jsonStr) } catch { continue }

          switch (parsed.type) {
            case 'chunk':
              onChunk?.(parsed.chunk || '')
              break
            case 'done':
              onDone?.()
              return
            case 'error':
              onError?.(parsed.msg || 'Chat error')
              return
            default:
              break
          }
        }
      }
    } catch (readErr) {
      onError?.(`Stream interrupted: ${readErr.message}`)
    } finally {
      reader.cancel()
    }

    // Stream ended without explicit done event — treat as done
    onDone?.()
  },
}

export default dashboardApi