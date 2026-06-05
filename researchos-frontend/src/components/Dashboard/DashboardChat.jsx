import ReactMarkdown from 'react-markdown'
import remarkGfm     from 'remark-gfm'
import { useRef, useEffect } from 'react'

const SUGGESTIONS = [
  'What\'s the weather in Tokyo?',
  'Is it safe to travel to Morocco?',
  'Latest headlines on AI regulation',
  'Compare weather in London vs Paris',
  'Travel safety for solo female travellers in Vietnam',
]

export function DashboardChat({ messages, input, setInput, loading, error, onSend }) {
  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !loading) onSend(input)
    }
  }

  function handleInput(e) {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px' }
  }

  return (
    <div className="dash-chat-panel">
      <div className="dash-card-header">
        <span className="dash-card-icon">🤖</span>
        <span className="dash-card-title">AI Assistant</span>
        <span className="dash-card-subtitle">Ask about weather, news, travel safety</span>
      </div>

      {/* Messages */}
      <div className="dash-chat-messages">
        {messages.length === 0 ? (
          <div className="dash-chat-empty">
            <p className="dash-chat-empty-text">Ask me anything about weather, travel safety, or current news.</p>
            <div className="dash-chat-suggestions">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  className="dash-chat-suggestion"
                  onClick={() => onSend(s)}
                  disabled={loading}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <DashChatMessage key={i} message={msg} />
          ))
        )}
        {error && <p className="dash-error dash-chat-error">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="dash-chat-input-area">
        <textarea
          ref={textareaRef}
          className="dash-chat-textarea"
          rows={1}
          placeholder="Ask about weather, travel, headlines…"
          value={input}
          onChange={handleInput}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          className="dash-chat-send"
          onClick={() => input.trim() && !loading && onSend(input)}
          disabled={!input.trim() || loading}
        >
          {loading ? <SpinnerIcon /> : <SendIcon />}
        </button>
      </div>
    </div>
  )
}

function DashChatMessage({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`dash-msg ${isUser ? 'dash-msg--user' : 'dash-msg--assistant'}`}>
      <div className={`dash-msg-avatar ${isUser ? 'dash-msg-avatar--user' : 'dash-msg-avatar--bot'}`}>
        {isUser ? 'U' : '✦'}
      </div>
      <div className={`dash-msg-bubble ${isUser ? 'dash-msg-bubble--user' : 'dash-msg-bubble--assistant'}${message.error ? ' dash-msg-bubble--error' : ''}`}>
        {isUser ? (
          <p>{message.content}</p>
        ) : message.streaming && !message.content ? (
          <div className="chat-thinking">
            <span className="chat-thinking-dot" style={{ animationDelay: '0ms' }} />
            <span className="chat-thinking-dot" style={{ animationDelay: '150ms' }} />
            <span className="chat-thinking-dot" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <div className="dash-msg-content report-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            {message.streaming && <span className="chat-cursor" />}
          </div>
        )}
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
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
