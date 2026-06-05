import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
export const AGENTS = ['search', 'reader', 'writer', 'critic', 'final']
export const PIPELINE_STEPS = [
  { key: 'search', label: 'Search', waiting: 'Waiting', running: 'Searching sources', done: 'Search Agent Completed' },
  { key: 'reader', label: 'Read Sources', waiting: 'Waiting', running: 'Reading sources', done: 'Reader Agent Completed' },
  { key: 'writer', label: 'Generate Report', waiting: 'Waiting', running: 'Generating report', done: 'Writer Agent Completed' },
  { key: 'critic', label: 'Critique', waiting: 'Waiting', running: 'Reviewing quality', done: 'Critic Agent Completed' },
  { key: 'final', label: 'Final Report', waiting: 'Waiting', running: 'Finalizing report', done: 'Report Generated' },
]

const RAW_LOG_LIMIT = 1000
const STREAM_TIMEOUT_MS = 120000

const initialSteps = () => PIPELINE_STEPS.reduce((acc, step) => {
  acc[step.key] = { status: 'idle', message: step.waiting }
  return acc
}, {})

export function useSSEStream() {
  const [rawLogs, setRawLogs] = useState([])
  const [milestones, setMilestones] = useState([])
  const [steps, setSteps] = useState(initialSteps)
  const [report, setReport] = useState('')
  const [feedback, setFeedback] = useState('')
  const [runStatus, setRunStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [topic, setTopic] = useState('')
  const [runId, setRunId] = useState(null)

  const eventSourceRef = useRef(null)
  const timeoutRef = useRef(null)
  const seqRef = useRef(0)
  const reportRef = useRef('')
  const feedbackRef = useRef('')
  const lastTopicRef = useRef('')

  const closeStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => closeStream, [closeStream])

  const pushRawLog = useCallback((event) => {
    setRawLogs((prev) => {
      const next = [...prev, { ...event, id: seqRef.current++, ts: Date.now() }]
      return next.length > RAW_LOG_LIMIT ? next.slice(next.length - RAW_LOG_LIMIT) : next
    })
  }, [])

  const pushMilestone = useCallback((label, status = 'done', agent = 'system') => {
    setMilestones((prev) => {
      if (prev.some((item) => item.label === label && item.status === status)) return prev
      return [...prev, { id: `m-${seqRef.current++}`, label, status, agent, ts: Date.now() }]
    })
  }, [])

  const patchStep = useCallback((key, patch) => {
    setSteps((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }, [])

  const failRun = useCallback((message, agent = 'system') => {
    closeStream()
    const safeMessage = normalizeError(message)
    setError(safeMessage)
    setRunStatus('failed')
    if (agent && stepsKey(agent)) {
      patchStep(agent, { status: 'error', message: safeMessage })
    }
    pushMilestone(safeMessage, 'error', agent)
  }, [closeStream, patchStep, pushMilestone])

  const handleEvent = useCallback((event) => {
    const agent = event.agent || 'system'
    const type = event.type || 'message'
    const message = event.msg || ''

    pushRawLog(event)

    if (type === 'error') {
      failRun(message, agent)
      return
    }

    if (agent === 'writer' && type === 'streaming') {
      reportRef.current += message
      setReport(reportRef.current)
      setRunStatus('generating_report')
      patchStep('writer', { status: 'running', message: 'Generating report' })
      return
    }

    if (agent === 'critic' && type === 'streaming') {
      feedbackRef.current += message
      setFeedback(feedbackRef.current)
      patchStep('critic', { status: 'running', message: 'Reviewing report quality' })
      return
    }

    if (type === 'final_report') {
      const finalReport = typeof event.report === 'string' ? event.report : reportRef.current
      const finalFeedback = typeof event.feedback === 'string' ? event.feedback : feedbackRef.current

      reportRef.current = finalReport
      feedbackRef.current = finalFeedback
      setReport(finalReport)
      setFeedback(finalFeedback)
      setRunId(event.run_id || null)
      patchStep('writer', { status: finalReport.trim() ? 'done' : 'error', message: finalReport.trim() ? 'Writer Agent Completed' : 'Empty report returned' })
      patchStep('critic', { status: 'done', message: 'Critic Agent Completed' })
      patchStep('final', { status: finalReport.trim() ? 'done' : 'error', message: finalReport.trim() ? 'Report Generated' : 'No report content was returned' })
      pushMilestone(finalReport.trim() ? 'Report Generated' : 'No report content was returned', finalReport.trim() ? 'done' : 'error')
      setRunStatus(finalReport.trim() ? 'completed' : 'failed')
      if (!finalReport.trim()) setError('The pipeline finished but returned an empty report. Please retry.')
      closeStream()
      return
    }

    if (agent === 'system' && type === 'complete') {
      if (reportRef.current.trim()) {
        patchStep('final', { status: 'done', message: 'Report Generated' })
        setRunStatus('completed')
      }
      closeStream()
      return
    }

    if (!stepsKey(agent)) return

    if (type === 'thinking' || type === 'tool_call' || type === 'result') {
      setRunStatus(agent === 'writer' ? 'generating_report' : 'running')
      patchStep(agent, { status: 'running', message: message || 'Running' })
      if (agent === 'search' && milestones.length === 0) {
        pushMilestone('Research Started', 'running', 'search')
      }
    }

    if (type === 'complete') {
      const step = PIPELINE_STEPS.find((item) => item.key === agent)
      patchStep(agent, { status: 'done', message: step?.done || 'Completed' })
      pushMilestone(step?.done || `${agent} completed`, 'done', agent)
      if (agent === 'writer') {
        patchStep('final', { status: 'running', message: 'Preparing final report' })
      }
    }
  }, [closeStream, failRun, milestones.length, patchStep, pushMilestone, pushRawLog])

  const start = useCallback((nextTopic) => {
    const cleanTopic = nextTopic.trim()
    if (!cleanTopic) return

    closeStream()
    seqRef.current = 0
    reportRef.current = ''
    feedbackRef.current = ''
    lastTopicRef.current = cleanTopic

    setTopic(cleanTopic)
    setRawLogs([])
    setMilestones([{ id: 'm-start', label: 'Research Started', status: 'running', agent: 'search', ts: Date.now() }])
    setSteps({
      ...initialSteps(),
      search: { status: 'running', message: 'Starting research' },
    })
    setReport('')
    setFeedback('')
    setError(null)
    setRunId(null)
    setRunStatus('loading')

    const token = localStorage.getItem('researchos_token')
    const source = new EventSource(
      `/api/research/stream?topic=${encodeURIComponent(cleanTopic)}${token ? `&token=${token}` : ''}`
    )
    eventSourceRef.current = source

    timeoutRef.current = window.setTimeout(() => {
      failRun('The research stream timed out. Please retry.', 'system')
    }, STREAM_TIMEOUT_MS)

    source.onopen = () => {
      setRunStatus('running')
      patchStep('search', { status: 'running', message: 'Searching sources' })
    }

    source.onmessage = (event) => {
      try {
        handleEvent(JSON.parse(event.data))
      } catch {
        pushRawLog({ agent: 'system', type: 'error', msg: 'Received an unreadable stream event.' })
      }
    }

    source.onerror = () => {
      failRun('Connection lost. Check that the backend is running and retry.', 'system')
    }
  }, [closeStream, failRun, handleEvent, patchStep, pushRawLog])

  const reset = useCallback(() => {
    closeStream()
    seqRef.current = 0
    reportRef.current = ''
    feedbackRef.current = ''
    lastTopicRef.current = ''
    setRawLogs([])
    setMilestones([])
    setSteps(initialSteps())
    setReport('')
    setFeedback('')
    setRunStatus('idle')
    setError(null)
    setTopic('')
    setRunId(null)
  }, [closeStream])

  const retry = useCallback(() => {
    if (lastTopicRef.current) start(lastTopicRef.current)
  }, [start])

  const visibleMilestones = useMemo(() => milestones.slice(-20), [milestones])

  return {
    rawLogs,
    milestones: visibleMilestones,
    collapsedMilestoneCount: Math.max(0, milestones.length - visibleMilestones.length),
    steps,
    report,
    feedback,
    runStatus,
    error,
    topic,
    runId,
    isRunning: runStatus === 'loading' || runStatus === 'running' || runStatus === 'generating_report',
    isDone: runStatus === 'completed',
    start,
    reset,
    retry,
  }
}

function stepsKey(agent) {
  return PIPELINE_STEPS.some((step) => step.key === agent)
}

function normalizeError(message) {
  if (!message) return 'Something went wrong while running the research pipeline.'
  if (/failed|error|lost|timeout|empty|backend|connection/i.test(message)) return message
  return 'Something went wrong while running the research pipeline. Please retry.'
}
