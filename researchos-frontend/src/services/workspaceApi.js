/**
 * workspaceApi.js
 *
 * LOCATION: src/services/workspaceApi.js
 *
 * Handles: workspace CRUD operations.
 */

import { apiClient } from './apiClient.js'

export const workspaceApi = {

  /** Get all workspaces for the logged-in user */
  getAll: () =>
    apiClient.get('/api/workspaces'),

  /** Create a new workspace */
  create: (name, topic, description = '') =>
    apiClient.post('/api/workspaces', {
      body: { name, topic, description },
    }),

  /** Delete a workspace by id */
  delete: (workspaceId) =>
    apiClient.delete(`/api/workspaces/${workspaceId}`),
}

export default workspaceApi