/**
 * Logo.jsx
 * Location: src/components/Logo.jsx
 *
 * The ResearchOS mark: four nodes — one per pipeline agent
 * (Search / Reader / Writer / Critic) — feeding into a single
 * pulsing core. It's not decoration bolted onto the brand; it's
 * a literal diagram of what the product does: four specialists
 * converge into one verified answer.
 *
 * Colors are passed as props rather than hardcoded so this same
 * component can be dropped into:
 *   - CSS-variable-themed screens   → colors={{ ... 'var(--accent)' }}
 *   - inline-style-themed screens   → colors={{ ... '#E2A33B' }}
 * Both are just strings to an SVG attribute, so either works.
 */

const DEFAULT_COLORS = {
  search: '#E2A33B',
  reader: '#4C9C8E',
  writer: '#C46A3B',
  critic: '#C1495A',
}

// Flat-top hexagon vertices, viewBox 0 0 100 100, center (50,50) r 40
const HEX_POINTS = '50,10 84.6,30 84.6,70 50,90 15.4,70 15.4,30'

export default function Logo({
  size = 32,
  markOnly = false,
  showWordmark = true,
  pulse = true,
  wordmarkColor = 'currentColor',
  osTagColor,       // background of the "OS" chip — defaults to wordmarkColor
  osTagTextColor,   // text color inside the "OS" chip — defaults to inverse
  hexColor,         // outline hex stroke — defaults to a soft version of wordmarkColor
  colors = DEFAULT_COLORS,
  coreColor,        // defaults to wordmarkColor
  className = '',
  style = {},
}) {
  const core = coreColor || wordmarkColor
  const hexStroke = hexColor || 'currentColor'
  const tagBg = osTagColor || wordmarkColor
  const tagText = osTagTextColor || '#1A1204'

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...style }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0, display: 'block' }}
      >
        <polygon
          points={HEX_POINTS}
          fill="none"
          stroke={hexStroke}
          strokeOpacity={hexColor ? 1 : 0.35}
          strokeWidth="1.4"
        />
        <line x1="50" y1="50" x2="84.6" y2="30" stroke={colors.search} strokeWidth="1.6" opacity="0.55" />
        <line x1="50" y1="50" x2="84.6" y2="70" stroke={colors.reader} strokeWidth="1.6" opacity="0.55" />
        <line x1="50" y1="50" x2="15.4" y2="70" stroke={colors.writer} strokeWidth="1.6" opacity="0.55" />
        <line x1="50" y1="50" x2="15.4" y2="30" stroke={colors.critic} strokeWidth="1.6" opacity="0.55" />
        <circle cx="84.6" cy="30" r="5.5" fill={colors.search} />
        <circle cx="84.6" cy="70" r="5.5" fill={colors.reader} />
        <circle cx="15.4" cy="70" r="5.5" fill={colors.writer} />
        <circle cx="15.4" cy="30" r="5.5" fill={colors.critic} />
        {pulse && (
          <circle cx="50" cy="50" r="5" fill={core} opacity="0.5">
            <animate attributeName="r" values="5;9.5;5" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.12;0.5" dur="2.6s" repeatCount="indefinite" />
          </circle>
        )}
        <circle cx="50" cy="50" r="4.5" fill={core} />
      </svg>

      {!markOnly && showWordmark && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 6,
            fontWeight: 700,
            fontSize: size * 0.56,
            letterSpacing: '-0.01em',
            color: wordmarkColor,
            lineHeight: 1,
          }}
        >
          Research
          <span
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: size * 0.32,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: tagText,
              background: tagBg,
              padding: '2px 5px',
              borderRadius: 3,
              transform: 'translateY(-1px)',
            }}
          >
            OS
          </span>
        </span>
      )}
    </span>
  )
}