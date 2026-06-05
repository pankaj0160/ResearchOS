import { useCallback, useRef, useState } from 'react'
import { newsApi } from '../services/newsApi'

/**
 * useNews — manages News page state:
 *   search input, category, days filter,
 *   articles list, streaming AI summary, loading states
 */
export function useNews() {
  const [topic,     setTopic]     = useState('')
  const [category,  setCategory]  = useState('general')
  const [days,      setDays]      = useState(7)

  const [articles,  setArticles]  = useState([])
  const [summary,   setSummary]   = useState('')
  const [loading,   setLoading]   = useState(false)   // true while fetching+streaming
  const [streaming, setStreaming] = useState(false)   // true only during summary stream
  const [error,     setError]     = useState('')
  const [searched,  setSearched]  = useState(false)   // has user ever searched?

  const abortRef = useRef(null)   // future: AbortController for cancellation

  const search = useCallback(async (overrideTopic) => {
    const q = (overrideTopic ?? topic).trim()
    if (!q) return

    setError('')
    setLoading(true)
    setStreaming(false)
    setArticles([])
    setSummary('')
    setSearched(true)

    await newsApi.summarize(q, category, days, {
      onArticles(arts) {
        setArticles(arts)
        setStreaming(true)
      },
      onChunk(chunk) {
        setSummary(prev => prev + chunk)
      },
      onDone() {
        setLoading(false)
        setStreaming(false)
      },
      onError(msg) {
        setError(msg)
        setLoading(false)
        setStreaming(false)
      },
    })
  }, [topic, category, days])

  const reset = useCallback(() => {
    setTopic('')
    setArticles([])
    setSummary('')
    setError('')
    setSearched(false)
    setLoading(false)
    setStreaming(false)
  }, [])

  return {
    // inputs
    topic, setTopic,
    category, setCategory,
    days, setDays,
    // results
    articles, summary, loading, streaming, error, searched,
    // actions
    search, reset,
  }
}
