/**
 * AgentCard — displays real-time status for a single agent.
 * Shown in the 2×2 grid beneath the pipeline flow.
 */

const COLOR_MAP = {
  amber:  { text: 'text-amber',  border: 'border-amber',  bg: 'bg-amber',  hex: '#f59e0b' },
  teal:   { text: 'text-teal',   border: 'border-teal',   bg: 'bg-teal',   hex: '#14b8a6' },
  indigo: { text: 'text-indigo', border: 'border-indigo', bg: 'bg-indigo', hex: '#6366f1' },
  green:  { text: 'text-green',  border: 'border-green',  bg: 'bg-green',  hex: '#22c55e' },
}

const STATUS_LABEL = {
  idle:    'Idle',
  running: 'Running',
  done:    'Complete',
  error:   'Error',
}

export default function AgentCard({ agent, state, isActive }) {
  const { label, color, icon, desc, tool: agentTool } = agent
  const { status, activity, tool: activeTool } = state || {}
  const colors = COLOR_MAP[color]
  const isRunning = status === 'running'
  const isDone    = status === 'done'
  const isError   = status === 'error'

  return (
    <div className={`relative rounded-xl border bg-[var(--bg-card)] overflow-hidden
                     transition-all duration-400
                     ${isActive ? `${colors.border} ${getGlow(color)}` : 'border-[var(--border)]'}
                     ${isDone   ? `${colors.border} opacity-90` : ''}
                     ${isError  ? 'border-red-500' : ''}`}>

      {/* Top accent stripe */}
      <div className={`h-[2px] w-full transition-all duration-500
                       ${isRunning ? `${colors.bg} animate-pulse` : ''}
                       ${isDone    ? colors.bg : ''}
                       ${isError   ? 'bg-red-500' : ''}
                       ${status === 'idle' ? 'bg-[var(--border)]' : ''}`} />

      {/* Running glow layer */}
      {isActive && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04] rounded-xl"
          style={{ background: colors.hex }}
        />
      )}

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {/* Icon */}
            <div className={`text-xl w-8 h-8 flex items-center justify-center rounded-lg
                             border transition-all duration-300
                             ${status !== 'idle'
                               ? `${colors.text} ${colors.border} bg-[var(--bg-hover)]`
                               : 'text-[var(--zinc-600)] border-[var(--border)]'}`}>
              {icon}
            </div>
            {/* Name + desc */}
            <div>
              <div className={`text-xs font-display font-600 transition-colors duration-300
                               ${status !== 'idle' ? colors.text : 'text-[var(--zinc-400)]'}`}>
                {label}
              </div>
              <div className="text-[10px] text-[var(--zinc-600)] font-mono mt-px">
                {desc}
              </div>
            </div>
          </div>

          {/* Status pill */}
          <StatusPill status={status} colors={colors} />
        </div>

        {/* Activity row */}
        <div className="min-h-[28px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]
                        px-2.5 py-1.5 flex items-center gap-2">
          {isRunning && (
            <span className="flex-shrink-0 flex gap-[3px] items-center">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className={`w-1 h-1 rounded-full ${colors.bg}`}
                  style={{ animation: `blink 1.2s ease ${i * 0.25}s infinite` }}
                />
              ))}
            </span>
          )}
          {isDone && (
            <span className={`flex-shrink-0 text-[10px] ${colors.text}`}>✓</span>
          )}
          <span className="text-[10px] font-mono text-[var(--zinc-500)] leading-relaxed line-clamp-2">
            {activity || 'Waiting...'}
          </span>
        </div>

        {/* Tool badge row */}
        <div className="mt-2 flex items-center gap-2">
          {agentTool && (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border
                             text-[9px] font-mono transition-all duration-300
                             ${isRunning
                               ? `border-[${colors.hex}] ${colors.text} bg-[var(--bg-hover)]`
                               : 'border-[var(--border)] text-[var(--zinc-700)]'}`}>
              <span className={`w-1 h-1 rounded-full flex-shrink-0
                                ${isRunning ? `${colors.bg} animate-pulse` : 'bg-[var(--zinc-700)]'}`} />
              {agentTool}
            </div>
          )}

          {/* Step indicator */}
          <div className="ml-auto text-[9px] font-mono text-[var(--zinc-700)]">
            {isRunning ? 'processing...' : isDone ? 'finished' : 'queued'}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status, colors }) {
  const configs = {
    idle:    { label: 'IDLE',     cls: 'border-[var(--border)] text-[var(--zinc-600)]'     },
    running: { label: 'ACTIVE',   cls: `${colors.border} ${colors.text} animate-pulse`     },
    done:    { label: 'DONE',     cls: `${colors.border} ${colors.text}`                   },
    error:   { label: 'ERROR',    cls: 'border-red-500 text-red-500'                       },
  }
  const cfg = configs[status] || configs.idle

  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[8px]
                     font-mono tracking-wider flex-shrink-0 ${cfg.cls}`}>
      <div className={`w-1 h-1 rounded-full
                       ${status === 'running' ? `${colors.bg} animate-ping` : 'bg-current'}`} />
      {cfg.label}
    </div>
  )
}

function getGlow(color) {
  const map = {
    amber:  'shadow-[0_0_24px_#f59e0b18]',
    teal:   'shadow-[0_0_24px_#14b8a618]',
    indigo: 'shadow-[0_0_24px_#6366f118]',
    green:  'shadow-[0_0_24px_#22c55e18]',
  }
  return map[color] || ''
}
