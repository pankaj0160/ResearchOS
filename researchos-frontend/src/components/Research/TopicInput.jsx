/**
 * TopicInput.jsx
 * Location: src/components/Research/TopicInput.jsx
 *
 * The primary interaction on the Research page — where a topic gets
 * typed in and the pipeline launched. Previously a plain Tailwind
 * slate/indigo form (the generic "AI SaaS input box" look). Rewritten
 * to the app's real design system, with focus/hover states tied to
 * --accent instead of a hardcoded indigo ring.
 */
import { memo, useCallback, useState } from 'react'

const SUGGESTIONS = [
  'AI in healthcare 2026',
  'Quantum computing breakthroughs',
  'Climate tech innovations',
  'Autonomous vehicle progress',
]

// Mirrors FOCUS_MODES in backend/agents.py — keep labels/order in sync.
const FOCUS_MODES = [
  { value: 'balanced', label: 'Balanced', hint: 'Default depth and tone' },
  { value: 'quick', label: 'Quick', hint: 'Shorter report, fewer sources' },
  { value: 'academic', label: 'Academic', hint: 'Formal tone, prioritizes primary sources' },
  { value: 'news', label: 'News', hint: 'Recency-weighted, briefing style' },
  { value: 'technical', label: 'Technical', hint: 'Mechanisms and specifics over summaries' },
]

function TopicInput({ onStart, onClear, isRunning, canRetry, onRetry, currentTopic }) {
  const [topic, setTopic] = useState('')
  const [focused, setFocused] = useState(false)
  const [focusMode, setFocusMode] = useState('balanced')

  const submit = useCallback((event) => {
    event.preventDefault()
    const cleanTopic = topic.trim()
    if (cleanTopic && !isRunning) onStart(cleanTopic, focusMode)
  }, [isRunning, onStart, topic, focusMode])

  const clear = useCallback(() => {
    setTopic('')
    onClear()
  }, [onClear])

  return (
    <section style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)', padding: '1.35rem' }}>
      <div className="topic-input-head" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', margin: 0 }}>Research Card</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Enter a topic and launch the multi-agent pipeline.</p>
        </div>
        {currentTopic && (
          <span style={{ borderRadius: 99, background: 'var(--bg-inset)', border: '1px solid var(--border)', padding: '4px 12px', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Current: {currentTopic}
          </span>
        )}
      </div>

      <form onSubmit={submit} className="topic-input-form" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label className="sr-only" htmlFor="topic">Research topic</label>
        <input
          id="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={isRunning}
          placeholder="Enter a research topic..."
          style={{
            flex: '1 1 240px',
            minHeight: 46,
            borderRadius: 10,
            border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
            boxShadow: focused ? '0 0 0 4px var(--accent-dim)' : 'none',
            background: isRunning ? 'var(--bg-inset)' : 'var(--bg-base)',
            padding: '0 16px',
            fontSize: 15,
            color: 'var(--text-primary)',
            outline: 'none',
            fontFamily: 'var(--font-body)',
            transition: 'border-color 0.18s, box-shadow 0.18s',
          }}
        />
        <button
          type="submit"
          disabled={!topic.trim() || isRunning}
          style={{
            minHeight: 46, borderRadius: 10, padding: '0 22px',
            fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)',
            color: !topic.trim() || isRunning ? 'var(--text-faint)' : '#fff',
            background: !topic.trim() || isRunning ? 'var(--bg-inset)' : 'var(--accent)',
            border: 'none', cursor: !topic.trim() || isRunning ? 'not-allowed' : 'pointer',
            transition: 'filter 0.15s',
          }}
          onMouseEnter={e => { if (!e.target.disabled) e.currentTarget.style.filter = 'brightness(1.08)' }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}
        >
          {isRunning ? 'Running…' : 'Start Research'}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={isRunning && !currentTopic}
          className="topic-input-secondary-btn"
          style={{
            minHeight: 46, borderRadius: 10, padding: '0 20px',
            fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)',
            color: 'var(--text-secondary)', background: 'transparent',
            border: '1.5px solid var(--border)',
            cursor: isRunning && !currentTopic ? 'not-allowed' : 'pointer',
            opacity: isRunning && !currentTopic ? 0.5 : 1,
          }}
        >
          Clear
        </button>
        {canRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              minHeight: 46, borderRadius: 10, padding: '0 20px',
              fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)',
              color: 'var(--danger)', background: 'var(--danger-subtle)',
              border: '1.5px solid var(--danger)', cursor: 'pointer',
            }}
          >
            Retry
          </button>
        )}
      </form>

      <div role="radiogroup" aria-label="Focus mode" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', alignSelf: 'center', marginRight: 4 }}>
          Focus:
        </span>
        {FOCUS_MODES.map((mode) => {
          const isSelected = focusMode === mode.value
          return (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              title={mode.hint}
              disabled={isRunning}
              onClick={() => setFocusMode(mode.value)}
              className="focus-mode-chip"
              style={{
                borderRadius: 99,
                border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                background: isSelected ? 'var(--accent-dim)' : 'var(--bg-inset)',
                color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: isSelected ? 700 : 500,
                cursor: isRunning ? 'not-allowed' : 'pointer',
                opacity: isRunning ? 0.6 : 1,
                transition: 'all 0.16s',
              }}
            >
              {mode.label}
            </button>
          )
        })}
      </div>

      {!isRunning && !topic && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setTopic(suggestion)}
              className="topic-suggestion-chip"
              style={{
                borderRadius: 99, border: '1px solid var(--border)', padding: '6px 13px',
                fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
                background: 'var(--bg-inset)', cursor: 'pointer', transition: 'all 0.18s',
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default memo(TopicInput)