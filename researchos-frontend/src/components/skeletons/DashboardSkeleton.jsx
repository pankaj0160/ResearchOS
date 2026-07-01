/**
 * DashboardSkeleton.jsx
 *
 * LOCATION: src/components/skeletons/DashboardSkeleton.jsx
 *
 * Skeleton for the AI Dashboard — matches the grid of cards:
 *   - Weather card (top left)
 *   - Headlines feed (top right)
 *   - Activity feed (bottom left)
 *   - Quick stats (bottom right)
 *
 * USAGE in AIDashboardPage.jsx:
 *
 *   import DashboardSkeleton from '../components/skeletons/DashboardSkeleton'
 *
 *   if (loading) return <DashboardSkeleton />
 */

import React from 'react'
import { Skeleton, SkeletonText, SkeletonTitle } from '../Skeleton'

// ── Reusable card shell ───────────────────────────────────────────────────────

function SkeletonCardShell({ children, style = {} }) {
  return (
    <div style={{
      border:        '0.5px solid var(--border)',
      borderRadius:  '12px',
      padding:       '16px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '12px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Weather card skeleton ─────────────────────────────────────────────────────

function WeatherCardSkeleton() {
  return (
    <SkeletonCardShell>
      {/* Card label */}
      <SkeletonText width={80} />
      {/* Big temperature number */}
      <Skeleton width={100} height={48} radius={8} />
      {/* City + condition */}
      <SkeletonText width="60%" />
      <SkeletonText width="45%" />
      {/* Small detail row */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <SkeletonText width={60} />
        <SkeletonText width={60} />
        <SkeletonText width={60} />
      </div>
    </SkeletonCardShell>
  )
}

// ── Headlines skeleton ────────────────────────────────────────────────────────

function HeadlinesCardSkeleton() {
  return (
    <SkeletonCardShell>
      <SkeletonText width={100} />
      {/* 4 headline items */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{
          display:      'flex',
          gap:          '10px',
          alignItems:   'flex-start',
          paddingBottom:'10px',
          borderBottom: i < 3 ? '0.5px solid var(--border)' : 'none',
        }}>
          {/* Number */}
          <Skeleton width={20} height={20} radius={4} style={{ flexShrink: 0 }} />
          {/* Headline text */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <SkeletonText width="90%" />
            <SkeletonText width="60%" />
          </div>
        </div>
      ))}
    </SkeletonCardShell>
  )
}

// ── Activity feed skeleton ────────────────────────────────────────────────────

function ActivityCardSkeleton() {
  return (
    <SkeletonCardShell>
      <SkeletonText width={120} />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{
          display:    'flex',
          gap:        '10px',
          alignItems: 'center',
        }}>
          {/* Icon circle */}
          <Skeleton width={32} height={32} circle />
          {/* Event text */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <SkeletonText width="70%" />
            <SkeletonText width="40%" />
          </div>
        </div>
      ))}
    </SkeletonCardShell>
  )
}

// ── Quick stats skeleton ──────────────────────────────────────────────────────

function StatsCardSkeleton() {
  return (
    <SkeletonCardShell>
      <SkeletonText width={100} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            background:   'var(--bg-base)',
            borderRadius: '8px',
            padding:      '10px',
            display:      'flex',
            flexDirection:'column',
            gap:          '6px',
          }}>
            <Skeleton width={40} height={28} radius={6} />
            <SkeletonText width="80%" />
          </div>
        ))}
      </div>
    </SkeletonCardShell>
  )
}

// ── Full dashboard skeleton ───────────────────────────────────────────────────

export default function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={200} height={26} radius={6} />
        <Skeleton width={100} height={20} radius={4} />
      </div>

      {/* Top row: weather + headlines */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '14px' }}>
        <WeatherCardSkeleton />
        <HeadlinesCardSkeleton />
      </div>

      {/* Bottom row: activity + stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '14px' }}>
        <ActivityCardSkeleton />
        <StatsCardSkeleton />
      </div>
    </div>
  )
}