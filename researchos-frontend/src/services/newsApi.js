/**
 * newsApi.js
 * Location: src/services/newsApi.js
 *
 * Key fix: summarize() now uses fetch() with a manual SSE reader instead of
 * EventSource. Why? EventSource CANNOT send custom headers (like Authorization).
 * Our backend requires "Authorization: Bearer <token>" on every request.
 * fetch() supports headers + we can read the stream chunk by chunk manually.
 *
 * SSE format our backend sends (from news_router.py):
 *   data: {"type": "articles", "articles": [...], "count": 5}
 *   data: {"type": "chunk", "chunk": "Some text..."}
 *   data: {"type": "done", "article_count": 5}
 *   data: {"type": "error", "msg": "Something failed"}
 */

import { apiClient } from './apiClient.js'
import { API_BASE_URL } from './config.js'

export const CATEGORIES = [
  { value: 'general',    label: 'General',    icon: '📰' },
  { value: 'business',   label: 'Business',   icon: '💼' },
  { value: 'technology', label: 'Technology', icon: '💻' },
  { value: 'science',    label: 'Science',    icon: '🔬' },
  { value: 'health',     label: 'Health',     icon: '🩺' },
  { value: 'sports',     label: 'Sports',     icon: '🏆' },
  { value: 'politics',   label: 'Politics',   icon: '🏛️' },
  { value: 'world',      label: 'World',      icon: '🌍' },
]

export const newsApi = {

  /** Search news articles — simple JSON response */
  search: (topic, category = 'general', days = 7) =>
    apiClient.get(
      `/api/news/search?topic=${encodeURIComponent(topic)}&category=${category}&days=${days}`
    ),

  /**
   * Stream an AI news briefing via SSE using fetch() (NOT EventSource).
   *
   * Why fetch() and not EventSource?
   *   EventSource is the browser's built-in SSE client but it CANNOT send
   *   custom headers. Our backend needs "Authorization: Bearer <token>".
   *   fetch() supports any headers + ReadableStream lets us read SSE manually.
   *
   * How SSE manual reading works:
   *   1. fetch() opens a persistent HTTP connection
   *   2. We read the stream byte by byte using a TextDecoder
   *   3. Each SSE message ends with "\n\n"
   *   4. We split on "\n\n", then on "data: " to get the JSON payload
   *   5. We parse the JSON and call the right callback
   */
  summarize: async (topic, category = 'general', days = 7, callbacks = {}) => {
    const { onArticles, onChunk, onDone, onError } = callbacks
    const token = localStorage.getItem('researchos_token') ?? ''

    const url = `${API_BASE_URL}/api/news/summarize` +
      `?topic=${encodeURIComponent(topic)}` +
      `&category=${encodeURIComponent(category)}` +
      `&days=${days}`

    let response
    try {
      response = await fetch(url, {
        method:  'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept':        'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
    } catch (networkErr) {
      onError?.('Network error — is the backend running?')
      return
    }

    if (!response.ok) {
      try {
        const errData = await response.json()
        onError?.(errData?.detail?.message || errData?.message || `Server error ${response.status}`)
      } catch {
        onError?.(`Server error ${response.status}`)
      }
      return
    }

    // ReadableStream reader — reads chunks of bytes as they arrive
    const reader  = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let   buffer  = ''   // accumulates partial SSE lines

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Decode this chunk and add to our buffer
        buffer += decoder.decode(value, { stream: true })

        // SSE messages are separated by double newlines "\n\n"
        const messages = buffer.split('\n\n')

        // Keep the last incomplete message in the buffer
        // (it might be split across two fetch chunks)
        buffer = messages.pop() ?? ''

        for (const msg of messages) {
          if (!msg.trim()) continue

          // Each SSE line starts with "data: "
          const dataLine = msg.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue

          const jsonStr = dataLine.slice(6).trim()  // remove "data: " prefix
          if (!jsonStr) continue

          let parsed
          try {
            parsed = JSON.parse(jsonStr)
          } catch {
            continue  // malformed JSON — skip this message
          }

          // Route to the right callback based on the "type" field
          switch (parsed.type) {
            case 'articles':
              // First event: article cards are ready, show them immediately
              onArticles?.(parsed.articles || [])
              break
            case 'chunk':
              // Summary text arriving word by word
              onChunk?.(parsed.chunk || '')
              break
            case 'done':
              // All done — stop spinner
              onDone?.()
              return
            case 'error':
              // Backend sent an error inside the stream
              onError?.(parsed.msg || 'An error occurred during summarization')
              return
            default:
              break
          }
        }
      }
    } catch (readErr) {
      onError?.('Stream interrupted. Please try again.')
    } finally {
      reader.cancel()
    }

    // Stream ended without explicit "done" event — treat as done
    onDone?.()
  },

  /** Get all tracked news topics for the user */
  getTracked: () =>
    apiClient.get('/api/news/tracked'),

  /** Add a topic to the tracked list */
  trackTopic: (topic, category = 'general', workspaceId = null) =>
    apiClient.post('/api/news/track', {
      body: { topic, category, workspace_id: workspaceId },
    }),

  /** Remove a topic from the tracked list */
  untrackTopic: (topicId) =>
    apiClient.delete(`/api/news/tracked/${topicId}`),
}

export default newsApi