import { useCallback } from 'react'
import TopicInput   from '../components/Research/TopicInput'
import PipelineFlow from '../components/Research/PipelineFlow'
import ExecutionLog from '../components/Research/ExecutionLog'
import ReportViewer from '../components/Research/ReportViewer'
import { useSSEStream } from '../hooks/useSSEStream'

export default function ResearchPage() {
  const {
    rawLogs, milestones, collapsedMilestoneCount,
    steps, report, feedback,
    runStatus, error, topic, isRunning, isDone,
    start, reset, retry,
  } = useSSEStream()

  const handleStart = useCallback((nextTopic) => start(nextTopic), [start])
  const handleReset = useCallback(() => reset(), [reset])

  const completedSteps = Object.values(steps).filter(s => s.status === 'done').length
  const totalSteps     = Object.values(steps).length
  const reportWords    = report.split(/\s+/).filter(Boolean).length
  const critiqueWords  = feedback.split(/\s+/).filter(Boolean).length

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100%' }}>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">

        {/* ── Header ── */}
        <section className="py-2">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                Multi-Agent Research
              </p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.85rem', letterSpacing: '-0.03em', color: 'var(--text-primary)', marginTop: '0.4rem', marginBottom: '0.4rem' }}>
                Research Workspace
              </h1>
              <p style={{ maxWidth: '480px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                AI-powered pipeline with real-time execution, quality critique, and traceable sources.
              </p>
            </div>
            <RunStatusBadge status={runStatus} isDone={isDone} />
          </div>
        </section>

        {/* ── Metrics ── */}
        <section className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Pipeline"  value={`${completedSteps}/${totalSteps}`}              detail="stages completed" />
          <MetricCard label="Report"    value={reportWords   ? reportWords.toLocaleString()   : '0'} detail="words generated" />
          <MetricCard label="Critique"  value={critiqueWords ? critiqueWords.toLocaleString() : '0'} detail="review words" />
        </section>

        {/* ── Error banner ── */}
        {error && (
          <div role="alert" style={{
            borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2',
            padding: '10px 14px', fontSize: 13, fontWeight: 500, color: '#dc2626',
          }}>
            {error}
          </div>
        )}

        {/* ── Topic input ── */}
        <TopicInput
          onStart={handleStart}
          onClear={handleReset}
          onRetry={retry}
          canRetry={runStatus === 'failed'}
          isRunning={isRunning}
          currentTopic={topic}
        />

        {/* ── Pipeline flow ── */}
        <PipelineFlow steps={steps} />

        {/* ── Report + Log ── */}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <ReportViewer
            report={report}
            feedback={feedback}
            status={runStatus}
            error={error}
            topic={topic}
          />
          <ExecutionLog
            milestones={milestones}
            rawLogs={rawLogs}
            collapsedCount={collapsedMilestoneCount}
            isRunning={isRunning}
          />
        </div>
      </main>
    </div>
  )
}

function RunStatusBadge({ status, isDone }) {
  const labels = {
    idle: 'Ready', loading: 'Loading', running: 'Pipeline Running',
    generating_report: 'Generating Report', completed: 'Report Ready', failed: 'Failed',
  }
  const color = status === 'failed' ? '#dc2626' : isDone ? '#16a34a' : 'var(--accent)'
  const bg    = status === 'failed' ? '#fef2f2' : isDone ? '#f0fdf4' : 'var(--accent-dim)'
  const border= status === 'failed' ? '#fecaca' : isDone ? '#bbf7d0' : 'var(--accent-border)'

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      borderRadius: 999, border: `1px solid ${border}`,
      background: bg, padding: '6px 14px', fontSize: 12, fontWeight: 600, color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {labels[status] ?? 'Ready'}
    </div>
  )
}

function MetricCard({ label, value, detail }) {
  return (
    <div style={{
      borderRadius: 10, border: '1px solid var(--border)',
      background: 'var(--bg-card)', padding: '1rem',
    }}>
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{label}</p>
      <p style={{ marginTop: 8, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>{value}</p>
      <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>{detail}</p>
    </div>
  )
}
