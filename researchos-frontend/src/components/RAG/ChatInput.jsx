import { useRef } from 'react'

const SUGGESTED = [
  'Summarize this document',
  'What are the main findings?',
  'What are the key conclusions?',
  'List all important dates or figures',
]

export function ChatInput({ value, onChange, onSend, disabled, sessionActive }) {

  const textareaRef = useRef(null)

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) onSend(value)
    }
  }

  function handleInput(e) {
    onChange(e.target.value)
    // Auto-resize textarea
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }
  }

  return (
    <div className="chat-input-area">
      {/* Suggested prompts — shown only when session is active and chat is empty */}
      {sessionActive && (
        <div className="chat-suggestions">
          {SUGGESTED.map(q => (
            <button
              key={q}
              className="chat-suggestion-chip"
              onClick={() => onSend(q)}
              disabled={disabled}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          rows={1}
          placeholder={sessionActive ? 'Ask a question about your PDF…' : 'Upload a PDF to start chatting'}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled || !sessionActive}
        />
        <button
          className={`chat-send-btn${disabled ? ' chat-send-btn--loading' : ''}`}
          onClick={() => { if (value.trim() && !disabled) onSend(value) }}
          disabled={disabled || !sessionActive || !value.trim()}
          aria-label="Send message"
        >
          {disabled ? <SpinnerIcon /> : <SendIcon />}
        </button>
      </div>
      <p className="chat-input-hint">Enter to send · Shift+Enter for new line</p>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  )
}
