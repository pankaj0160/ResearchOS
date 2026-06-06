import { useDashboard } from '../hooks/useDashboard'
import { WeatherCard } from '../components/Dashboard/WeatherCard'
import { TravelSafetyCard } from '../components/Dashboard/TravelSafetyCard'
import { HeadlinesFeed } from '../components/Dashboard/HeadlinesFeed'
import { DashboardChat } from '../components/Dashboard/DashboardChat'

export default function AIDashboardPage() {
  const {
    weather,
    weatherLoading,
    weatherError,
    weatherInput,
    setWeatherInput,
    fetchWeather,
    safety,
    safetyLoading,
    safetyError,
    safetyInput,
    setSafetyInput,
    fetchSafety,
    headlines,
    headlinesLoading,
    headlinesError,
    headlinesTopic,
    setHeadlinesTopic,
    fetchHeadlines,
    chatMessages,
    chatInput,
    setChatInput,
    chatLoading,
    chatError,
    sendChat,
  } = useDashboard()

  const now = new Date()
  const hour = now.getHours()

  let greeting = ''
  let subtitle = ''
  let emoji = ''

  if (hour >= 5 && hour < 8) {
    greeting = 'Early Start'
    subtitle = 'The world is just waking up. A perfect time to get ahead.'
    emoji = '🌅'
  } else if (hour >= 8 && hour < 12) {
    greeting = 'Good Morning'
    subtitle = 'Fresh insights and opportunities await today.'
    emoji = '☀️'
  } else if (hour >= 12 && hour < 14) {
    greeting = 'Good Noon'
    subtitle = 'Take a moment to review what matters most.'
    emoji = '🌤️'
  } else if (hour >= 14 && hour < 17) {
    greeting = 'Good Afternoon'
    subtitle = 'Stay focused. Consistency compounds into results.'
    emoji = '🚀'
  } else if (hour >= 17 && hour < 20) {
    greeting = 'Good Evening'
    subtitle = 'Catch up on the latest updates and insights.'
    emoji = '🌇'
  } else if (hour >= 20 && hour < 23) {
    greeting = 'Night Shift'
    subtitle = 'Some of the best ideas arrive after sunset.'
    emoji = '🌙'
  } else {
    greeting = 'Late Night'
    subtitle = 'Building while the world sleeps.'
    emoji = '✨'
  }

  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const formattedTime = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="dash-page">
      {/* Header */}
      <div
        className="dash-page-header"
        style={{
          marginBottom: '0rem',
          marginTop: '-3rem',
        }}
      >
        <div
          style={{
            padding: '2rem',
            borderRadius: '24px',
            border: '1px solid var(--border)',
            background:
              'linear-gradient(135deg, rgba(99,102,241,.08), rgba(168,85,247,.05))',
            backdropFilter: 'blur(14px)',
            marginBottom: '0.90rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '2rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.8rem',
                  marginBottom: '.75rem',
                }}
              >
                <span
                  style={{
                    fontSize: '2.4rem',
                  }}
                >
                  {emoji}
                </span>

                <span
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    letterSpacing: '-0.04em',
                  }}
                >
                  {greeting},{' '}
                  <span
                    style={{
                      background:
                        'linear-gradient(135deg,var(--accent,#6366f1),var(--accent-violet,#a855f7))',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    Welcome Back
                  </span>
                </span>
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  opacity: 0.8,
                  lineHeight: 1.7,
                  maxWidth: '700px',
                }}
              >
                {subtitle}
              </p>
            </div>

            <div
              style={{
                textAlign: 'right',
              }}
            >
              <div
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 900,
                  letterSpacing: '-0.05em',
                }}
              >
                {formattedTime}
              </div>

              <div
                style={{
                  opacity: 0.7,
                  fontSize: '1rem',
                  marginTop: '.25rem',
                }}
              >
                {formattedDate}
              </div>
            </div>
          </div>
        </div>

        <h1
          className="page-title"
          style={{
            fontSize: '3rem',
            fontWeight: 900,
            letterSpacing: '-0.06em',
            marginBottom: '.75rem',
          }}
        >
          <span
            style={{
              marginRight: '.75rem',
            }}
          >
            🌐
          </span>

          <span
            style={{
              marginBottom: '-.75rem',
              background:
                'linear-gradient(135deg,var(--accent,#6366f1),var(--accent-violet,#a855f7))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            AI Dashboard
          </span>
        </h1>

        <p
          className="page-subtitle"
          style={{
            fontSize: '1.15rem',
            maxWidth: '800px',
            lineHeight: 1.7,
            opacity: 0.8,
          }}
        >
          Live weather, breaking headlines, travel intelligence, and AI-powered
          assistance in one unified workspace.
        </p>
      </div>

      {/* Top Grid */}
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

      {/* AI Chat */}
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