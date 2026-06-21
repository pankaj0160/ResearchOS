import { useCallback, useEffect, useState } from 'react'
import { dashboardApi } from '../services/dashboardApi'
import { useAuth }       from '../context/AuthContext'

const DEFAULT_CITY = 'Mumbai'

export function useDashboard() {
  const { user } = useAuth()   // user.city and user.default_topic available here

  // ── Weather ──────────────────────────────────────────────────────────────
  const [weatherCity,    setWeatherCity]    = useState(DEFAULT_CITY)
  const [weatherInput,   setWeatherInput]   = useState(DEFAULT_CITY)
  const [weather,        setWeather]        = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError,   setWeatherError]   = useState('')

  // ── Travel Safety ─────────────────────────────────────────────────────────
  const [safetyDest,    setSafetyDest]    = useState('')
  const [safetyInput,   setSafetyInput]   = useState('')
  const [safety,        setSafety]        = useState(null)
  const [safetyLoading, setSafetyLoading] = useState(false)
  const [safetyError,   setSafetyError]   = useState('')

  // ── Headlines ─────────────────────────────────────────────────────────────
  const [headlinesTopic,   setHeadlinesTopic]   = useState('world news')
  const [headlines,        setHeadlines]        = useState([])
  const [headlinesLoading, setHeadlinesLoading] = useState(false)
  const [headlinesError,   setHeadlinesError]   = useState('')

  // ── AI Chat ───────────────────────────────────────────────────────────────
  const [chatInput,    setChatInput]    = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatLoading,  setChatLoading]  = useState(false)
  const [chatError,    setChatError]    = useState('')

  // ── Fetch weather ─────────────────────────────────────────────────────────
  const fetchWeather = useCallback(async (city) => {
    const c = (city ?? weatherInput).trim()
    if (!c) return
    setWeatherError('')
    setWeatherLoading(true)
    try {
      const data = await dashboardApi.getWeather(c)
      setWeather(data)
      setWeatherCity(c)
    } catch (err) {
      setWeatherError(err.message)
    } finally {
      setWeatherLoading(false)
    }
  }, [weatherInput])

  // ── Fetch travel safety ───────────────────────────────────────────────────
  const fetchSafety = useCallback(async (dest) => {
    const d = (dest ?? safetyInput).trim()
    if (!d) return
    setSafetyError('')
    setSafetyLoading(true)
    try {
      const data = await dashboardApi.getTravelSafety(d)
      setSafety(data)
      setSafetyDest(d)
    } catch (err) {
      setSafetyError(err.message)
    } finally {
      setSafetyLoading(false)
    }
  }, [safetyInput])

  // ── Fetch headlines ───────────────────────────────────────────────────────
  const fetchHeadlines = useCallback(async (topic) => {
    const t = (topic ?? headlinesTopic).trim()
    setHeadlinesError('')
    setHeadlinesLoading(true)
    try {
      const data = await dashboardApi.getHeadlines(t)
      setHeadlines(data.headlines ?? [])
      setHeadlinesTopic(t)
    } catch (err) {
      setHeadlinesError(err.message)
    } finally {
      setHeadlinesLoading(false)
    }
  }, [headlinesTopic])

  // ── Send chat message ─────────────────────────────────────────────────────
  const sendChat = useCallback(async (query) => {
    const q = (query ?? chatInput).trim()
    if (!q || chatLoading) return

    setChatError('')
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: q }])

    // Placeholder assistant message
    const placeholder = { role: 'assistant', content: '', streaming: true }
    setChatMessages(prev => [...prev, placeholder])
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

  // Auto-load weather + headlines — wait for user object (loaded async by AuthContext)
  // then use their preferences. Fires with defaults first (fast), re-fires once auth
  // fetch completes (~200ms later) with the user's real city + topic.
  useEffect(() => {
    const city  = user?.city          || DEFAULT_CITY
    const topic = user?.default_topic || 'world news'
    fetchWeather(city)
    fetchHeadlines(topic)
    // Also sync the input fields so the user sees their preference
    setWeatherInput(city)
    setHeadlinesTopic(topic)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.city, user?.default_topic])

  return {
    // weather
    weather, weatherLoading, weatherError,
    weatherInput, setWeatherInput, weatherCity,
    fetchWeather,
    // safety
    safety, safetyLoading, safetyError,
    safetyInput, setSafetyInput, safetyDest,
    fetchSafety,
    // headlines
    headlines, headlinesLoading, headlinesError,
    headlinesTopic, setHeadlinesTopic,
    fetchHeadlines,
    // chat
    chatMessages, chatInput, setChatInput,
    chatLoading, chatError, sendChat,
  }
}