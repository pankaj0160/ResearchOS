/**
 * activityApi.js
 *
 * LOCATION: src/services/activityApi.js
 *
 * Handles: activity feed for the Dashboard.
 */

import { apiClient } from './apiClient.js'

export const activityApi = {

  /** Get recent activity events for the logged-in user */
  getRecent: (limit = 20) =>
    apiClient.get(`/api/activity?limit=${limit}`),
}

export default activityApi