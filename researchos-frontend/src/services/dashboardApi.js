/**
 * dashboardApi.js
 *
 * LOCATION: src/services/dashboardApi.js
 *
 * Handles: weather, headlines, travel safety.
 * Note: /api/dashboard/chat is an SSE stream — handled in useDashboard hook.
 */

import { apiClient } from './apiClient.js'

export const dashboardApi = {

  /** Get current weather for a city */
  getWeather: (city) =>
    apiClient.get(`/api/dashboard/weather?city=${encodeURIComponent(city)}`),

  /** Get top news headlines for a topic */
  getHeadlines: (topic = 'world news') =>
    apiClient.get(`/api/dashboard/headlines?topic=${encodeURIComponent(topic)}`),

  /** Get travel safety briefing for a destination */
  getTravelSafety: (destination) =>
    apiClient.get(`/api/dashboard/travel-safety?destination=${encodeURIComponent(destination)}`),
}

export default dashboardApi