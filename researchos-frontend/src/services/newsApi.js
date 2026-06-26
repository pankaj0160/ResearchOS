/**
 * newsApi.js
 *
 * LOCATION: src/services/newsApi.js
 *
 * Handles: news search, tracked topics CRUD.
 * Note: /api/news/summarize is an SSE stream — handled in the hook directly.
 */

import { apiClient } from './apiClient.js'

/**
 * Category filters for news search.
 * `value` must match whatever your backend's `category` query param expects
 * (e.g. NewsAPI-style categories). Update this list if your backend supports
 * a different/larger set — UI and API stay in sync automatically since both
 * the pills and apiClient.get(...) consume this single array.
 */
export const CATEGORIES = [
  { value: 'general',       label: 'General',       icon: '📰' },
  { value: 'business',      label: 'Business',       icon: '💼' },
  { value: 'technology',    label: 'Technology',     icon: '💻' },
  { value: 'science',       label: 'Science',        icon: '🔬' },
  { value: 'health',        label: 'Health',         icon: '🩺' },
  { value: 'sports',        label: 'Sports',         icon: '🏆' },
  { value: 'entertainment', label: 'Entertainment',  icon: '🎬' },
  { value: 'politics',      label: 'Politics',       icon: '🏛️' },
]

export const newsApi = {

  /** Search for news articles on a topic */
  search: (topic, category = 'general', days = 7) =>
    apiClient.get(
      `/api/news/search?topic=${encodeURIComponent(topic)}&category=${category}&days=${days}`
    ),

    /** Stream an AI summary for a topic via SSE */
    summarize: (topic, category = 'general', days = 7, callbacks = {}) => {
      const { onArticles, onChunk, onDone, onError } = callbacks

      const token = localStorage.getItem('researchos_token') ?? ''
      const url = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/news/summarize` +
        `?topic=${encodeURIComponent(topic)}&category=${encodeURIComponent(category)}&days=${days}`

      return new Promise((resolve) => {
        const es = new EventSource(`${url}&token=${encodeURIComponent(token)}`)

        es.addEventListener('articles', (e) => {
          try {
            const arts = JSON.parse(e.data)
            onArticles?.(arts)
          } catch { /* malformed JSON — ignore */ }
        })

        es.addEventListener('chunk', (e) => {
          onChunk?.(e.data)
        })

        es.addEventListener('done', () => {
          es.close()
          onDone?.()
          resolve()
        })

        es.addEventListener('error', (e) => {
          es.close()
          const msg = e.data ?? 'News search failed. Please try again.'
          onError?.(msg)
          resolve()
        })

        // Native SSE onerror fires on connection drop / non-2xx
        es.onerror = () => {
          es.close()
          onError?.('Connection lost. Please try again.')
          resolve()
        }
      })
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