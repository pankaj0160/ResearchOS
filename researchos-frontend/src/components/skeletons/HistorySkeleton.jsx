/**
 * HistorySkeleton.jsx
 *
 * LOCATION: src/components/skeletons/HistorySkeleton.jsx
 *
 * Skeleton for the History page — matches the shape of a research run list.
 * Each skeleton card has the same structure as a real HistoryCard:
 *   - Topic title line
 *   - Meta row (date + word count + score badge)
 *   - Short excerpt lines
 *
 * USAGE in HistoryPage.jsx:
 *
 *   import HistorySkeleton from '../components/skeletons/HistorySkeleton'
 *
 *   if (loading) return <HistorySkeleton />
 */

import React from 'react'
import {
  Skeleton,
  SkeletonText,
  SkeletonTitle,
  SkeletonBadge,
} from '../Skeleton'

// ── Single skeleton card — matches one real HistoryCard ───────────────────────

function HistoryCardSkeleton() {
  return (
    <div style={{
      border:       '0.5px solid var(--color-border-tertiary, #e0ddd5)',
      borderRadius: '10px',
      padding:      '14px 16px',
      display:      'flex',
      flexDirection:'column',
      gap:          '10px',
    }}>
      {/* Topic title */}
      <SkeletonTitle width="55%" />

      {/* Meta row: date + word count + score badge */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <SkeletonText width={80} />
        <SkeletonText width={60} />
        <SkeletonBadge width={52} height={20} />
      </div>

      {/* Excerpt — 2 lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SkeletonText width="100%" />
        <SkeletonText width="75%" />
      </div>

      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
        <Skeleton width={72} height={28} radius={7} />
        <Skeleton width={72} height={28} radius={7} />
      </div>
    </div>
  )
}

// ── Full page skeleton — shows N cards ────────────────────────────────────────

export default function HistorySkeleton({ count = 5 }) {
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      gap:           '10px',
      padding:       '0',
    }}>
      {/* Page header skeleton */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        marginBottom:   '6px',
        padding:        '4px 0',
      }}>
        <Skeleton width={160} height={24} radius={6} />
        <Skeleton width={120} height={34} radius={8} />
      </div>

      {/* Search bar skeleton */}
      <Skeleton width="100%" height={40} radius={8} style={{ marginBottom: '4px' }} />

      {/* Run cards */}
      {Array.from({ length: count }).map((_, i) => (
        <HistoryCardSkeleton key={i} />
      ))}
    </div>
  )
}