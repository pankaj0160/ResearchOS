import ReactMarkdown from 'react-markdown'
import remarkGfm     from 'remark-gfm'

/**
 * ChatMessage — renders one message bubble.
 * Assistant messages support:
 *  - Streamed markdown (renders progressively)
 *  - Source citation chips (page number + snippet)
 *  - Streaming cursor animation
 *  - Error state styling
 */
export function ChatMessage({ message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--assistant'}`}>

      {/* Avatar */}
      <div className={`chat-avatar ${isUser ? 'chat-avatar--user' : 'chat-avatar--assistant'}`}>
        {isUser ? <UserIcon /> : <BotIcon />}
      </div>

      {/* Bubble */}
      <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--assistant'}${message.error ? ' chat-bubble--error' : ''}`}>

        {isUser ? (
          <p className="chat-user-text">{message.content}</p>
        ) : (
          <>
            {/* Streaming skeleton while empty */}
            {message.streaming && !message.content ? (
              <div className="chat-thinking">
                <span className="chat-thinking-dot" style={{ animationDelay: '0ms' }} />
                <span className="chat-thinking-dot" style={{ animationDelay: '150ms' }} />
                <span className="chat-thinking-dot" style={{ animationDelay: '300ms' }} />
              </div>
            ) : (
              <div className="chat-assistant-text report-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
                {message.streaming && <span className="chat-cursor" />}
              </div>
            )}

            {/* Source citation chips */}
            {message.sources && message.sources.length > 0 && !message.streaming && (
              <div className="chat-sources">
                <p className="chat-sources-label">Sources</p>
                <div className="chat-sources-list">
                  {message.sources.map((src, i) => (
                    <SourceChip key={i} source={src} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SourceChip({ source }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <button
      className={`source-chip${expanded ? ' source-chip--expanded' : ''}`}
      onClick={() => setExpanded(v => !v)}
    >
      <span className="source-chip-page">p.{source.page}</span>
      {expanded && <span className="source-chip-snippet">{source.snippet}</span>}
      <span className="source-chip-score">{Math.round(source.score * 100)}%</span>
    </button>
  )
}

// We need useState for SourceChip — import it
import { useState } from 'react'

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function BotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v4"/>
      <line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>
    </svg>
  )
}
