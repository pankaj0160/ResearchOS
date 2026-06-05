import { useRef } from 'react'
import { CATEGORIES } from '../../services/newsApi'

const DAY_OPTIONS = [
  { value: 1,  label: 'Today'  },
  { value: 3,  label: '3 days' },
  { value: 7,  label: '7 days' },
  { value: 14, label: '2 weeks' },
  { value: 30, label: '30 days' },
]

export function NewsSearchBar({ topic, setTopic, category, setCategory, days, setDays, onSearch, loading }) {
  const inputRef = useRef(null)

  function handleKey(e) {
    if (e.key === 'Enter' && topic.trim() && !loading) {
      onSearch()
    }
  }

  return (
    <div className="news-search-bar">
      {/* Topic input */}
      <div className="news-input-row">
        <div className="news-input-wrap">
          <span className="news-input-icon"><SearchIcon /></span>
          <input
            ref={inputRef}
            className="news-input"
            type="text"
            placeholder='Search a topic — e.g. "India AI policy", "OpenAI GPT-5", "Fed rate decision"'
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
          />
          {topic && (
            <button className="news-input-clear" onClick={() => { setTopic(''); inputRef.current?.focus() }}>
              <ClearIcon />
            </button>
          )}
        </div>
        <button
          className={`news-search-btn${loading ? ' news-search-btn--loading' : ''}`}
          onClick={() => topic.trim() && !loading && onSearch()}
          disabled={!topic.trim() || loading}
        >
          {loading ? <SpinnerIcon /> : <><SearchIcon /> Summarize</>}
        </button>
      </div>

      {/* Category pills */}
      <div className="news-filters-row">
        <div className="news-category-pills">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              className={`news-cat-pill${category === cat.value ? ' news-cat-pill--active' : ''}`}
              onClick={() => setCategory(cat.value)}
              disabled={loading}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Days selector */}
        <div className="news-days-group">
          <span className="news-days-label">Range</span>
          <div className="news-days-pills">
            {DAY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`news-days-pill${days === opt.value ? ' news-days-pill--active' : ''}`}
                onClick={() => setDays(opt.value)}
                disabled={loading}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick topic suggestions */}
      <div className="news-quick-topics">
        <span className="news-quick-label">Try:</span>
        {QUICK_TOPICS.map(q => (
          <button
            key={q}
            className="news-quick-chip"
            onClick={() => { setTopic(q); onSearch(q) }}
            disabled={loading}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

const QUICK_TOPICS = [
  'AI regulation 2025',
  'Federal Reserve interest rates',
  'Climate change policy',
  'OpenAI latest news',
  'India economy',
  'Space exploration',
]

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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
