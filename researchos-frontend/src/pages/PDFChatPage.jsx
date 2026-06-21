import { useEffect, useRef, useState, useCallback } from 'react'
import { usePDFChat } from '../hooks/usePDFChat'
import { PDFUploadZone } from '../components/RAG/PDFUploadZone'
import { SessionSidebar } from '../components/RAG/SessionSidebar'
import { ChatMessage } from '../components/RAG/ChatMessage'
import { ChatInput } from '../components/RAG/ChatInput'
import { useSearchParams } from 'react-router-dom'
import { MiniHistoryStrip } from '../components/History/MiniHistoryStrip'

/* ─────────────────────────────────────────────────────────────────────────────
   PDFChatPage — Premium redesign
   Layout: collapsible sidebar (240px) + full-height chat column.
   Key UX improvements:
   - Sidebar collapses to icon-rail so chat gets maximum width
   - Chat fills entire viewport height (no page scroll)
   - Message list scrolls independently inside the chat pane
   - Suggested prompts appear inline when history is empty
   - Typing indicator, streaming badge, smooth animations
   - Mobile: slide-over panel instead of page replace
───────────────────────────────────────────────────────────────────────────── */

const SUGGESTED = [
  { icon: '📋', label: 'Summarize this document' },
  { icon: '🔍', label: 'What are the main findings?' },
  { icon: '💡', label: 'What are the key conclusions?' },
  { icon: '📅', label: 'List all important dates or figures' },
]

