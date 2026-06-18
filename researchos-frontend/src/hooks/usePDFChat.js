import { useCallback, useRef, useState } from 'react'
import { ragApi } from '../services/ragApi'

/**
 * usePDFChat — manages the entire PDF Chat workflow:
 *   upload → session → chat messages → streaming responses
 */
export function usePDFChat() {
  // ── Upload state ─────────────────────────────────────────────────────────
  const [uploadProgress, setUploadProgress] = useState(0)   // 0-100
  const [uploading,      setUploading]      = useState(false)
  const [uploadError,    setUploadError]    = useState('')

  // ── Session state ────────────────────────────────────────────────────────
  const [session,   setSession]   = useState(null)   // { session_id, filename, page_count, chunk_count }
  const [sessions,  setSessions]  = useState([])     // all user sessions

  // ── Chat state ───────────────────────────────────────────────────────────
  const [messages,   setMessages]   = useState([])   // { id, role, content, sources?, streaming? }
  const [input,      setInput]      = useState('')
  const [responding, setResponding] = useState(false)
  const [chatError,  setChatError]  = useState('')

  const bottomRef = useRef(null)
  const msgIdRef  = useRef(0)

  function nextId() { return ++msgIdRef.current }

  // ── Scroll to bottom ─────────────────────────────────────────────────────
  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // ── Upload a PDF ─────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file) => {
    setUploadError('')
    setUploading(true)
    setUploadProgress(5)  // show immediate feedback

    try {
      // Step 1: upload the file — returns immediately with status="processing"
      const meta = await ragApi.upload(file, pct => setUploadProgress(pct))

      // Step 2: poll until ingestion is done
      setUploadProgress(10)
      const ready = await ragApi.pollStatus(meta.session_id, pct => setUploadProgress(pct))

      // Step 3: session is ready — set it with full metadata
      setUploadProgress(100)
      setSession(ready)
      setMessages([])
      return ready

    } catch (err) {
      setUploadError(err.message)
      return null
    } finally {
      setUploading(false)
    }
  }, [])

  // ── Load existing sessions ────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const data = await ragApi.listSessions()
      setSessions(data.sessions ?? [])
    } catch { /* silent */ }
  }, [])

  // ── Switch to an existing session ────────────────────────────────────────
  const switchSession = useCallback(async (sess) => {
    setSession(sess)
    setChatError('')
    try {
      const data = await ragApi.getHistory(sess.session_id)
      const msgs = (data.messages ?? []).map(m => ({ id: nextId(), role: m.role, content: m.content }))
      setMessages(msgs)
    } catch {
      setMessages([])
    }
  }, [])

  // ── Delete a session ─────────────────────────────────────────────────────
  const deleteSession = useCallback(async (sessionId) => {
    try {
      await ragApi.deleteSession(sessionId)
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
      if (session?.session_id === sessionId) {
        setSession(null)
        setMessages([])
      }
    } catch (err) {
      setChatError(err.message)
    }
  }, [session])

  // ── Send a question ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async (question) => {
    if (!session || !question.trim() || responding) return
    setChatError('')

    // Add user message
    const userMsg = { id: nextId(), role: 'user', content: question.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    scrollToBottom()

    // Placeholder assistant message that will stream in
    const asstId  = nextId()
    const asstMsg = { id: asstId, role: 'assistant', content: '', sources: [], streaming: true }
    setMessages(prev => [...prev, asstMsg])
    setResponding(true)

    await ragApi.chat(session.session_id, question.trim(), {
      onSources(sources) {
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, sources } : m
        ))
      },
      onChunk(chunk) {
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, content: m.content + chunk } : m
        ))
        scrollToBottom()
      },
      onDone() {
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, streaming: false } : m
        ))
        setResponding(false)
        scrollToBottom()
      },
      onError(msg) {
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, content: `Error: ${msg}`, streaming: false, error: true } : m
        ))
        setChatError(msg)
        setResponding(false)
      },
    })
  }, [session, responding])

  // ── Clear current session chat ────────────────────────────────────────────
  const clearChat = useCallback(() => {
    setMessages([])
    setChatError('')
  }, [])

  // ── Reset everything ──────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setSession(null)
    setMessages([])
    setInput('')
    setChatError('')
    setUploadError('')
    setUploadProgress(0)
  }, [])

  return {
    // upload
    uploading, uploadProgress, uploadError, uploadFile,
    // sessions
    session, sessions, loadSessions, switchSession, deleteSession,
    // chat
    messages, input, setInput, responding, chatError, sendMessage, clearChat, reset,
    // refs
    bottomRef,
  }
}
