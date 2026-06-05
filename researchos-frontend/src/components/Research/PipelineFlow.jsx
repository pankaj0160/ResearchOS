import { memo } from 'react'
import { PIPELINE_STEPS } from '../../hooks/useSSEStream'

const STATUS_LABEL = {
  idle: 'Waiting',
  running: 'Running',
  done: 'Completed',
  error: 'Error',
}

function PipelineFlow({ steps }) {
  const completeCount = PIPELINE_STEPS.filter((step) => steps[step.key]?.status === 'done').length
  const progress = Math.round((completeCount / PIPELINE_STEPS.length) * 100)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Pipeline progress">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Pipeline Progress</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Real-time agent status timeline.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {progress}%
        </span>
      </div>

      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <ol className="grid gap-3 md:grid-cols-5">
        {PIPELINE_STEPS.map((step, index) => {
          const state = steps[step.key] || { status: 'idle', message: step.waiting }
          return (
            <li key={step.key} className={`relative rounded-xl border p-4 transition ${
              state.status === 'running'
                ? 'border-indigo-300 bg-indigo-50 shadow-sm dark:border-indigo-900 dark:bg-indigo-950/40'
                : state.status === 'done'
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                  : state.status === 'error'
                    ? 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950'
            }`}>
              <div className="mb-3 flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                  {index + 1}
                </span>
                <StatusIcon status={state.status} />
              </div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{step.label}</h3>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{STATUS_LABEL[state.status] || 'Waiting'}</p>
              <p className="mt-3 min-h-8 text-xs leading-5 text-slate-600 dark:text-slate-300">{state.message}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function StatusIcon({ status }) {
  if (status === 'done') {
    return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">OK</span>
  }
  if (status === 'error') {
    return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white">!</span>
  }
  if (status === 'running') {
    return (
      <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" aria-label="Running">
        <span className="absolute h-7 w-7 animate-ping rounded-full bg-indigo-400/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-current" />
      </span>
    )
  }
  return <span className="h-7 w-7 rounded-full border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900" />
}

export default memo(PipelineFlow)
