/**
 * EventModal.jsx
 *
 * LOCATION: src/components/Calendar/EventModal.jsx
 *
 * Create/edit/delete UI for real calendar events. Styled to match
 * CreateWorkspaceModal.jsx (same overlay, card, and form conventions) so it
 * feels like part of the same product rather than a bolted-on feature.
 */

import { useEffect, useState } from 'react'

const COLOR_OPTIONS = [
  { value: '#3B82F6', label: 'Blue'   },
  { value: '#EF4444', label: 'Red'    },
  { value: '#10B981', label: 'Green'  },
  { value: '#F59E0B', label: 'Amber'  },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink'   },
]

// Convert a unix-seconds timestamp to the value a <input type="datetime-local"> expects,
// in the user's local timezone (not UTC — datetime-local has no timezone of its own).
function toLocalInputValue(unixSeconds) {
  const d = new Date(unixSeconds * 1000)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Convert a <input type="datetime-local"> value back to unix seconds.
function fromLocalInputValue(value) {
  if (!value) return null
  return Math.floor(new Date(value).getTime() / 1000)
}

function defaultStart() {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return Math.floor(d.getTime() / 1000)
}

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {object|null} event - existing event to edit, or null to create a new one
 * @param {(fields: object) => Promise<void>} onSave - called with { title, description, startTime, endTime, allDay, color }
 * @param {(eventId: number) => Promise<void>} [onDelete] - only relevant when editing
 * @param {string|null} defaultDateKey - "YYYY-MM-DD" to prefill when creating from a clicked day
 */
export function EventModal({ open, onClose, event = null, onSave, onDelete, defaultDateKey = null }) {
  const isEditing = !!event

  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [allDay,       setAllDay]     = useState(false)
  const [startInput,   setStartInput] = useState('')
  const [endInput,     setEndInput]   = useState('')
  const [color,        setColor]      = useState(COLOR_OPTIONS[0].value)
  const [saving,       setSaving]     = useState(false)
  const [deleting,     setDeleting]   = useState(false)
  const [error,        setError]      = useState('')

  // Reset form state whenever the modal opens (either for a fresh create or to edit a specific event)
  useEffect(() => {
    if (!open) return
    if (event) {
      setTitle(event.title || '')
      setDescription(event.description || '')
      setAllDay(!!event.all_day)
      setStartInput(toLocalInputValue(event.start_time))
      setEndInput(event.end_time != null ? toLocalInputValue(event.end_time) : '')
      setColor(event.color || COLOR_OPTIONS[0].value)
    } else {
      const start = defaultDateKey
        ? Math.floor(new Date(`${defaultDateKey}T09:00:00`).getTime() / 1000)
        : defaultStart()
      setTitle('')
      setDescription('')
      setAllDay(false)
      setStartInput(toLocalInputValue(start))
      setEndInput('')
      setColor(COLOR_OPTIONS[0].value)
    }
    setError('')
  }, [open, event, defaultDateKey])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }

    const startTime = fromLocalInputValue(startInput)
    if (startTime == null) { setError('Start date/time is required'); return }

    const endTime = endInput ? fromLocalInputValue(endInput) : null
    if (endTime != null && endTime < startTime) {
      setError('End time cannot be before start time')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        startTime,
        endTime,
        allDay,
        color,
      })
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!event || !onDelete) return
    setDeleting(true)
    setError('')
    try {
      await onDelete(event.id)
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to delete event')
      setDeleting(false)
    }
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '0.55rem 0.7rem',
    fontSize: 13.5,
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
  }

  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: 6,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px,96vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '1.5rem',
          boxShadow: 'var(--shadow-lg, 0 25px 60px rgba(0,0,0,0.35))',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', margin: 0 }}>
            {isEditing ? 'Edit Event' : 'New Event'}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit}>

          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Title *</label>
            <input
              style={inputStyle}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Resume deadline, mock interview"
              maxLength={200}
              autoFocus
            />
          </div>

          {/* All-day toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <input
              type="checkbox"
              id="event-all-day"
              checked={allDay}
              onChange={e => setAllDay(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            <label htmlFor="event-all-day" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              All-day event
            </label>
          </div>

          {/* Start / End */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Starts *</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                style={inputStyle}
                value={allDay ? startInput.slice(0, 10) : startInput}
                onChange={e => setStartInput(allDay ? `${e.target.value}T00:00` : e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Ends (optional)</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                style={inputStyle}
                value={allDay ? endInput.slice(0, 10) : endInput}
                onChange={e => setEndInput(e.target.value ? (allDay ? `${e.target.value}T00:00` : e.target.value) : '')}
              />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Any details worth remembering..."
              maxLength={2000}
            />
          </div>

          {/* Color */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.value)}
                  style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: c.value,
                    border: color === c.value ? '2px solid var(--text-primary)' : '2px solid transparent',
                    outline: color === c.value ? '2px solid var(--bg-card)' : 'none',
                    outlineOffset: -4,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: 14, padding: '0.6rem 0.8rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 12.5 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: isEditing ? 'space-between' : 'flex-end' }}>
            {isEditing && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                style={{
                  padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                  background: 'transparent', color: '#ef4444', fontSize: 13, fontWeight: 600,
                  cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <div style={{ display: 'flex', gap: 10, marginLeft: isEditing ? 0 : 'auto' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                style={{
                  padding: '0.6rem 1.1rem', borderRadius: 8, border: 'none',
                  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EventModal