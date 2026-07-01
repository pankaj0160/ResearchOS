/**
 * SessionSidebar — left panel showing:
 *  - Active session metadata
 *  - Upload zone (when no session selected)
 *  - List of past sessions
 *  - Delete controls
 */
import { PDFUploadZone } from './PDFUploadZone'

export function SessionSidebar({
  session, sessions,
  uploading, uploadProgress, uploadStage, uploadError,
  onFile, onSwitch, onDelete, onNewUpload,
}) {
  return (
    <div className="rag-sidebar">

      {/* Active session info */}
      {session ? (
        <div className="rag-active-doc">
          <div className="rag-active-doc-header">
            <div className="rag-active-doc-icon">
              <PDFBadge />
            </div>
            <div className="rag-active-doc-info">
              <p className="rag-active-doc-name" title={session.filename}>
                {session.filename}
              </p>
              <p className="rag-active-doc-meta">
                {session.page_count} pages · {session.chunk_count} chunks
              </p>
            </div>
          </div>

          {/* Stat pills */}
          <div className="rag-doc-stats">
            <StatPill icon="📄" label="Pages"  value={session.page_count} />
            <StatPill icon="🔷" label="Chunks" value={session.chunk_count} />
          </div>

          <button className="rag-new-upload-btn" onClick={onNewUpload}>
            <UploadIcon />
            Upload new PDF
          </button>
        </div>
      ) : (
        <PDFUploadZone
          onFile={onFile}
          uploading={uploading}
          progress={uploadProgress}
          stage={uploadStage}
          error={uploadError}
        />
      )}

      {/* Past sessions */}
      {sessions.length > 0 && (
        <div className="rag-sessions-list">
          <p className="rag-sessions-heading">Recent documents</p>
          {sessions.map(s => (
            <SessionCard
              key={s.session_id}
              session={s}
              active={session?.session_id === s.session_id}
              onSelect={() => onSwitch(s)}
              onDelete={() => onDelete(s.session_id)}
            />
          ))}
        </div>
      )}

      {/* Suggested prompts when session is active */}
      {session && (
        <div className="rag-suggested">
          <p className="rag-suggested-heading">Suggested questions</p>
          {SUGGESTED.map(q => (
            <button key={q} className="rag-suggested-btn" onClick={() => onSuggest?.(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SUGGESTED = [
  'Summarize this document',
  'What are the main findings?',
  'What are the key conclusions?',
  'List the most important points',
]

function SessionCard({ session, active, onSelect, onDelete }) {
  return (
    <div className={`rag-session-card${active ? ' rag-session-card--active' : ''}`}>
      <button className="rag-session-card-main" onClick={onSelect}>
        <span className="rag-session-card-icon"><PDFBadge small /></span>
        <div className="rag-session-card-info">
          <span className="rag-session-card-name" title={session.filename}>
            {truncate(session.filename, 28)}
          </span>
          <span className="rag-session-card-meta">
            {session.page_count}p · {session.message_count} msgs
          </span>
        </div>
      </button>
      <button
        className="rag-session-card-delete"
        onClick={e => { e.stopPropagation(); onDelete() }}
        title="Remove session"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

function StatPill({ icon, label, value }) {
  return (
    <div className="rag-stat-pill">
      <span>{icon}</span>
      <span className="rag-stat-pill-label">{label}</span>
      <span className="rag-stat-pill-value">{value}</span>
    </div>
  )
}

function truncate(str, max) {
  if (!str) return ''
  if (str.length <= max) return str
  const ext = str.lastIndexOf('.')
  if (ext > 0) return str.slice(0, max - 4) + '…' + str.slice(ext)
  return str.slice(0, max) + '…'
}

function PDFBadge({ small }) {
  const size = small ? 14 : 18
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  )
}