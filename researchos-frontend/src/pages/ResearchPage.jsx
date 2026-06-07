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
      <main
        className="research-main-container"
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'grid',
          gap: '1.25rem',
          padding: '1.25rem 1.5rem',
        }}
      >

        {/* ── Header ── */}
        <section style={{ paddingTop: '0.25rem', paddingBottom: '0.25rem' }}>
          <div
            className="research-header-row"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div>
              <p style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.12em', color: 'var(--accent)', fontFamily: 'var(--font-mono)',
                marginBottom: '0.25rem',
              }}>
                Multi-Agent Research
              </p>
              <h1
                className="research-title"
                style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: 'clamp(1.3rem, 4vw, 1.85rem)',
                  letterSpacing: '-0.03em', color: 'var(--text-primary)',
                  margin: '0 0 0.3rem',
                }}
              >
                Research Workspace
              </h1>
              <p style={{ maxWidth: '480px', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                AI-powered pipeline with real-time execution, quality critique, and traceable sources.
              </p>
            </div>
            <RunStatusBadge status={runStatus} isDone={isDone} />
          </div>
        </section>

        {/* ── Metrics — responsive 3-col or 1-col ── */}
        <section
          className="research-metrics-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
          }}
        >
          <MetricCard label="Pipeline"  value={`${completedSteps}/${totalSteps}`}                               detail="stages completed" />
          <MetricCard label="Report"    value={reportWords   ? reportWords.toLocaleString()   : '0'}            detail="words generated"  />
          <MetricCard label="Critique"  value={critiqueWords ? critiqueWords.toLocaleString() : '0'}            detail="review words"      />
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

        {/* ── Pipeline flow — horizontally scrollable on mobile ── */}
        <div className="pipeline-flow-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <PipelineFlow steps={steps} />
        </div>

        {/* ── Report + Log — stacks to 1-col on mobile ── */}
        <div
          className="research-bottom-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 420px',
            gap: '1.25rem',
            alignItems: 'start',
          }}
        >
          <ReportViewer
            report={report}
            feedback={feedback}
            status={runStatus}
            error={error}
            topic={topic}
          />
          <div className="execution-log-panel">
            <ExecutionLog
              milestones={milestones}
              rawLogs={rawLogs}
              collapsedCount={collapsedMilestoneCount}
              isRunning={isRunning}
            />
          </div>
        </div>

      </main>

      {/* Inline responsive overrides for JS-controlled grid values */}
      <style>{`
        @media (max-width: 768px) {
          .research-metrics-grid {
            grid-template-columns: 1fr !important;
          }
          .research-bottom-grid {
            grid-template-columns: 1fr !important;
          }
          .research-main-container {
            padding: 12px !important;
          }
        }
        @media (max-width: 480px) {
          .research-metrics-grid {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 0.5rem !important;
          }
        }
      `}</style>
    </div>
  )
}

function RunStatusBadge({ status, isDone }) {
  const labels = {
    idle: 'Ready', loading: 'Loading', running: 'Pipeline Running',
    generating_report: 'Generating Report', completed: 'Report Ready', failed: 'Failed',
  }
  const color  = status === 'failed' ? '#dc2626' : isDone ? '#16a34a' : 'var(--accent)'
  const bg     = status === 'failed' ? '#fef2f2' : isDone ? '#f0fdf4' : 'var(--accent-dim)'
  const border = status === 'failed' ? '#fecaca' : isDone ? '#bbf7d0' : 'var(--accent-border)'

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      borderRadius: 999, border: `1px solid ${border}`,
      background: bg, padding: '6px 14px', fontSize: 12, fontWeight: 600, color,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {labels[status] ?? 'Ready'}
    </div>
  )
}

function MetricCard({ label, value, detail }) {
  return (
    <div style={{
      borderRadius: 10, border: '1px solid var(--border)',
      background: 'var(--bg-card)', padding: '0.85rem',
    }}>
      <p style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)', margin: 0,
      }}>
        {label}
      </p>
      <p style={{
        marginTop: 6, fontSize: 'clamp(1.1rem, 3vw, 1.5rem)',
        fontWeight: 700, color: 'var(--text-primary)',
        fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', margin: '6px 0 4px',
      }}>
        {value}
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>{detail}</p>
    </div>
  )
}