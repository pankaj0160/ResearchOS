/**
 * calendarApi.js
 *
 * LOCATION: src/services/calendarApi.js
 *
 * Handles: real calendar events (deadlines, reminders, meetings) — distinct
 * from the activity feed (/api/activity), which is an automatic log of what
 * other features did. This talks to the new /api/calendar/* routes added in
 * routers/calendar_router.py.
 *
 * Timestamps: all start/end times are unix seconds (JS Date.getTime() / 1000)
 * to match what the backend stores and what activity_events already uses —
 * keeps CalendarPage's date-bucketing logic identical for both event sources.
 */

import { apiClient } from './apiClient.js'

export const calendarApi = {

  /**
   * List events, optionally scoped to a time range and/or workspace.
   * @param {object} opts
   * @param {number|null} [opts.start] - unix seconds, inclusive lower bound
   * @param {number|null} [opts.end]   - unix seconds, inclusive upper bound
   * @param {number|null} [opts.workspaceId] - scope to one workspace; null = all
   */
  list: ({ start = null, end = null, workspaceId = null } = {}) => {
    const params = new URLSearchParams()
    if (start != null)       params.set('start', String(start))
    if (end != null)         params.set('end', String(end))
    if (workspaceId != null) params.set('workspace_id', String(workspaceId))
    const qs = params.toString()
    return apiClient.get(`/api/calendar/events${qs ? `?${qs}` : ''}`)
  },

  /**
   * Create a new calendar event.
   * @param {object} event
   * @param {string} event.title
   * @param {number} event.startTime   - unix seconds
   * @param {number|null} [event.endTime] - unix seconds; null = point-in-time event
   * @param {string} [event.description]
   * @param {boolean} [event.allDay]
   * @param {string} [event.color] - hex color, e.g. "#3B82F6"
   * @param {number|null} [event.workspaceId]
   */
  create: ({ title, startTime, endTime = null, description = '', allDay = false, color = '#3B82F6', workspaceId = null }) =>
    apiClient.post('/api/calendar/events', {
      body: {
        title,
        description,
        start_time:   startTime,
        end_time:     endTime,
        all_day:      allDay,
        color,
        workspace_id: workspaceId,
      },
    }),

  /**
   * Update an existing event. Only pass the fields you want changed —
   * everything else is left untouched. Pass `null` explicitly to clear
   * end_time or workspace_id.
   */
  update: (eventId, changes) => {
    const body = {}
    if ('title'       in changes) body.title        = changes.title
    if ('description' in changes) body.description  = changes.description
    if ('startTime'   in changes) body.start_time    = changes.startTime
    if ('endTime'     in changes) body.end_time      = changes.endTime
    if ('allDay'      in changes) body.all_day       = changes.allDay
    if ('color'       in changes) body.color         = changes.color
    if ('workspaceId' in changes) body.workspace_id  = changes.workspaceId
    return apiClient.patch(`/api/calendar/events/${eventId}`, { body })
  },

  /** Delete an event by id */
  delete: (eventId) =>
    apiClient.delete(`/api/calendar/events/${eventId}`),
}

export default calendarApi