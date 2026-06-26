/**
 * Skeleton.jsx
 *
 * LOCATION: src/components/Skeleton.jsx
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BASE SKELETON COMPONENT.
 *
 * One component used everywhere. Pass props to control shape and size.
 * All page-specific skeletons (HistorySkeleton, DashboardSkeleton, etc.)
 * are built by composing this component.
 *
 * USAGE EXAMPLES:
 *
 *   // A line of text
 *   <Skeleton width="60%" height={16} />
 *
 *   // A circular avatar
 *   <Skeleton width={40} height={40} circle />
 *
 *   // A card block
 *   <Skeleton width="100%" height={120} radius={10} />
 *
 *   // Multiple lines (paragraph skeleton)
 *   <SkeletonParagraph lines={3} />
 *
 *   // A row with avatar + lines (list item skeleton)
 *   <SkeletonListItem />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react'

// ── Shimmer animation injected once ───────────────────────────────────────────
// We inject the keyframe once via a <style> tag instead of requiring a CSS file.
// This keeps the component self-contained — no external dependencies.
// The animation is shared by all Skeleton instances on the page.

const SHIMMER_STYLE = `
  @keyframes researchos-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
`

let shimmerInjected = false

function injectShimmer() {
  // Only inject once per page session
  if (shimmerInjected) return
  const style   = document.createElement('style')
  style.id      = 'researchos-skeleton-shimmer'
  style.textContent = SHIMMER_STYLE
  document.head.appendChild(style)
  shimmerInjected = true
}


// ── Base Skeleton component ────────────────────────────────────────────────────

/**
 * @param {string|number} width       - CSS width value. e.g. "60%", 200, "100%"
 * @param {string|number} height      - CSS height value. e.g. 16, "2rem", 120
 * @param {number}        radius      - border-radius in px. Default 6.
 * @param {boolean}       circle      - if true, makes it a perfect circle (radius=50%)
 * @param {string}        className   - extra class names
 * @param {object}        style       - extra inline styles (merged)
 */
export function Skeleton({
  width     = '100%',
  height    = 16,
  radius    = 6,
  circle    = false,
  className = '',
  style     = {},
}) {
  // Inject shimmer animation on first render
  React.useEffect(() => { injectShimmer() }, [])

  const w = typeof width  === 'number' ? `${width}px`  : width
  const h = typeof height === 'number' ? `${height}px` : height
  const r = circle ? '50%' : `${radius}px`

  return (
    <div
      className = {`researchos-skeleton ${className}`}
      style     = {{
        width,
        height:          h,
        borderRadius:    r,
        // The shimmer gradient — a lighter band moves across the grey base
        background:      'linear-gradient(90deg, var(--sk-base, #e8e6e1) 25%, var(--sk-shine, #f0ede8) 50%, var(--sk-base, #e8e6e1) 75%)',
        backgroundSize:  '200% 100%',
        animation:       'researchos-shimmer 1.5s ease-in-out infinite',
        flexShrink:      0,    // never shrink inside flex containers
        ...style,
      }}
      // Accessibility — tell screen readers this is a loading placeholder
      role        = "status"
      aria-label  = "Loading…"
      aria-busy   = "true"
    />
  )
}


// ── Composed helpers — built from the base Skeleton ───────────────────────────
// These are convenience components for common patterns.
// They keep page-specific skeleton files clean and readable.

/**
 * SkeletonText — a single line of text-sized skeleton.
 * Slightly thinner than the default (14px height = one line of body text).
 */
export function SkeletonText({ width = '100%', className = '' }) {
  return <Skeleton width={width} height={14} radius={4} className={className} />
}

/**
 * SkeletonTitle — a heading-sized skeleton (20px height).
 */
export function SkeletonTitle({ width = '45%' }) {
  return <Skeleton width={width} height={20} radius={5} />
}

/**
 * SkeletonParagraph — multiple text lines, last line shorter (realistic).
 *
 * @param {number} lines   - how many text lines to show. Default 3.
 * @param {number} gap     - space between lines in px. Default 8.
 */
export function SkeletonParagraph({ lines = 3, gap = 8 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonText
          key   = {i}
          // Last line is shorter — looks more like real paragraph text
          width = {i === lines - 1 ? '65%' : '100%'}
        />
      ))}
    </div>
  )
}

/**
 * SkeletonButton — a button-shaped skeleton.
 */
export function SkeletonButton({ width = 100, height = 36 }) {
  return <Skeleton width={width} height={height} radius={8} />
}

/**
 * SkeletonAvatar — a circular avatar skeleton.
 * @param {number} size - diameter in px. Default 36.
 */
export function SkeletonAvatar({ size = 36 }) {
  return <Skeleton width={size} height={size} circle />
}

/**
 * SkeletonCard — a card/panel shaped skeleton.
 * @param {number} height - card height in px. Default 120.
 */
export function SkeletonCard({ height = 120, radius = 10 }) {
  return <Skeleton width="100%" height={height} radius={radius} />
}

/**
 * SkeletonBadge — a small pill/tag skeleton.
 */
export function SkeletonBadge({ width = 60, height = 22 }) {
  return <Skeleton width={width} height={height} radius={11} />
}

// Default export is the base Skeleton
export default Skeleton