import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

function Navbar({ onReset }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">

        {/* Logo */}
        <Link
          to="/research"
          className="flex items-center gap-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 shrink-0"
          aria-label="OrchestrAI dashboard"
        >
          <span className="grid h-8 w-8 grid-cols-2 gap-0.5 rounded-lg bg-slate-950 p-1.5 dark:bg-white sm:h-9 sm:w-9">
            <span className="rounded-sm bg-amber-400" />
            <span className="rounded-sm bg-teal-400" />
            <span className="rounded-sm bg-indigo-400" />
            <span className="rounded-sm bg-emerald-400" />
          </span>
          <span>
            <span className="block text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">
              OrchestrAI
            </span>
            {/* Hide subtitle on very small screens */}
            <span className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
              Research Pipeline
            </span>
          </span>
        </Link>

        {/* Desktop right side */}
        <div className="ml-auto hidden items-center gap-3 sm:flex">
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

        {/* Mobile right side — compact */}
        <div className="ml-auto flex items-center gap-2 sm:hidden">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              New
            </button>
          )}
          {/* Mobile theme toggle — icon only */}
          <ThemeToggle iconOnly />
        </div>

      </div>
    </header>
  )
}

export default memo(Navbar)