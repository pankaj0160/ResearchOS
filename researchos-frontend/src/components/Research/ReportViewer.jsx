import { memo, useCallback, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function ReportViewer({ report, feedback, status, error, topic }) {
  const [copied, setCopied] = useState(false)
  const hasReport = report.trim().length > 0
  const hasFeedback = feedback.trim().length > 0
  const exportContent = useMemo(() => {
    if (!hasFeedback) return report
    return `${report.trim()}\n\n---\n\n## Critic Review\n\n${feedback.trim()}\n`
  }, [feedback, hasFeedback, report])
  const wordCount = useMemo(() => report.split(/\s+/).filter(Boolean).length, [report])
  const feedbackWordCount = useMemo(() => feedback.split(/\s+/).filter(Boolean).length, [feedback])

  const copyReport = useCallback(async () => {
    if (!hasReport) return
    try {
      await navigator.clipboard.writeText(exportContent)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }, [exportContent, hasReport])

  const downloadReport = useCallback(() => {
    if (!hasReport) return
    const blob = new Blob([exportContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${slugify(topic || 'orchestrai-report')}.md`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [exportContent, hasReport, topic])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Research Result</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{statusLabel(status, hasReport, hasFeedback)}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyReport}
            disabled={!hasReport}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={downloadReport}
            disabled={!hasReport}
            className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:focus:ring-offset-slate-950 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          >
            Download
          </button>
        </div>
      </div>

      <div className="max-h-[700px] min-h-[420px] overflow-y-auto p-5">
        {error && !hasReport ? (
          <StateMessage title="Report unavailable" message={error} tone="error" />
        ) : hasReport ? (
          <div className="space-y-8">
            <article>
              <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-semibold text-slate-950 dark:text-white">Final Report</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Writer Agent output rendered as Markdown.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {wordCount.toLocaleString()} words
                </span>
              </div>
              <div className="report-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {report}
                </ReactMarkdown>
              </div>
            </article>

            <section className="border-t border-indigo-200 pt-6 dark:border-indigo-900" aria-labelledby="critic-review-title">
              <div className="mb-4 flex flex-col gap-1 border-b border-indigo-200 pb-4 dark:border-indigo-900 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 id="critic-review-title" className="text-base font-semibold text-slate-950 dark:text-white">Critic Review</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Quality feedback, score, and improvement notes from the Critic Agent.
                  </p>
                </div>
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                  {hasFeedback ? `${feedbackWordCount.toLocaleString()} words` : 'Waiting for critique'}
                </span>
              </div>

              {hasFeedback ? (
                <div className="report-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {feedback}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  The critique will appear here as soon as the Critic Agent completes.
                </p>
              )}
            </section>
          </div>
        ) : (
          <StateMessage title={emptyTitle(status)} message={emptyMessage(status)} />
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>{hasReport ? `${wordCount.toLocaleString()} report words` : 'No report content yet'}</span>
        {hasFeedback && <span>Critique included in copy and download</span>}
      </div>
    </section>
  )
}

function StateMessage({ title, message, tone = 'default' }) {
  const isError = tone === 'error'
  return (
    <div className={`flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center ${isError ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300' : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6">{message}</p>
    </div>
  )
}

function statusLabel(status, hasReport, hasFeedback) {
  if (hasReport && hasFeedback && status === 'completed') return 'Report Ready with Critic Review'
  if (hasReport && status === 'completed') return 'Report Ready'
  if (hasReport) return 'Generating Report'
  if (status === 'loading') return 'Loading'
  if (status === 'running') return 'Pipeline Running'
  if (status === 'generating_report') return 'Generating Report'
  if (status === 'failed') return 'Failed'
  return 'Ready'
}

function emptyTitle(status) {
  if (status === 'loading') return 'Starting pipeline'
  if (status === 'running') return 'Pipeline running'
  if (status === 'generating_report') return 'Generating report'
  return 'Report will appear here'
}

function emptyMessage(status) {
  if (status === 'idle') return 'Start research to generate a polished Markdown report and critic review.'
  if (status === 'generating_report') return 'The Writer Agent is composing the report. Content will appear as soon as it is available.'
  return 'The dashboard will keep this area stable while agents work.'
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'orchestrai-report'
}

export default memo(ReportViewer)
