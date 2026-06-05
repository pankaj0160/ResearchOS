import { useCallback, useState } from 'react'

/** Drag-and-drop + click-to-browse PDF uploader with progress bar */
export function PDFUploadZone({ onFile, uploading, progress, error }) {
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Only PDF files are supported.')
      return
    }
    onFile(file)
  }, [onFile])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onInputChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''   // allow re-upload of same file
  }, [handleFile])

  return (
    <div className="rag-upload-zone">
      {uploading ? (
        <div className="rag-upload-progress">
          <div className="rag-upload-progress-icon">
            <SpinnerIcon />
          </div>
          <p className="rag-upload-progress-label">Ingesting document…</p>
          <p className="rag-upload-progress-hint">Chunking and embedding — this takes a few seconds</p>
          <div className="rag-progress-bar">
            <div className="rag-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="rag-progress-pct">{progress}%</span>
        </div>
      ) : (
        <label
          className={`rag-drop-target${dragging ? ' rag-drop-target--over' : ''}`}
          onDragEnter={e => { e.preventDefault(); setDragging(true) }}
          onDragOver={e  => { e.preventDefault(); setDragging(true) }}
          onDragLeave={e => { e.preventDefault(); setDragging(false) }}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={onInputChange}
            style={{ display: 'none' }}
          />
          <div className="rag-drop-icon">
            <PDFIcon />
          </div>
          <p className="rag-drop-primary">Drop a PDF here</p>
          <p className="rag-drop-secondary">or <span className="rag-drop-browse">click to browse</span></p>
          <p className="rag-drop-hint">Max 50 MB · Text-based PDFs only</p>
        </label>
      )}

      {error && (
        <div className="rag-upload-error">
          <ErrorIcon />
          {error}
        </div>
      )}
    </div>
  )
}

function PDFIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" style={{ animation: 'spin 1s linear infinite', transformOrigin: 'center' }}/>
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
