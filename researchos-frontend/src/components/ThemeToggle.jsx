import { memo } from 'react'
import { useTheme } from '../context/ThemeProvider'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900" role="group" aria-label="Theme selection">
      {['light', 'dark'].map((option) => {
        const active = theme === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => setTheme(option)}
            aria-pressed={active}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 ${
              active
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

export default memo(ThemeToggle)
