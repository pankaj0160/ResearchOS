/**
 * api.js
 *
 * LOCATION: src/services/api.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED:
 * Replaced the hand-written apiFetch() wrapper with apiClient.
 * All error handling, auth headers, and toast notifications are now
 * handled automatically by apiClient.js.
 *
 * Handles: research history CRUD, health check.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { apiClient } from './apiClient.js'

export const api = {

  // ── History ──────────────────────────────────────────────────────────────

  /** Fetch all past research runs for the logged-in user */
  getHistory: () =>
    apiClient.get('/api/history'),

  /** Fetch one research run by id */
  getRun: (id) =>
    apiClient.get(`/api/history/${id}`),

  /** Delete a research run */
  deleteRun: (id) =>
    apiClient.delete(`/api/history/${id}`),

  /** Search history by keyword */
  searchHistory: (query, limit = 20) =>
    apiClient.get(`/api/history/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  /** Export a run as markdown — returns the raw Response for file download */
  exportRun: (id) =>
    apiClient.get(`/api/history/${id}/export`),

  /** Get related content for a run */
  getRelated: (id) =>
    apiClient.get(`/api/history/${id}/related`),

  /** Unified history — research runs + RAG sessions merged by date */
  getUnifiedHistory: (limit = 50) =>
    apiClient.get(`/api/history/unified?limit=${limit}`),

  // ── Health ────────────────────────────────────────────────────────────────

  /** Health check — used to verify the backend is alive */
  health: () =>
    apiClient.get('/api/health', { skipAuth: true }),
}

export default api