import { useEffect, useRef, useState } from 'react'
import { usePDFChat } from '../hooks/usePDFChat'
import { PDFUploadZone } from '../components/RAG/PDFUploadZone'
import { SessionSidebar } from '../components/RAG/SessionSidebar'
import { ChatMessage } from '../components/RAG/ChatMessage'
import { ChatInput } from '../components/RAG/ChatInput'

export default function PDFChatPage() {
  const {
    uploading, uploadProgress, uploadError, uploadFile,
    session, sessions, loadSessions, switchSession, deleteSession,
    messages, input, setInput, responding, chatError, sendMessage, clearChat, reset,
    bottomRef,
  } = usePDFChat()

  useEffect(() => { loadSessions() }, [loadSessions])

  // Mobile: toggle between sidebar panel and chat panel
  const [mobileView, setMobileView] = useState('chat') // 'sidebar' | 'chat'

  function handleNewUpload() {
    reset()
    setMobileView('sidebar')
  }

  // When session becomes active on mobile, switch to chat
  useEffect(() => {
    if (session) setMobileView('chat')
  }, [session?.id])

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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
          {/* Mobile panel toggle */}
          <div className="rag-mobile-toggle" style={{ display: 'none' }}>
            <button
              onClick={() => setMobileView(v => v === 'chat' ? 'sidebar' : 'chat')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                fontSize: '12.5px', fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {mobileView === 'chat' ? <><FilesIcon /> Documents</> : <><ChatIcon /> Chat</>}
            </button>
          </div>
          {session && (
            <button className="rag-clear-btn" onClick={clearChat}>
              <ClearIcon /> Clear chat
            </button>
          )}
        </div>
      </div>

      {/* ── Main split layout ── */}
      <div className="rag-layout">

        {/* ── Left: session sidebar ── */}
        <aside
          className="rag-sidebar-col"
          data-mobile-visible={mobileView === 'sidebar' ? 'true' : 'false'}
        >
          <SessionSidebar
            session={session}
            sessions={sessions}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadError={uploadError}
            onFile={uploadFile}
            onSwitch={(s) => { switchSession(s); setMobileView('chat') }}
            onDelete={deleteSession}
            onNewUpload={handleNewUpload}
          />
        </aside>

        {/* ── Right: chat panel ── */}
        <div
          className="rag-chat-col"
          data-mobile-visible={mobileView === 'chat' ? 'true' : 'false'}
        >
          {!session ? (
            <div className="rag-empty-state">
              <div className="rag-empty-icon">📄</div>
              <h2 className="rag-empty-title">No document loaded</h2>
              <p className="rag-empty-desc">
                Upload a PDF to start chatting with it.
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
              {/* Mobile CTA */}
              <button
                className="rag-mobile-upload-cta"
                onClick={() => setMobileView('sidebar')}
                style={{
                  display: 'none',
                  marginTop: '1rem',
                  padding: '0.65rem 1.5rem',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-display)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Upload a PDF →
              </button>
            </div>
          ) : (
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
                  messages.map(msg => <ChatMessage key={msg.id} message={msg} />)
                )}
                {chatError && (
                  <div className="rag-chat-error">
                    <ErrorIcon /> {chatError}
                  </div>
                )}
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

      {/* Mobile-specific styles */}
      <style>{`
        @media (max-width: 768px) {
          .rag-mobile-toggle { display: flex !important; }
          .rag-mobile-upload-cta { display: block !important; }

          /* On mobile, only show the active panel */
          .rag-sidebar-col[data-mobile-visible='false'],
          .rag-chat-col[data-mobile-visible='false'] {
            display: none !important;
          }

          /* Each panel takes full width */
          .rag-sidebar-col[data-mobile-visible='true'],
          .rag-chat-col[data-mobile-visible='true'] {
            display: block;
          }

          /* Override grid to single column */
          .rag-layout {
            grid-template-columns: 1fr !important;
            overflow: visible !important;
          }

          .rag-chat-col {
            min-height: calc(100dvh - 200px) !important;
          }

          .rag-page {
            padding-bottom: 1rem !important;
          }
        }
      `}</style>
    </div>
  )
}

/* ── Icons ── */

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

function FilesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}