/**
 * ExecutionLog.jsx
 * Location: src/components/Research/ExecutionLog.jsx
 *
 * Milestone + raw-event log shown beneath the pipeline. Previously
 * hardcoded Tailwind slate/indigo classes. Rewritten to the app's CSS
 * variable system, with milestones colored by which agent produced
 * them (search/reader/writer/critic) instead of one flat indigo tone.
 */
import { memo, useMemo, useState } from 'react'

const AGENT_COLOR = {
  search: 'var(--agent-search)',
  reader: 'var(--agent-reader)',
  writer: 'var(--agent-writer)',
  critic: 'var(--agent-critic)',
  final:  'var(--accent)',
  system: 'var(--text-muted)',
}

function ExecutionLog({ milestones, rawLogs, collapsedCount, isRunning }) {
  const [showDetails, setShowDetails] = useState(false)
  const visibleRawLogs = useMemo(() => rawLogs.slice(-250), [rawLogs])

  return (
    <section style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', padding: '1rem 1.25rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16.5, color: 'var(--text-primary)', margin: 0 }}>Logs</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>Milestones by default. Raw events stay available when needed.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowDetails((value) => !value)}
          aria-expanded={showDetails}
          className="exec-log-toggle"
          style={{
            borderRadius: 8, border: '1px solid var(--border)', padding: '7px 13px',
            fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)',
            background: 'var(--bg-inset)', cursor: 'pointer', transition: 'all 0.18s',
          }}
        >
          {showDetails ? 'Hide Detailed Logs' : 'Show Detailed Logs'}
        </button>
      </div>

      <div style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-live="polite" aria-atomic="false">
          {collapsedCount > 0 && (
            <div style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-inset)', padding: '8px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
              {collapsedCount} older milestones collapsed
            </div>
          )}

          {milestones.length === 0 ? (
            <div style={{ borderRadius: 8, border: '1px dashed var(--border-strong)', padding: '1.4rem 1rem', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              Pipeline milestones will appear here.
            </div>
          ) : (
            milestones.map((item) => <Milestone key={item.id} item={item} />)
          )}

          {isRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', animation: 'pulse-slow 1.4s ease-in-out infinite' }} />
              Pipeline running
            </div>
          )}
        </div>

        {showDetails && (
          <div
            tabIndex={0}
            aria-label="Detailed execution logs"
            style={{
              marginTop: 16, height: 300, overflowY: 'auto', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-inset)',
              padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)',
            }}
          >
            {visibleRawLogs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No raw events yet.</p>
            ) : (
              visibleRawLogs.map((log) => <RawLogLine key={log.id} log={log} />)
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function Milestone({ item }) {
  const color = AGENT_COLOR[item.agent] || AGENT_COLOR.system
  const isError = item.status === 'error'
  const isRunning = item.status === 'running'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8,
      border: `1px solid ${isError ? 'var(--danger)' : `color-mix(in srgb, ${color} 40%, transparent)`}`,
      background: isError ? 'var(--danger-subtle)' : `color-mix(in srgb, ${color} 6%, transparent)`,
      padding: '8px 12px', fontSize: 13, fontWeight: 600,
      color: isError ? 'var(--danger)' : color,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700,
      }}>
        {isError ? '!' : isRunning ? '•' : '✓'}
      </span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.label}</span>
    </div>
  )
}

function RawLogLine({ log }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '84px 84px 1fr', gap: 8, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
      <span style={{ textTransform: 'uppercase', color: 'var(--text-muted)' }}>{log.agent || 'system'}</span>
      <span style={{ textTransform: 'uppercase', color: 'var(--text-faint)' }}>{log.type || 'event'}</span>
      <span style={{ wordBreak: 'break-word', color: 'var(--text-secondary)' }}>{log.msg || ''}</span>
    </div>
  )
}

export default memo(ExecutionLog)