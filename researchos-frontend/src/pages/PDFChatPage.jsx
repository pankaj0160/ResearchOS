import { useEffect, useRef } from 'react'
import { usePDFChat } from '../hooks/usePDFChat'
import { PDFUploadZone } from '../components/RAG/PDFUploadZone'
import { SessionSidebar } from '../components/RAG/SessionSidebar'
import { ChatMessage } from '../components/RAG/ChatMessage'
import { ChatInput } from '../components/RAG/ChatInput'

export default function PDFChatPage() {
  const {
    // upload
    uploading, uploadProgress, uploadError, uploadFile,
    // sessions
    session, sessions, loadSessions, switchSession, deleteSession,
    // chat
    messages, input, setInput, responding, chatError, sendMessage, clearChat, reset,
    // refs
    bottomRef,
  } = usePDFChat()

  // Load user's sessions on mount
  useEffect(() => { loadSessions() }, [loadSessions])

  function handleNewUpload() {
    reset()
  }

  return (
    <div className="rag-page">

      {/* ── Page header ── */}
      <div className="rag-page-header">
        <div>
          <h1 className="page-title">
            <span className="page-title-icon">📄</span>
            PDF Chat
          </h1>
          <p className="page-subtitle">
            Upload a document and ask anything — answers cite the exact page.
          </p>
        </div>
        {session && (
          <div className="rag-header-actions">
            <button className="rag-clear-btn" onClick={clearChat} title="Clear chat history">
              <ClearIcon /> Clear chat
            </button>
          </div>
        )}
      </div>

      {/* ── Main split layout ── */}
      <div className="rag-layout">

        {/* ── Left: session sidebar ── */}
        <aside className="rag-sidebar-col">
          <SessionSidebar
            session={session}
            sessions={sessions}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadError={uploadError}
            onFile={uploadFile}
            onSwitch={switchSession}
            onDelete={deleteSession}
            onNewUpload={handleNewUpload}
          />
        </aside>

        {/* ── Right: chat panel ── */}
        <div className="rag-chat-col">

          {!session ? (
            // ── No session: full-area upload prompt ──
            <div className="rag-empty-state">
              <div className="rag-empty-icon">📄</div>
              <h2 className="rag-empty-title">No document loaded</h2>
              <p className="rag-empty-desc">
                Upload a PDF on the left to start chatting with it.
                Answers will cite specific page numbers from your document.
              </p>
              <div className="rag-empty-features">
                {[
                  { icon: '🔍', text: 'Semantic search across all pages' },
                  { icon: '📝', text: 'Structured markdown answers' },
                  { icon: '🔗', text: 'Page-level source citations' },
                  { icon: '💬', text: 'Multi-turn conversation memory' },
                ].map(f => (
                  <div key={f.text} className="rag-empty-feature">
                    <span>{f.icon}</span> {f.text}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // ── Active session: chat messages ──
            <div className="rag-chat-window">
              <div className="rag-messages">

                {messages.length === 0 ? (
                  <div className="rag-chat-welcome">
                    <div className="rag-chat-welcome-icon">💬</div>
                    <h3 className="rag-chat-welcome-title">
                      Ready to chat with <em>{session.filename}</em>
                    </h3>
                    <p className="rag-chat-welcome-desc">
                      {session.page_count} pages · {session.chunk_count} chunks indexed
                    </p>
                    <p className="rag-chat-welcome-hint">
                      Ask anything below, or pick a suggested question.
                    </p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <ChatMessage key={msg.id} message={msg} />
                  ))
                )}

                {chatError && (
                  <div className="rag-chat-error">
                    <ErrorIcon /> {chatError}
                  </div>
                )}

                {/* scroll anchor */}
                <div ref={bottomRef} />
              </div>

              <ChatInput
                value={input}
                onChange={setInput}
                onSend={sendMessage}
                disabled={responding}
                sessionActive={!!session}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ClearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