export default function PDFChatPage() {
  const [searchParams]     = useSearchParams()
  const switchedRef        = useRef(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const {
    uploading, uploadProgress, uploadError, uploadFile,
    session, sessions, loadSessions, switchSession, deleteSession,
    messages, input, setInput, responding, chatError, sendMessage, clearChat, reset,
    bottomRef,
  } = usePDFChat()

  useEffect(() => { loadSessions() }, [loadSessions])

  useEffect(() => {
    const sessionParam = searchParams.get('session')
    if (!sessionParam || switchedRef.current || sessions.length === 0) return
    const target = sessions.find(s => s.session_id === sessionParam)
    if (!target) return
    switchedRef.current = true
    switchSession(target)
  }, [searchParams, sessions, switchSession])

  // Close mobile sidebar when a session becomes active
  useEffect(() => {
    if (session) setMobileSidebarOpen(false)
  }, [session?.id])

  const handleSuggest = useCallback((label) => {
    setInput(label)
    // Small delay so the input visually fills before send
    setTimeout(() => sendMessage(), 50)
  }, [setInput, sendMessage])

  return (
    <>
      <style>{STYLES}</style>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="pdf-mobile-overlay"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div className="pdf-shell">

        {/* ── Sidebar ───────────────────────────────────────── */}
        <aside className={`pdf-sidebar ${sidebarOpen ? 'pdf-sidebar--open' : 'pdf-sidebar--collapsed'} ${mobileSidebarOpen ? 'pdf-sidebar--mobile-open' : ''}`}>

          {/* Sidebar header */}
          <div className="pdf-sidebar-header">
            {sidebarOpen && (
              <span className="pdf-sidebar-title">Documents</span>
            )}
            <button
              className="pdf-icon-btn pdf-collapse-btn"
              onClick={() => setSidebarOpen(v => !v)}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarOpen ? 'Collapse' : 'Expand'}
            >
              <CollapseIcon open={sidebarOpen} />
            </button>
          </div>

          {/* Sidebar body — only render full content when open */}
          <div className="pdf-sidebar-body">
            
            {sidebarOpen ? (
              <>
              <SessionSidebar
                session={session}
                sessions={sessions}
                uploading={uploading}
                uploadProgress={uploadProgress}
                uploadError={uploadError}
                onFile={uploadFile}
                onSwitch={(s) => { switchSession(s); setMobileSidebarOpen(false) }}
                onDelete={deleteSession}
                onNewUpload={() => { reset(); setSidebarOpen(true) }}
              />
              <MiniHistoryStrip feature="pdf" />
              </>
              
            ) : (
              /* Collapsed: icon rail — click any item to re-open sidebar */
              <div className="pdf-icon-rail">
                <button
                  className="pdf-icon-btn pdf-rail-btn"
                  title="Upload PDF"
                  onClick={() => setSidebarOpen(true)}
                >
                  <UploadIcon />
                </button>
                {sessions.slice(0, 8).map(s => (
                  <button
                    key={s.session_id}
                    className={`pdf-icon-btn pdf-rail-btn pdf-rail-doc ${session?.id === s.session_id ? 'pdf-rail-doc--active' : ''}`}
                    title={s.filename || s.title}
                    onClick={() => { switchSession(s); setSidebarOpen(true) }}
                  >
                    <DocIcon />
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── Chat column ───────────────────────────────────── */}
        <main className="pdf-chat-col">

          {/* Chat topbar */}
          <header className="pdf-topbar">
            {/* Mobile hamburger */}
            <button
              className="pdf-icon-btn pdf-mobile-menu-btn"
              onClick={() => setMobileSidebarOpen(v => !v)}
              aria-label="Open documents"
            >
              <MenuIcon />
            </button>

            <div className="pdf-topbar-doc">
              {session ? (
                <>
                  <DocIcon />
                  <span className="pdf-topbar-name">{session.filename}</span>
                  <span className="pdf-topbar-meta">
                    {session.page_count}p · {session.chunk_count} chunks
                  </span>
                </>
              ) : (
                <span className="pdf-topbar-placeholder">PDF Chat</span>
              )}
            </div>

            <div className="pdf-topbar-actions">
              {responding && (
                <span className="pdf-streaming-badge">
                  <span className="pdf-streaming-dot" />
                  Thinking
                </span>
              )}
              {session && messages.length > 0 && (
                <button className="pdf-icon-btn pdf-clear-btn" onClick={clearChat} title="Clear chat">
                  <ClearIcon />
                  <span className="pdf-clear-label">Clear</span>
                </button>
              )}
            </div>
          </header>

          {/* ── Chat body ── */}
          <div className="pdf-chat-body">
            {!session ? (
              /* Empty state */
              <div className="pdf-empty">
                <div className="pdf-empty-icon-wrap">
                  <EmptyDocIcon />
                </div>
                <h2 className="pdf-empty-title">No document loaded</h2>
                <p className="pdf-empty-desc">
                  Upload a PDF to start chatting with it. Answers cite the exact page.
                </p>
                <div className="pdf-empty-features">
                  {[
                    { icon: <SearchIcon />, text: 'Semantic search across all pages' },
                    { icon: <MarkdownIcon />, text: 'Structured markdown answers' },
                    { icon: <LinkIcon />, text: 'Page-level source citations' },
                    { icon: <ChatBubbleIcon />, text: 'Multi-turn conversation memory' },
                  ].map(f => (
                    <div key={f.text} className="pdf-empty-feature">
                      <span className="pdf-empty-feature-icon">{f.icon}</span>
                      <span>{f.text}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="pdf-upload-cta"
                  onClick={() => { setSidebarOpen(true); setMobileSidebarOpen(true) }}
                >
                  Upload a PDF
                  <ArrowRightIcon />
                </button>
              </div>
            ) : (
              /* Active chat */
              <div className="pdf-messages-wrap">
                <div className="pdf-messages">
                  {messages.length === 0 ? (
                    /* Welcome + suggested prompts */
                    <div className="pdf-welcome">
                      <div className="pdf-welcome-badge">
                        <DocIcon />
                        <span>Ready</span>
                      </div>
                      <h3 className="pdf-welcome-title">
                        Chat with <em>{session.filename}</em>
                      </h3>
                      <p className="pdf-welcome-meta">
                        {session.page_count} pages · {session.chunk_count} chunks indexed
                      </p>
                      <div className="pdf-suggestions">
                        {SUGGESTED.map(s => (
                          <button
                            key={s.label}
                            className="pdf-suggestion"
                            onClick={() => handleSuggest(s.label)}
                          >
                            <span className="pdf-suggestion-icon">{s.icon}</span>
                            <span className="pdf-suggestion-label">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map(msg => <ChatMessage key={msg.id} message={msg} />)
                  )}

                  {chatError && (
                    <div className="pdf-error-msg">
                      <ErrorIcon />
                      <span>{chatError}</span>
                    </div>
                  )}

                  {/* Typing indicator while streaming first token */}
                  {responding && messages[messages.length - 1]?.role === 'user' && (
                    <div className="pdf-typing">
                      <span /><span /><span />
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>

                {/* ── Input bar ── */}
                <div className="pdf-input-wrap">
                  {messages.length > 0 && !responding && (
                    <div className="pdf-quick-chips">
                      {SUGGESTED.slice(0, 2).map(s => (
                        <button
                          key={s.label}
                          className="pdf-chip"
                          onClick={() => handleSuggest(s.label)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <ChatInput
                    value={input}
                    onChange={setInput}
                    onSend={sendMessage}
                    disabled={responding}
                    sessionActive={!!session}
                  />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Styles — scoped to .pdf-* classes to avoid colliding with existing globals
───────────────────────────────────────────────────────────────────────────── */
const STYLES = `
/* ── Shell: full viewport height, no page scroll ── */
.pdf-shell {
  display: flex;
  height: calc(100dvh - var(--topnav-height, 56px));
  overflow: hidden;
  background: var(--bg-base, var(--color-background-tertiary));
}

/* ── Sidebar ── */
.pdf-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 240px;
  border-right: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-surface, var(--color-background-secondary));
  transition: width 0.2s ease;
  overflow: hidden;
  position: relative;
  z-index: 10;
}
.pdf-sidebar--collapsed {
  width: 52px;
}
.pdf-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 10px 10px 14px;
  border-bottom: 0.5px solid var(--border, var(--color-border-tertiary));
  min-height: 48px;
  flex-shrink: 0;
}
.pdf-sidebar-title {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted, var(--color-text-secondary));
  white-space: nowrap;
}
.pdf-sidebar-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ── Icon rail (collapsed state) ── */
.pdf-icon-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0;
}
.pdf-rail-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--text-muted, var(--color-text-secondary));
}
.pdf-rail-btn:hover {
  background: var(--bg-hover, var(--color-background-primary));
  color: var(--text-primary, var(--color-text-primary));
}
.pdf-rail-doc--active {
  background: var(--accent-soft, var(--color-background-info)) !important;
  color: var(--accent, var(--color-text-info)) !important;
}

/* ── Chat column ── */
.pdf-chat-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Topbar ── */
.pdf-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: 48px;
  border-bottom: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-surface, var(--color-background-secondary));
  flex-shrink: 0;
}
.pdf-topbar-doc {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  min-width: 0;
}
.pdf-topbar-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text-primary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}
.pdf-topbar-meta {
  font-size: 11.5px;
  color: var(--text-muted, var(--color-text-secondary));
  white-space: nowrap;
  flex-shrink: 0;
}
.pdf-topbar-placeholder {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text-primary));
}
.pdf-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Streaming badge */
.pdf-streaming-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary));
  padding: 3px 10px;
  border-radius: 20px;
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-surface, var(--color-background-secondary));
}
.pdf-streaming-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent, #10b981);
  animation: pdf-pulse 1.2s ease-in-out infinite;
}
@keyframes pdf-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.7); }
}

/* ── Chat body — fills remaining height ── */
.pdf-chat-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Empty state ── */
.pdf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}
.pdf-empty-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--bg-card, var(--color-background-primary));
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  color: var(--text-muted, var(--color-text-secondary));
}
.pdf-empty-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text-primary));
  margin: 0 0 0.5rem;
}
.pdf-empty-desc {
  font-size: 14px;
  color: var(--text-muted, var(--color-text-secondary));
  max-width: 380px;
  line-height: 1.6;
  margin: 0 0 1.5rem;
}
.pdf-empty-features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-width: 440px;
  margin-bottom: 1.75rem;
}
.pdf-empty-feature {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-card, var(--color-background-primary));
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
}
.pdf-empty-feature-icon {
  flex-shrink: 0;
  color: var(--text-muted, var(--color-text-secondary));
}
.pdf-upload-cta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 22px;
  background: var(--accent, #10b981);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}
.pdf-upload-cta:hover { opacity: 0.88; }

/* ── Messages pane ── */
.pdf-messages-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.pdf-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 24px 8px;
  scroll-behavior: smooth;
}
/* Custom scrollbar */
.pdf-messages::-webkit-scrollbar { width: 5px; }
.pdf-messages::-webkit-scrollbar-track { background: transparent; }
.pdf-messages::-webkit-scrollbar-thumb {
  background: var(--border, var(--color-border-tertiary));
  border-radius: 10px;
}

/* ── Welcome screen ── */
.pdf-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60%;
  padding: 2rem 1rem;
  text-align: center;
}
.pdf-welcome-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent, #10b981);
  background: color-mix(in srgb, var(--accent, #10b981) 12%, transparent);
  border: 0.5px solid color-mix(in srgb, var(--accent, #10b981) 30%, transparent);
  border-radius: 20px;
  padding: 4px 12px;
  margin-bottom: 1rem;
}
.pdf-welcome-title {
  font-size: 20px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text-primary));
  margin: 0 0 0.35rem;
  max-width: 500px;
}
.pdf-welcome-title em {
  font-style: normal;
  color: var(--accent, #10b981);
}
.pdf-welcome-meta {
  font-size: 13px;
  color: var(--text-muted, var(--color-text-secondary));
  margin: 0 0 1.75rem;
}

/* ── Suggested prompts ── */
.pdf-suggestions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  width: 100%;
  max-width: 560px;
}
.pdf-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-card, var(--color-background-primary));
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.pdf-suggestion:hover {
  border-color: var(--accent, #10b981);
  background: color-mix(in srgb, var(--accent, #10b981) 5%, var(--bg-card, var(--color-background-primary)));
}
.pdf-suggestion-icon {
  font-size: 16px;
  flex-shrink: 0;
  line-height: 1.4;
}
.pdf-suggestion-label {
  font-size: 13px;
  color: var(--text-primary, var(--color-text-primary));
  line-height: 1.45;
}

/* ── Typing indicator ── */
.pdf-typing {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 14px 16px;
  width: fit-content;
  background: var(--bg-card, var(--color-background-primary));
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  border-radius: 14px;
  margin: 4px 0 8px;
}
.pdf-typing span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted, var(--color-text-secondary));
  animation: pdf-bounce 1.2s ease-in-out infinite;
}
.pdf-typing span:nth-child(2) { animation-delay: 0.15s; }
.pdf-typing span:nth-child(3) { animation-delay: 0.30s; }
@keyframes pdf-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40%           { transform: translateY(-6px); opacity: 1; }
}

/* ── Error message ── */
.pdf-error-msg {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-danger, #e53e3e);
  background: var(--color-background-danger, #fff5f5);
  border: 0.5px solid var(--color-border-danger, #fed7d7);
  border-radius: 10px;
  padding: 10px 14px;
  margin: 4px 0;
}

/* ── Input area ── */
.pdf-input-wrap {
  flex-shrink: 0;
  padding: 8px 24px 16px;
  border-top: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-surface, var(--color-background-secondary));
}

/* Quick chips above input */
.pdf-quick-chips {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.pdf-chip {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 20px;
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-card, var(--color-background-primary));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
  white-space: nowrap;
}
.pdf-chip:hover {
  border-color: var(--accent, #10b981);
  color: var(--accent, #10b981);
}

/* ── Shared icon button ── */
.pdf-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  padding: 6px;
  color: var(--text-muted, var(--color-text-secondary));
  transition: background 0.12s, color 0.12s;
}
.pdf-icon-btn:hover {
  background: var(--bg-hover, var(--color-background-primary));
  color: var(--text-primary, var(--color-text-primary));
}

.pdf-collapse-btn { flex-shrink: 0; }
.pdf-mobile-menu-btn { display: none; }
.pdf-clear-btn {
  font-size: 12.5px;
  padding: 5px 10px;
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  border-radius: 8px;
}
.pdf-clear-label { color: var(--text-muted, var(--color-text-secondary)); }

/* Mobile overlay */
.pdf-mobile-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 9;
}

/* ── Mobile ── */
@media (max-width: 768px) {
  .pdf-shell {
    height: calc(100dvh - var(--topnav-height, 56px));
  }
  .pdf-mobile-menu-btn { display: flex; }
  .pdf-mobile-overlay  { display: block; }

  .pdf-sidebar {
    position: fixed;
    left: 0;
    top: var(--topnav-height, 56px);
    height: calc(100dvh - var(--topnav-height, 56px));
    width: 280px !important;
    transform: translateX(-100%);
    transition: transform 0.22s ease;
    z-index: 10;
    box-shadow: 4px 0 24px rgba(0,0,0,0.12);
  }
  .pdf-sidebar--mobile-open {
    transform: translateX(0) !important;
  }
  .pdf-collapse-btn { display: none; }

  .pdf-suggestions {
    grid-template-columns: 1fr;
  }
  .pdf-empty-features {
    grid-template-columns: 1fr;
  }
  .pdf-topbar-meta { display: none; }
  .pdf-messages { padding: 16px 14px 8px; }
  .pdf-input-wrap { padding: 8px 14px 14px; }
}
`

/* ─────────────────────────────────────────────────────────────────────────────
   Icons — all inline SVG, stroke-based
───────────────────────────────────────────────────────────────────────────── */

function CollapseIcon({ open }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {open
        ? <><polyline points="15 18 9 12 15 6" /></>
        : <><polyline points="9 18 15 12 9 6" /></>
      }
    </svg>
  )
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}

function EmptyDocIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
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

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function MarkdownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  )
}

function ChatBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}