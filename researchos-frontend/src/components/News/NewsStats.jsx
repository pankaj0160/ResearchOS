/**
 * NewsStats — compact stats bar shown above article list.
 */
export function NewsStats({ articles, days, category }) {
  if (!articles.length) return null

  // Unique sources
  const sources = [...new Set(articles.map(a => a.source).filter(Boolean))]

  // Avg relevance
  const avgScore = articles.length
    ? Math.round(articles.reduce((s, a) => s + (a.score || 0), 0) / articles.length * 100)
    : 0

  return (
    <div className="news-stats-bar">
      <StatItem icon="📰" value={articles.length} label="articles" />
      <div className="news-stats-divider" />
      <StatItem icon="🔗" value={sources.length} label="sources" />
      <div className="news-stats-divider" />
      <StatItem icon="📅" value={`${days}d`} label="window" />
      {avgScore > 0 && (
        <>
          <div className="news-stats-divider" />
          <StatItem icon="🎯" value={`${avgScore}%`} label="avg match" />
        </>
      )}
      {sources.length > 0 && (
        <div className="news-stats-sources">
          {sources.slice(0, 5).map(s => (
            <span key={s} className="news-stats-source-tag">{s}</span>
          ))}
          {sources.length > 5 && (
            <span className="news-stats-source-tag news-stats-source-more">+{sources.length - 5}</span>
          )}
        </div>
      )}
    </div>
  )
}

function StatItem({ icon, value, label }) {
  return (
    <div className="news-stat-item">
      <span className="news-stat-icon">{icon}</span>
      <span className="news-stat-value">{value}</span>
      <span className="news-stat-label">{label}</span>
    </div>
  )
}
