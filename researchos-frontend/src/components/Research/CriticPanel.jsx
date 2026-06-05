import { useMemo, useState } from 'react'

/**
 * Parses the critic's output which follows this format:
 *
 *   Score: X/10
 *
 *   Strengths:
 *   - point 1
 *
 *   Areas to Improve:
 *   - point 1
 *
 *   One line verdict:
 *   your verdict
 */
function parseFeedback(text) {
  if (!text) return null

  const scoreMatch    = text.match(/Score:\s*(\d+(?:\.\d+)?)\/10/i)
  const score         = scoreMatch ? parseFloat(scoreMatch[1]) : null

  const strengthsMatch = text.match(/Strengths?:\s*\n([\s\S]*?)(?=\n\s*Areas?|One line|$)/i)
  const strengths      = strengthsMatch
    ? strengthsMatch[1].trim().split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
    : []

  const areasMatch = text.match(/Areas? to Improve:\s*\n([\s\S]*?)(?=\nOne line|$)/i)
  const areas      = areasMatch
    ? areasMatch[1].trim().split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
    : []

  const verdictMatch = text.match(/One line verdict:\s*\n?(.*)/i)
  const verdict      = verdictMatch ? verdictMatch[1].trim() : null

  return { score, strengths, areas, verdict }
}

// Score → color thresholds
function scoreColor(score) {
  if (score === null) return { text: 'text-[var(--zinc-500)]', stroke: '#52525b' }
  if (score >= 8)     return { text: 'text-green',             stroke: '#22c55e' }
  if (score >= 6)     return { text: 'text-teal',              stroke: '#14b8a6' }
  if (score >= 4)     return { text: 'text-amber',             stroke: '#f59e0b' }
  return                     { text: 'text-red-400',           stroke: '#f87171' }
}

export default function CriticPanel({ feedback, isStreaming }) {
  const [showRaw, setShowRaw] = useState(false)
  const parsed = useMemo(() => parseFeedback(feedback), [feedback])
  const isEmpty = !feedback || feedback.trim().length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0
                      border-b border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green"
               style={{ boxShadow: isStreaming ? '0 0 6px #22c55e' : 'none' }} />
          <span className="text-[10px] font-mono text-[var(--zinc-500)] uppercase tracking-widest">
            Critic Feedback
          </span>
          {isStreaming && (
            <span className="text-[9px] font-mono text-green animate-pulse ml-1">
              ● evaluating
            </span>
          )}
        </div>
        {!isEmpty && (
          <button
            onClick={() => setShowRaw(v => !v)}
            className="text-[10px] font-mono text-[var(--zinc-600)] hover:text-[var(--zinc-400)]
                       px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--bg-card)]
                       transition-all duration-150"
          >
            {showRaw ? 'Structured' : 'Raw'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-[var(--bg-surface)]">
        {isEmpty ? (
          <EmptyState />
        ) : showRaw ? (
          /* ── Raw view ── */
          <pre className="text-[10px] font-mono text-[var(--zinc-500)] whitespace-pre-wrap
                          leading-relaxed animate-fade-in">
            {feedback}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3 bg-green animate-blink ml-0.5 align-middle" />
            )}
          </pre>
        ) : parsed ? (
          /* ── Structured view ── */
          <StructuredFeedback parsed={parsed} isStreaming={isStreaming} />
        ) : (
          /* ── Fallback: raw if parsing failed ── */
          <pre className="text-[10px] font-mono text-[var(--zinc-500)] whitespace-pre-wrap leading-relaxed">
            {feedback}
          </pre>
        )}
      </div>
    </div>
  )
}

function StructuredFeedback({ parsed, isStreaming }) {
  const { score, strengths, areas, verdict } = parsed
  const colors = scoreColor(score)

  // SVG ring: r=34 → circumference ≈ 213.6
  const CIRC  = 213.6
  const offset = score !== null ? CIRC - (score / 10) * CIRC : CIRC

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Score ring */}
      {score !== null && (
        <div className="flex items-center gap-5 p-4 rounded-xl border border-[var(--border)]
                        bg-[var(--bg-card)]">
          {/* Ring */}
          <div className="relative flex-shrink-0 w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 80 80">
              {/* Track */}
              <circle cx="40" cy="40" r="34" fill="none"
                      stroke="var(--border)" strokeWidth="5" />
              {/* Fill */}
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke={colors.stroke} strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC}
                className="score-ring"
                style={{ '--target-offset': offset }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-sm font-display font-700 ${colors.text}`}>
                {score}
              </span>
            </div>
          </div>

          {/* Score meta */}
          <div>
            <div className={`text-xl font-display font-800 ${colors.text}`}>
              {score}/10
            </div>
            <div className="text-[10px] font-mono text-[var(--zinc-600)] mt-0.5">
              Quality Score
            </div>
            {verdict && (
              <p className="text-[11px] text-[var(--zinc-500)] mt-1.5 leading-relaxed max-w-[240px]">
                "{verdict}"
              </p>
            )}
          </div>
        </div>
      )}

      {/* Strengths */}
      {strengths.length > 0 && (
        <FeedbackSection
          title="Strengths"
          items={strengths}
          icon="↑"
          color="text-green"
          borderColor="border-green/20"
          dotColor="bg-green"
        />
      )}

      {/* Areas to Improve */}
      {areas.length > 0 && (
        <FeedbackSection
          title="Areas to Improve"
          items={areas}
          icon="↗"
          color="text-amber"
          borderColor="border-amber/20"
          dotColor="bg-amber"
        />
      )}

      {/* Streaming tail */}
      {isStreaming && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--zinc-600)]">
          <span className="animate-pulse text-green">◉</span>
          Evaluating...
        </div>
      )}
    </div>
  )
}

function FeedbackSection({ title, items, icon, color, borderColor, dotColor }) {
  return (
    <div className={`rounded-xl border ${borderColor} bg-[var(--bg-card)] overflow-hidden`}>
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <span className={`text-xs ${color}`}>{icon}</span>
        <span className={`text-[10px] font-mono font-500 uppercase tracking-widest ${color}`}>
          {title}
        </span>
      </div>
      {/* Items */}
      <ul className="p-3 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5 flex-shrink-0`} />
            <span className="text-[11px] text-[var(--zinc-500)] leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 min-h-[160px]">
      <div className="w-10 h-10 rounded-xl border border-[var(--border)] flex items-center
                      justify-center text-[var(--zinc-700)] text-lg">
        ◉
      </div>
      <div className="text-center">
        <p className="text-[11px] font-mono text-[var(--zinc-600)]">
          Awaiting critique
        </p>
        <p className="text-[10px] text-[var(--zinc-700)] mt-1">
          Critic Agent runs after Writer finishes
        </p>
      </div>
    </div>
  )
}
