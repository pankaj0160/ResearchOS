/**
 * useDashboard.js
 * Location: src/hooks/useDashboard.js
 *
 * KEY FIX — Why requests kept repeating:
 *
 * Before: useEffect([user?.city, user?.default_topic]) fired fetchWeather +
 * fetchHeadlines every time the component mounted. Since React unmounts
 * AIDashboardPage when you navigate away and remounts when you come back,
 * every visit to /dashboard triggered 2 API calls.
 *
 * Fix: MODULE-LEVEL CACHE
 *   We store fetched data in a plain object OUTSIDE the hook function.
 *   Module-level variables survive React renders AND page navigation
 *   because they live in the JS module scope, not inside a component.
 *
 *   On first visit:  cache is empty → fetch → store in cache + state
 *   On return visit: cache has data → copy to state immediately, NO fetch
 *   On manual search: user explicitly asked → fetch + update cache
 *
 * This is the same pattern used by React Query's staleTime: "this data is
 * fresh enough, don't refetch it unless the user explicitly asks."
 *
 * Weather/headlines cache TTL: 10 minutes
 * After 10 minutes, the next visit will re-fetch automatically.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { dashboardApi } from '../services/dashboardApi'
import { useAuth }      from '../context/AuthContext'

const DEFAULT_CITY  = 'Mumbai'
const DEFAULT_TOPIC = 'world news'
const CACHE_TTL_MS  = 10 * 60 * 1000   // 10 minutes in milliseconds

// ── Module-level cache — survives navigation, cleared on browser refresh ──────
// This object is created ONCE when the module loads.
// Every component that imports useDashboard shares this same cache.
const _cache = {
  weather:   null,   // { data, city, ts }
  headlines: null,   // { data, topic, ts }
}

function isFresh(entry) {
  // Returns true if cached data is less than CACHE_TTL_MS old
  return entry && (Date.now() - entry.ts) < CACHE_TTL_MS
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useDashboard() {
  const { user } = useAuth()

  // ── Weather state ─────────────────────────────────────────────────────────
  // Initialize FROM CACHE immediately — no loading flash on return visits
  const [weather,        setWeather]        = useState(_cache.weather?.data || null)
  const [weatherInput,   setWeatherInput]   = useState(DEFAULT_CITY)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError,   setWeatherError]   = useState('')

  // ── Headlines state ───────────────────────────────────────────────────────
  const [headlines,        setHeadlines]        = useState(_cache.headlines?.data || [])
  const [headlinesTopic,   setHeadlinesTopic]   = useState(DEFAULT_TOPIC)
  const [headlinesLoading, setHeadlinesLoading] = useState(false)
  const [headlinesError,   setHeadlinesError]   = useState('')

  // ── Travel safety state ───────────────────────────────────────────────────
  const [safety,        setSafety]        = useState(null)
  const [safetyInput,   setSafetyInput]   = useState('')
  const [safetyLoading, setSafetyLoading] = useState(false)
  const [safetyError,   setSafetyError]   = useState('')

  // ── Chat state ────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput,    setChatInput]    = useState('')
  const [chatLoading,  setChatLoading]  = useState(false)
  const [chatError,    setChatError]    = useState('')

  // Ref to track if we've already run the auto-fetch this session
  // Ref survives re-renders but NOT navigation (unmount/remount)
  // That's why we combine it with the module cache: ref prevents double-fetch
  // within a single mount, cache prevents re-fetch across navigations.
  const autoFetchedRef = useRef(false)

  // ── fetchWeather — called manually or by auto-load ────────────────────────
  const fetchWeather = useCallback(async (city, { manual = false } = {}) => {
    const c = (city ?? weatherInput).trim()
    if (!c) return

    // If cache is fresh AND this is NOT a manual search → skip fetch
    if (!manual && isFresh(_cache.weather) && _cache.weather.city === c) {
      setWeather(_cache.weather.data)
      setWeatherInput(c)
      return
    }

    setWeatherError('')
    setWeatherLoading(true)
    try {
      const res  = await dashboardApi.getWeather(c)
      const data = res.data ?? res   // unwrap apiClient envelope: { data: {...}, status }
      setWeather(data)
      setWeatherInput(c)
      // Store actual weather object in cache (not the wrapper)
      _cache.weather = { data, city: c, ts: Date.now() }
    } catch (err) {
      setWeatherError(err?.response?.data?.detail || err.message || 'Weather unavailable')
    } finally {
      setWeatherLoading(false)
    }
  }, [weatherInput])

  // ── fetchHeadlines — called manually or by auto-load ─────────────────────
  const fetchHeadlines = useCallback(async (topic, { manual = false } = {}) => {
    const t = (topic ?? headlinesTopic).trim()

    // If cache is fresh AND this is NOT a manual search → skip fetch
    if (!manual && isFresh(_cache.headlines) && _cache.headlines.topic === t) {
      setHeadlines(_cache.headlines.data)
      setHeadlinesTopic(t)
      return
    }

    setHeadlinesError('')
    setHeadlinesLoading(true)
    try {
      const res  = await dashboardApi.getHeadlines(t)
      const data = res.data ?? res   // unwrap apiClient envelope
      const list = data.headlines ?? []
      setHeadlines(list)
      setHeadlinesTopic(t)
      // Store actual headlines array in cache (not the wrapper)
      _cache.headlines = { data: list, topic: t, ts: Date.now() }
    } catch (err) {
      setHeadlinesError(err?.response?.data?.detail || err.message || 'Headlines unavailable')
    } finally {
      setHeadlinesLoading(false)
    }
  }, [headlinesTopic])

  // ── fetchSafety ───────────────────────────────────────────────────────────
  const fetchSafety = useCallback(async (dest, { manual = true } = { manual: true }) => {
    const d = (dest ?? safetyInput).trim()
    if (!d) return
    setSafetyError('')
    setSafetyLoading(true)
    try {
      const res  = await dashboardApi.getTravelSafety(d)
      const data = res.data ?? res   // unwrap apiClient envelope
      setSafety(data)
      setSafetyInput(d)
    } catch (err) {
      setSafetyError(err?.response?.data?.detail || err.message || 'Safety data unavailable')
    } finally {
      setSafetyLoading(false)
    }
  }, [safetyInput])

  // ── Auto-load on first mount only ─────────────────────────────────────────
  // This effect runs when the component mounts AND when user loads.
  // autoFetchedRef prevents it running twice in the same mount.
  // The module cache prevents re-fetching on navigation back.
  useEffect(() => {
    if (autoFetchedRef.current) return   // already ran in this mount
    autoFetchedRef.current = true

    const city  = user?.city          || DEFAULT_CITY
    const topic = user?.default_topic || DEFAULT_TOPIC

    setWeatherInput(city)
    setHeadlinesTopic(topic)

    // Only fetch if cache is empty or stale
    // If cache is fresh, useState already initialized from it above
    if (!isFresh(_cache.weather)) {
      fetchWeather(city)
    }
    if (!isFresh(_cache.headlines)) {
      fetchHeadlines(topic)
    }
  // Only re-run if user becomes available after initial mount (first login)
  // NOT on every user object change — that caused the repeat requests
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // ── sendChat ──────────────────────────────────────────────────────────────
  const sendChat = useCallback(async (query) => {
    const q = (query ?? chatInput).trim()
    if (!q || chatLoading) return

    setChatError('')
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: q }])

    // Add placeholder assistant message with streaming flag
    setChatMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])
    setChatLoading(true)

    await dashboardApi.chat(q, {
      onChunk(chunk) {
        setChatMessages(prev => {
          const msgs = [...prev]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
          }
          return msgs
        })
      },
      onDone() {
        setChatMessages(prev => {
          const msgs = [...prev]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, streaming: false }
          }
          return msgs
        })
        setChatLoading(false)
      },
      onError(msg) {
        setChatMessages(prev => {
          const msgs = [...prev]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, content: `Error: ${msg}`, streaming: false, error: true }
          }
          return msgs
        })
        setChatError(msg)
        setChatLoading(false)
      },
    })
  }, [chatInput, chatLoading])

  // ── Manual search wrappers (pass manual:true to bypass cache) ─────────────
  // These are called when the user explicitly clicks Search/Fetch
  const fetchWeatherManual   = useCallback((city)  => fetchWeather(city,   { manual: true }), [fetchWeather])
  const fetchHeadlinesManual = useCallback((topic) => fetchHeadlines(topic, { manual: true }), [fetchHeadlines])

  return {
    // weather
    weather, weatherLoading, weatherError,
    weatherInput, setWeatherInput,
    fetchWeather: fetchWeatherManual,     // manual = bypass cache

    // headlines
    headlines, headlinesLoading, headlinesError,
    headlinesTopic, setHeadlinesTopic,
    fetchHeadlines: fetchHeadlinesManual, // manual = bypass cache

    // safety
    safety, safetyLoading, safetyError,
    safetyInput, setSafetyInput,
    fetchSafety,

    // chat
    chatMessages, chatInput, setChatInput,
    chatLoading, chatError, sendChat,
  }
}