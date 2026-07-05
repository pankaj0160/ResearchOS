/**
 * PipelineFlow.jsx
 * Location: src/components/Research/PipelineFlow.jsx
 *
 * The five-step pipeline timeline shown on the Research page while a
 * run is in progress. Previously hardcoded Tailwind slate/indigo/emerald
 * classes — the generic "AI product" look. Rewritten to use the app's
 * real CSS-variable design system plus the four agent-color tokens, so
 * each step's accent color matches its agent everywhere else in the app
 * (Logo, Landing pipeline demo, etc).
 */
import { memo } from 'react'
import { PIPELINE_STEPS } from '../../hooks/useSSEStream'

const STATUS_LABEL = {
  idle: 'Waiting',
  running: 'Running',
  done: 'Completed',
  error: 'Error',
}

// One accent per step — matches the pipeline agent colors used everywhere else
const STEP_COLOR = {
  search: 'var(--agent-search)',
  reader: 'var(--agent-reader)',
  writer: 'var(--agent-writer)',
  critic: 'var(--agent-critic)',
  final:  'var(--accent)',
}

function PipelineFlow({ steps }) {
  const completeCount = PIPELINE_STEPS.filter((step) => steps[step.key]?.status === 'done').length
  const progress = Math.round((completeCount / PIPELINE_STEPS.length) * 100)

  return (
    <section
      aria-label="Pipeline progress"
      style={{
        borderRadius: 16,
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-sm)',
        padding: '1.35rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: '1.3rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', margin: 0 }}>
            Pipeline Progress
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Real-time agent status timeline.</p>
        </div>
        <span style={{
          borderRadius: 99, background: 'var(--bg-inset)', border: '1px solid var(--border)',
          padding: '4px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          {progress}%
        </span>
      </div>

      <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-inset)', overflow: 'hidden', marginBottom: '1.3rem' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 99, transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>

      <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, listStyle: 'none', margin: 0, padding: 0 }} className="pipeline-flow-grid">
        {PIPELINE_STEPS.map((step, index) => {
          const state = steps[step.key] || { status: 'idle', message: step.waiting }
          const color = STEP_COLOR[step.key] || 'var(--accent)'
          const isRunning = state.status === 'running'
          const isDone    = state.status === 'done'
          const isError   = state.status === 'error'

          return (
            <li key={step.key} style={{
              position: 'relative',
              borderRadius: 12,
              padding: '0.9rem',
              border: `1.5px solid ${isRunning ? `color-mix(in srgb, ${color} 70%, transparent)` : isDone ? `color-mix(in srgb, ${color} 45%, transparent)` : isError ? 'var(--danger)' : 'var(--border)'}`,
              background: isRunning ? `color-mix(in srgb, ${color} 12%, transparent)` : isDone ? `color-mix(in srgb, ${color} 6%, transparent)` : isError ? 'var(--danger-subtle)' : 'var(--bg-inset)',
              transition: 'all 0.3s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, background: 'var(--bg-card)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}>
                  {index + 1}
                </span>
                <StatusIcon status={state.status} color={color} />
              </div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>{step.label}</h3>
              <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 600, color: isRunning || isDone ? color : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {STATUS_LABEL[state.status] || 'Waiting'}
              </p>
              <p style={{ margin: '10px 0 0', minHeight: 32, fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{state.message}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function StatusIcon({ status, color }) {
  if (status === 'done') {
    return (
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--success)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        ✓
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        !
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span style={{ position: 'relative', width: 22, height: 22, borderRadius: '50%', background: `color-mix(in srgb, ${color} 20%, transparent)`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Running">
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `color-mix(in srgb, ${color} 30%, transparent)`, animation: 'pipelinePing 1.4s cubic-bezier(0,0,0.2,1) infinite' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', position: 'relative' }} />
      </span>
    )
  }
  return <span style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--bg-card)' }} />
}

export default memo(PipelineFlow)