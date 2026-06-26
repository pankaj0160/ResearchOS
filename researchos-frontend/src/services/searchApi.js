/**
 * searchApi.js
 *
 * LOCATION: src/services/searchApi.js
 *
 * Handles: global Cmd+K search across all features.
 */

import { apiClient } from './apiClient.js'

export const searchApi = {

  /**
   * Search across research runs, PDF sessions, news topics, workspaces.
   * Used by the CommandPalette (Cmd+K).
   */
  globalSearch: (query) =>
    apiClient.get(`/api/search?q=${encodeURIComponent(query)}`),
}

export default searchApi