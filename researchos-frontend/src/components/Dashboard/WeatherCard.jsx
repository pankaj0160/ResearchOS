import { useState } from 'react'

export function WeatherCard({ weather, loading, error, cityInput, setCityInput, onFetch }) {
  function handleKey(e) {
    if (e.key === 'Enter') onFetch()
  }

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <span className="dash-card-icon">🌤</span>
        <span className="dash-card-title">Weather</span>
        {weather && !loading && (
          <span className="dash-card-badge">{weather.city}, {weather.country}</span>
        )}
      </div>

      {/* City search */}
      <div className="dash-city-row">
        <input
          className="dash-input"
          placeholder="Enter city…"
          value={cityInput}
          onChange={e => setCityInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          className="dash-fetch-btn"
          onClick={onFetch}
          disabled={loading || !cityInput.trim()}
        >
          {loading ? <SpinnerIcon /> : <SearchIcon />}
        </button>
      </div>

      {error && <p className="dash-error">{error}</p>}

      {loading && !weather && <WeatherSkeleton />}

      {weather && (
        <>
          {/* Current conditions */}
          <div className="weather-current">
            <div className="weather-main">
              <span className="weather-emoji">{weather.emoji}</span>
              <div>
                <div className="weather-temp">{Math.round(weather.temp_c ?? 0)}°C</div>
                <div className="weather-feels">Feels {Math.round(weather.feels_like_c ?? 0)}°C</div>
              </div>
            </div>
            <div className="weather-condition">{weather.condition}</div>

            <div className="weather-details">
              <WeatherDetail icon="💨" label="Wind"     value={`${Math.round(weather.wind_kmh ?? 0)} km/h`} />
              <WeatherDetail icon="💧" label="Humidity" value={`${weather.humidity_pct ?? 0}%`} />
              <WeatherDetail icon="🌧" label="Precip"   value={`${(weather.precip_mm ?? 0).toFixed(1)} mm`} />
            </div>
          </div>

          {/* 7-day forecast */}
          {weather.forecast?.length > 0 && (
            <div className="weather-forecast">
              {weather.forecast.slice(0, 7).map((day, i) => (
                <ForecastDay key={i} day={day} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function WeatherDetail({ icon, label, value }) {
  return (
    <div className="weather-detail">
      <span>{icon}</span>
      <span className="weather-detail-label">{label}</span>
      <span className="weather-detail-value">{value}</span>
    </div>
  )
}

function ForecastDay({ day }) {
  const date  = day.date ? new Date(day.date + 'T12:00:00') : null
  const label = date
    ? date.toLocaleDateString('en-US', { weekday: 'short' })
    : '—'

  return (
    <div className="forecast-day">
      <span className="forecast-label">{label}</span>
      <span className="forecast-emoji">{day.emoji}</span>
      <span className="forecast-max">{day.max_c != null ? `${Math.round(day.max_c)}°` : '—'}</span>
      <span className="forecast-min">{day.min_c != null ? `${Math.round(day.min_c)}°` : '—'}</span>
    </div>
  )
}

function WeatherSkeleton() {
  return (
    <div className="dash-skeleton">
      <div className="dash-skeleton-row dash-skeleton-lg" />
      <div className="dash-skeleton-row dash-skeleton-md" />
      <div className="dash-skeleton-row dash-skeleton-sm" />
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  )
}
