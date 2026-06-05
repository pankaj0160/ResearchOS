import { memo, useCallback, useState } from 'react'

const SUGGESTIONS = [
  'AI in healthcare 2026',
  'Quantum computing breakthroughs',
  'Climate tech innovations',
  'Autonomous vehicle progress',
]

function TopicInput({ onStart, onClear, isRunning, canRetry, onRetry, currentTopic }) {
  const [topic, setTopic] = useState('')

  const submit = useCallback((event) => {
    event.preventDefault()
    const cleanTopic = topic.trim()
    if (cleanTopic && !isRunning) onStart(cleanTopic)
  }, [isRunning, onStart, topic])

  const clear = useCallback(() => {
    setTopic('')
    onClear()
  }, [onClear])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Research Card</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter a topic and launch the multi-agent pipeline.</p>
        </div>
        {currentTopic && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Current: {currentTopic}
          </span>
        )}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 lg:flex-row">
        <label className="sr-only" htmlFor="topic">Research topic</label>
        <input
          id="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          disabled={isRunning}
          placeholder="Enter a research topic..."
          className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:disabled:bg-slate-800"
        />
        <button
          type="submit"
          disabled={!topic.trim() || isRunning}
          className="min-h-12 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 dark:focus:ring-offset-slate-950 dark:disabled:bg-slate-700"
        >
          {isRunning ? 'Running' : 'Start Research'}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={isRunning && !currentTopic}
          className="min-h-12 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
        >
          Clear
        </button>
        {canRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-12 rounded-xl border border-rose-300 px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40 dark:focus:ring-offset-slate-950"
          >
            Retry
          </button>
        )}
      </form>

      {!isRunning && !topic && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setTopic(suggestion)}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default memo(TopicInput)
