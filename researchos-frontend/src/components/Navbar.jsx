import { memo } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

function Navbar({ onReset }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/research" className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950" aria-label="OrchestrAI dashboard">
          <span className="grid h-9 w-9 grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1.5 dark:bg-white">
            <span className="rounded-sm bg-amber-400" />
            <span className="rounded-sm bg-teal-400" />
            <span className="rounded-sm bg-indigo-400" />
            <span className="rounded-sm bg-emerald-400" />
          </span>
          <span>
            <span className="block text-base font-bold tracking-tight text-slate-950 dark:text-white">OrchestrAI</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">Research Pipeline</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:focus:ring-offset-slate-950"
            >
              New Research
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

export default memo(Navbar)
