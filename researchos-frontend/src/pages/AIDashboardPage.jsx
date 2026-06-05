import { useDashboard }       from '../hooks/useDashboard'
import { WeatherCard }        from '../components/Dashboard/WeatherCard'
import { TravelSafetyCard }   from '../components/Dashboard/TravelSafetyCard'
import { HeadlinesFeed }      from '../components/Dashboard/HeadlinesFeed'
import { DashboardChat }      from '../components/Dashboard/DashboardChat'

export default function AIDashboardPage() {
  const {
    weather, weatherLoading, weatherError,
    weatherInput, setWeatherInput, fetchWeather,
    safety, safetyLoading, safetyError,
    safetyInput, setSafetyInput, fetchSafety,
    headlines, headlinesLoading, headlinesError,
    headlinesTopic, setHeadlinesTopic, fetchHeadlines,
    chatMessages, chatInput, setChatInput,
    chatLoading, chatError, sendChat,
  } = useDashboard()

  return (
    <div className="dash-page">
      {/* ── Header ── */}
      <div className="dash-page-header">
        <h1 className="page-title">
          <span className="page-title-icon">🌐</span>
          AI Dashboard
        </h1>
        <p className="page-subtitle">
          Live weather, breaking headlines, and travel safety — all powered by AI.
        </p>
      </div>

      {/* ── Top row: Weather + Travel Safety + Headlines ── */}
      <div className="dash-top-grid">
        <WeatherCard
          weather={weather}
          loading={weatherLoading}
          error={weatherError}
          cityInput={weatherInput}
          setCityInput={setWeatherInput}
          onFetch={() => fetchWeather()}
        />

        <TravelSafetyCard
          safety={safety}
          loading={safetyLoading}
          error={safetyError}
          destInput={safetyInput}
          setDestInput={setSafetyInput}
          onFetch={() => fetchSafety()}
        />

        <HeadlinesFeed
          headlines={headlines}
          loading={headlinesLoading}
          error={headlinesError}
          topic={headlinesTopic}
          setTopic={setHeadlinesTopic}
          onFetch={(t) => fetchHeadlines(t)}
        />
      </div>

      {/* ── Bottom: AI Chat ── */}
      <DashboardChat
        messages={chatMessages}
        input={chatInput}
        setInput={setChatInput}
        loading={chatLoading}
        error={chatError}
        onSend={sendChat}
      />
    </div>
  )
}
