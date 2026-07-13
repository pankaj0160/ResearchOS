/**
 * ResearchPage.jsx — Premium Research Pipeline UI
 * Location: src/pages/ResearchPage.jsx
 *
 * Changes:
 *  - Premium page header with gradient accent line
 *  - Metric cards upgraded with color coding
 *  - Error banner uses CSS vars (dark mode safe)
 *  - Layout tightened for better vertical rhythm
 *  - All hardcoded colors replaced with CSS vars
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams }       from 'react-router-dom'
import TopicInput                from '../components/Research/TopicInput'
import PipelineFlow              from '../components/Research/PipelineFlow'
import ExecutionLog              from '../components/Research/ExecutionLog'
import SourceRail                from '../components/Research/SourceRail'
import FollowUpThread            from '../components/Research/FollowUpThread'
import ReportViewer              from '../components/Research/ReportViewer'
import { useSSEStream }          from '../hooks/useSSEStream'
import { useWorkspace }          from '../context/WorkspaceContext'
import { MiniHistoryStrip }      from '../components/History/MiniHistoryStrip'
import { apiClient }             from '../services/apiClient'

export default function ResearchPage() {
  const [searchParams]      = useSearchParams()
  const { activeWorkspace } = useWorkspace()
  const startedRef          = useRef(false)

  const {
    rawLogs, milestones, collapsedMilestoneCount,
    steps, report, feedback,
    runStatus, error, topic, isRunning, isDone,
    runId, ragSessionId, sources, readSourceUrl,
    start, reset, retry,
  } = useSSEStream()

  const [loadedRun, setLoadedRun] = useState(null)

  // Load historical run from ?run_id= URL param
  useEffect(() => {
    const runIdParam = searchParams.get('run_id')
    if (!runIdParam) { setLoadedRun(null); return }
    apiClient.get(`/api/history/${runIdParam}`)
      .then(res => { if (res.data?.id) setLoadedRun(res.data) })
      .catch(console.error)
  }, [searchParams])

  // Auto-start from ?topic= URL param
  useEffect(() => {
    const topicParam = searchParams.get('topic')
    if (!topicParam || topicParam === topic) return
    startedRef.current = true
    const t = setTimeout(() => start(topicParam, activeWorkspace?.id ?? null), 300)
    return () => clearTimeout(t)
  }, [searchParams, topic, start, activeWorkspace])

  const handleStart = useCallback(
    (nextTopic, focusMode = 'balanced') => start(nextTopic, activeWorkspace?.id ?? null, focusMode),
    [start, activeWorkspace]
  )
  const handleReset = useCallback(() => {
    reset()
    setLoadedRun(null)
    startedRef.current = false
  }, [reset])

  const displayReport   = report   || loadedRun?.report   || ''
  const displayFeedback = feedback || loadedRun?.feedback || ''
  const displayTopic    = topic    || loadedRun?.topic    || ''
  const displayRunId    = runId    || loadedRun?.id       || null

  const completedSteps = Object.values(steps).filter(s => s.status === 'done').length
  const totalSteps     = Object.values(steps).length || 4
  const reportWords    = displayReport.split(/\s+/).filter(Boolean).length

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100%' }}>
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '1.25rem 1.5rem', display: 'grid', gap: '1.25rem' }}>

        {/* ── Page header ── */}
        <section>
          {/* Accent line */}
          <div style={{ width: 32, height: 3, background: 'var(--accent)', borderRadius: 2, marginBottom: '0.75rem' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', fontFamily: 'var(--font-mono)', margin: '0 0 0.25rem' }}>
                Multi-Agent Pipeline
              </p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(1.3rem,4vw,1.85rem)', letterSpacing: '-0.03em', color: 'var(--text-primary)', margin: '0 0 0.3rem' }}>
                Research Workspace
              </h1>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, maxWidth: 480 }}>
                AI-powered pipeline — Search → Read → Write → Critique — with real-time streaming and quality scoring.
              </p>
            </div>
            <RunStatusBadge status={runStatus} isDone={isDone} />
          </div>
        </section>

        {/* ── Metric cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem' }}>
          <MetricCard
            label="Pipeline"
            value={`${completedSteps}/${totalSteps}`}
            detail="stages completed"
            accent={completedSteps === totalSteps && totalSteps > 0}
          />
          <MetricCard
            label="Report"
            value={reportWords ? reportWords.toLocaleString() : '—'}
            detail="words generated"
            accent={reportWords > 0}
          />
          <MetricCard
            label="Quality"
            value={(() => {
              const m = displayFeedback.match(/Score:\s*(\d+(?:\.\d+)?)\/10/i)
              return m ? `${m[1]}/10` : '—'
            })()}
            detail="AI critique score"
            accent={!!displayFeedback.match(/Score:\s*(\d+(?:\.\d+)?)\/10/i)}
          />
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div role="alert" style={{
            borderRadius: 8,
            border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
            background: 'var(--danger-subtle)',
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Topic input ── */}
        <TopicInput
          onStart={handleStart}
          onClear={handleReset}
          onRetry={retry}
          canRetry={runStatus === 'failed'}
          isRunning={isRunning}
          currentTopic={displayTopic}
        />

        {/* ── Recent research sidebar strip ── */}
        <MiniHistoryStrip feature="research" />

        {/* ── Pipeline flow visualization ── */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <PipelineFlow steps={steps} />
        </div>

        {/* ── Report + Execution log ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: '1.25rem', alignItems: 'start' }}>

          {/* Left: report viewer — full width, no empty middle column */}
          <ReportViewer
            report={displayReport}
            feedback={displayFeedback}
            status={runStatus}
            error={error}
            topic={displayTopic}
            runId={displayRunId}
            ragSessionId={ragSessionId}
          />

          {/* Right: live sources + execution log */}
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <SourceRail sources={sources} readUrl={readSourceUrl} isRunning={isRunning} />
            <ExecutionLog
              milestones={milestones}
              rawLogs={rawLogs}
              collapsedCount={collapsedMilestoneCount}
              isRunning={isRunning}
            />
          </div>
        </div>

        {/* ── Follow-up thread — ask about this report without re-running the pipeline ── */}
        {isDone && displayReport && displayRunId && (
          <div style={{ marginTop: '1.25rem' }}>
            <FollowUpThread runId={displayRunId} />
          </div>
        )}

      </main>

      <style>{`
        @media (max-width: 900px) {
          main > div:last-child { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 600px) {
          main { padding: 0.75rem !important; }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const RunStatusBadge = React.memo(function RunStatusBadge({ status, isDone }) {
  const map = {
    idle:              { label: 'Ready',             color: 'var(--text-faint)',  bg: 'var(--bg-card)',    border: 'var(--border)' },
    running:           { label: 'Pipeline Running',  color: 'var(--accent)',      bg: 'var(--accent-dim)', border: 'var(--accent-border)' },
    generating_report: { label: 'Writing Report…',   color: 'var(--accent)',      bg: 'var(--accent-dim)', border: 'var(--accent-border)' },
    completed:         { label: 'Report Ready',      color: 'var(--success)',     bg: 'var(--success-subtle)', border: 'var(--success)' },
    failed:            { label: 'Failed',            color: 'var(--danger)',      bg: 'var(--danger-subtle)', border: 'var(--danger)' },
  }
  const cfg = map[status] || map.idle
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      borderRadius: 999, border: `1px solid ${cfg.border}`,
      background: cfg.bg, padding: '5px 14px',
      fontSize: 12, fontWeight: 600, color: cfg.color,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0,
        animation: (status === 'running' || status === 'generating_report') ? 'pulse 1.5s infinite' : 'none',
      }} />
      {cfg.label}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
})

const MetricCard = React.memo(function MetricCard({ label, value, detail, accent }) {
  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${accent ? 'var(--accent-border)' : 'var(--border)'}`,
      background: accent ? 'var(--accent-dim)' : 'var(--bg-card)',
      padding: '0.875rem',
      transition: 'border-color .2s, background .2s',
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: accent ? 'var(--accent)' : 'var(--text-faint)', fontFamily: 'var(--font-mono)', margin: 0 }}>
        {label}
      </p>
      <p style={{ margin: '6px 0 4px', fontSize: 'clamp(1.1rem,3vw,1.5rem)', fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
        {value}
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>{detail}</p>
    </div>
  )
})