import { memo, useMemo, useState } from 'react'

function ExecutionLog({ milestones, rawLogs, collapsedCount, isRunning }) {
  const [showDetails, setShowDetails] = useState(false)
  const visibleRawLogs = useMemo(() => rawLogs.slice(-250), [rawLogs])

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Logs</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Milestones by default. Raw events stay available when needed.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowDetails((value) => !value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
          aria-expanded={showDetails}
        >
          {showDetails ? 'Hide Detailed Logs' : 'Show Detailed Logs'}
        </button>
      </div>

      <div className="p-5">
        <div className="space-y-2" aria-live="polite" aria-atomic="false">
          {collapsedCount > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              {collapsedCount} older milestones collapsed
            </div>
          )}

          {milestones.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Pipeline milestones will appear here.
            </div>
          ) : (
            milestones.map((item) => <Milestone key={item.id} item={item} />)
          )}

          {isRunning && (
            <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
              Pipeline running
            </div>
          )}
        </div>

        {showDetails && (
          <div className="mt-4 h-[300px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-200 dark:border-slate-800" tabIndex={0} aria-label="Detailed execution logs">
            {visibleRawLogs.length === 0 ? (
              <p className="text-slate-500">No raw events yet.</p>
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
  const styles = {
    running: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300',
    done: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
    error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium ${styles[item.status] || styles.done}`}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/70 text-xs font-bold dark:bg-slate-950/60">
        {item.status === 'error' ? '!' : item.status === 'running' ? '•' : '✓'}
      </span>
      <span>{item.label}</span>
    </div>
  )
}

function RawLogLine({ log }) {
  return (
    <div className="grid grid-cols-[84px_84px_1fr] gap-2 border-b border-white/5 py-1 last:border-b-0">
      <span className="uppercase text-slate-500">{log.agent || 'system'}</span>
      <span className="uppercase text-slate-400">{log.type || 'event'}</span>
      <span className="break-words text-slate-200">{log.msg || ''}</span>
    </div>
  )
}

export default memo(ExecutionLog)
