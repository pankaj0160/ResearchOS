/**
 * ReportViewer.jsx
 * Location: src/components/Research/ReportViewer.jsx
 *
 * Premium research report viewer.
 * Key fixes:
 *  - Removed ALL Tailwind classes (dark:bg-slate-900 etc) — they don't work
 *    without Tailwind installed. Replaced with CSS variables.
 *  - ReactMarkdown + remarkGfm for proper table/code/heading rendering
 *  - Copy + Download toolbar
 *  - Score badge with color coding
 *  - Smooth streaming cursor while report is generating
 */

import { memo, useCallback, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm    from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../services/apiClient'

// ── Status label helper ───────────────────────────────────────────────────────
function statusLabel(status, hasReport, hasFeedback) {
  if (status === 'failed')           return 'Pipeline failed — see error above'
  if (status === 'completed')        return hasFeedback ? 'Report + AI critique ready' : 'Report ready'
  if (status === 'generating_report') return 'Writing report…'
  if (status === 'running')          return 'Research pipeline running…'
  if (hasReport)                     return 'Report ready'
  return 'Start a research topic above'
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ feedback }) {
  const match = feedback?.match(/Score:\s*(\d+(?:\.\d+)?)\/10/i)
  if (!match) return null
  const score = parseFloat(match[1])
  const color = score >= 8 ? '#16a34a' : score >= 6 ? '#ca8a04' : '#dc2626'
  const bg    = score >= 8 ? '#f0fdf4' : score >= 6 ? '#fefce8' : '#fef2f2'
  const border= score >= 8 ? '#bbf7d0' : score >= 6 ? '#fde68a' : '#fecaca'

  return (
    <div style={{
      display:     'inline-flex',
      alignItems:  'center',
      gap:         5,
      padding:     '3px 10px',
      background:  bg,
      border:      `1px solid ${border}`,
      borderRadius: 999,
      fontSize:    12,
      fontWeight:  700,
      color,
      fontFamily:  'var(--font-mono)',
    }}>
      ★ {score}/10
    </div>
  )
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolbarBtn({ onClick, disabled, children, accent }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          5,
        padding:      '5px 12px',
        background:   accent ? 'var(--accent)' : 'var(--bg-base)',
        border:       `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        color:        accent ? '#fff' : 'var(--text-secondary)',
        fontSize:     12,
        fontWeight:   600,
        cursor:       disabled ? 'not-allowed' : 'pointer',
        opacity:      disabled ? 0.5 : 1,
        transition:   'background .12s, border-color .12s, color .12s',
        fontFamily:   'inherit',
        whiteSpace:   'nowrap',
      }}
      onMouseEnter={e => { if (!disabled && !accent) { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)' }}}
      onMouseLeave={e => { if (!accent) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}}
    >
      {children}
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
function ReportViewer({ report, feedback, status, error, topic, runId, ragSessionId }) {
  const navigate   = useNavigate()
  const [copied,   setCopied]  = useState(false)
  const [activeTab, setTab]    = useState('report')
  const [shareState, setShareState] = useState('idle') // idle | loading | copied | error

  const hasReport   = report.trim().length > 0
  const hasFeedback = feedback.trim().length > 0
  const isStreaming = status === 'running' || status === 'generating_report'

  const wordCount = useMemo(() =>
    report.split(/\s+/).filter(Boolean).length
  , [report])

  const exportContent = useMemo(() => {
    if (!hasFeedback) return report
    return `${report.trim()}\n\n---\n\n## AI Critique\n\n${feedback.trim()}\n`
  }, [report, feedback, hasFeedback])

  const copyReport = useCallback(async () => {
    if (!hasReport) return
    try {
      await navigator.clipboard.writeText(exportContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked */ }
  }, [exportContent, hasReport])

  const downloadReport = useCallback(() => {
    if (!hasReport) return
    const filename = topic
      ? `${topic.slice(0, 50).replace(/[^\w\s-]/g, '').trim()}.md`
      : 'research-report.md'
    const blob = new Blob([exportContent], { type: 'text/markdown' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }, [exportContent, hasReport, topic])

  const shareReport = useCallback(async () => {
    if (!runId || !hasReport || shareState === 'loading') return
    setShareState('loading')
    const res = await apiClient.post(`/api/history/${runId}/share`)
    if (!res.ok) {
      setShareState('error')
      setTimeout(() => setShareState('idle'), 2500)
      return
    }
    const link = `${window.location.origin}/r/${res.data.share_token}`
    try {
      await navigator.clipboard.writeText(link)
    } catch { /* clipboard blocked — link still generated, just not copied */ }
    setShareState('copied')
    setTimeout(() => setShareState('idle'), 2500)
  }, [runId, hasReport, shareState])

  return (
    <div style={{
      background:   'var(--bg-card)',
      border:       '1px solid var(--border)',
      borderRadius: 14,
      overflow:     'hidden',
      display:      'flex',
      flexDirection:'column',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding:      '0.875rem 1.125rem',
        borderBottom: '1px solid var(--border)',
        background:   'var(--bg-base)',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        gap:          12,
        flexWrap:     'wrap',
        flexShrink:   0,
      }}>
        <div>
          <h2 style={{
            fontFamily:    'var(--font-display)',
            fontSize:      '1rem',
            fontWeight:    700,
            color:         'var(--text-primary)',
            letterSpacing: '-0.02em',
            margin:        0,
          }}>
            Research Report
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
            {statusLabel(status, hasReport, hasFeedback)}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Score badge */}
          {hasFeedback && <ScoreBadge feedback={feedback} />}

          {/* Word count */}
          {wordCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {wordCount.toLocaleString()} words
            </span>
          )}

          {/* Toolbar */}
          <ToolbarBtn onClick={copyReport} disabled={!hasReport}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </ToolbarBtn>
          <ToolbarBtn onClick={downloadReport} disabled={!hasReport}>
            ⬇ Download
          </ToolbarBtn>
          <ToolbarBtn onClick={shareReport} disabled={!hasReport || !runId || shareState === 'loading'}>
            {shareState === 'copied' ? '✓ Link copied' : shareState === 'error' ? '✕ Failed' : shareState === 'loading' ? '…' : '🔗 Share'}
          </ToolbarBtn>

          {/* Chat with report button */}
          {ragSessionId && (
            <ToolbarBtn
              accent
              onClick={() => navigate(`/pdf-chat?session=${ragSessionId}`)}
            >
              💬 Chat
            </ToolbarBtn>
          )}
        </div>
      </div>

      {/* ── Tabs (Report / AI Critique) ── */}
      {hasFeedback && (
        <div style={{
          display:      'flex',
          gap:          2,
          padding:      '0.5rem 1rem',
          borderBottom: '1px solid var(--border)',
          background:   'var(--bg-base)',
          flexShrink:   0,
        }}>
          {['report', 'critique'].map(tab => (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              style={{
                padding:      '4px 12px',
                borderRadius: 99,
                fontSize:     12,
                fontWeight:   600,
                border:       'none',
                cursor:       'pointer',
                background:   activeTab === tab ? 'var(--accent-dim)' : 'transparent',
                color:        activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                transition:   'background .12s, color .12s',
                fontFamily:   'inherit',
              }}
            >
              {tab === 'report' ? '📄 Report' : '🔍 AI Critique'}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{
        flex:      1,
        overflowY: 'auto',
        padding:   '1.5rem',
      }}>

        {/* Empty state */}
        {!hasReport && !isStreaming && (
          <div style={{
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            padding:        '4rem 2rem',
            gap:            '0.75rem',
            textAlign:      'center',
            color:          'var(--text-faint)',
          }}>
            <div style={{ fontSize: '2.5rem' }}>🔬</div>
            <div style={{
              fontFamily:    'var(--font-display)',
              fontSize:      '1.1rem',
              fontWeight:    600,
              color:         'var(--text-secondary)',
              letterSpacing: '-0.02em',
            }}>
              No report yet
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.65, margin: 0 }}>
              Enter a topic above and click Run to start the AI research pipeline.
            </p>
          </div>
        )}

        {/* Report content */}
        {(hasReport || isStreaming) && activeTab === 'report' && (
          <div className="report-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {report || ''}
            </ReactMarkdown>
            {/* Streaming cursor */}
            {isStreaming && (
              <span style={{
                display:          'inline-block',
                width:            2,
                height:           '1.1em',
                background:       'var(--accent)',
                borderRadius:     1,
                marginLeft:       3,
                verticalAlign:    'text-bottom',
                animation:        'blink 1s step-end infinite',
              }} />
            )}
          </div>
        )}

        {/* AI Critique tab */}
        {hasFeedback && activeTab === 'critique' && (
          <div>
            <div style={{
              padding:      '0.75rem 1rem',
              background:   'var(--accent-dim)',
              border:       '1px solid var(--accent-border)',
              borderRadius: 10,
              marginBottom: '1rem',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent)', marginBottom: 4 }}>
                AI Quality Review
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                An independent AI agent reviewed this report for accuracy, depth, and completeness.
              </p>
            </div>
            <div className="report-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{feedback}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* Streaming cursor CSS */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

export default memo(ReportViewer)