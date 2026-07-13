/**
 * FollowUpThread.jsx
 * Location: src/components/Research/FollowUpThread.jsx
 *
 * Ask follow-up questions about a completed report without re-running the
 * whole 4-agent pipeline. Backed by POST/GET /api/history/{run_id}/followup(s)
 * — see agents.py's answer_followup() for how it's actually answered
 * (single grounded LLM call over the saved report + sources + thread history,
 * not a new search).
 *
 * Reuses the existing dash-chat and dash-msg CSS classes already built for
 * DashboardChat.jsx, so this looks like the same product, not a bolted-on
 * feature with its own one-off styling.
 */
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiClient } from '../../services/apiClient'

const SUGGESTIONS = [
  'Summarize the key risks in two sentences',
  'What sources support the main claim?',
  'Explain this like I\'m new to the topic',
  'What\'s missing from this report?',
]

export default function FollowUpThread({ runId }) {
  const [messages, setMessages] = useState([])
  const [threadLoaded, setThreadLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    apiClient.get(`/api/history/${runId}/followups`).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setMessages((res.data?.messages || []).map(m => ({ role: m.role, content: m.content })))
      }
      setThreadLoaded(true)
    })
    return () => { cancelled = true }
  }, [runId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(question) {
    const clean = question.trim()
    if (!clean || loading || !runId) return
    setError(null)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setMessages(prev => [...prev, { role: 'user', content: clean }])
    setLoading(true)

    const res = await apiClient.post(`/api/history/${runId}/followup`, { body: { question: clean } })

    setLoading(false)
    if (!res.ok) {
      setError(res.error || 'Something went wrong — please try again.')
      return
    }
    setMessages(prev => [...prev, { role: 'assistant', content: res.data.answer }])
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !loading) handleSend(input)
    }
  }

  function handleInput(e) {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px' }
  }

  if (!runId) return null

  return (
    <section className="dash-chat-panel" style={{ borderRadius: 14, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="dash-card-header">
        <span className="dash-card-icon">💬</span>
        <span className="dash-card-title">Ask a follow-up</span>
        <span className="dash-card-subtitle">Answered from this report — no new search</span>
      </div>

      <div className="dash-chat-messages" style={{ minHeight: 120, maxHeight: 380 }}>
        {!threadLoaded ? null : messages.length === 0 ? (
          <div className="dash-chat-empty">
            <p className="dash-chat-empty-text">Ask anything about this report — it won't re-run the pipeline.</p>
            <div className="dash-chat-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="dash-chat-suggestion" onClick={() => handleSend(s)} disabled={loading}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => <FollowUpMessage key={i} message={msg} />)
        )}
        {loading && <FollowUpMessage message={{ role: 'assistant', content: '', streaming: true }} />}
        {error && <p className="dash-error dash-chat-error">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="dash-chat-input-area">
        <textarea
          ref={textareaRef}
          className="dash-chat-textarea"
          rows={1}
          placeholder="Ask a question about this report…"
          value={input}
          onChange={handleInput}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          className="dash-chat-send"
          onClick={() => input.trim() && !loading && handleSend(input)}
          disabled={!input.trim() || loading}
        >
          {loading ? <SpinnerIcon /> : <SendIcon />}
        </button>
      </div>
    </section>
  )
}

function FollowUpMessage({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`dash-msg ${isUser ? 'dash-msg--user' : 'dash-msg--assistant'}`}>
      <div className={`dash-msg-avatar ${isUser ? 'dash-msg-avatar--user' : 'dash-msg-avatar--bot'}`}>
        {isUser ? 'U' : '✦'}
      </div>
      <div className={`dash-msg-bubble ${isUser ? 'dash-msg-bubble--user' : 'dash-msg-bubble--assistant'}`}>
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