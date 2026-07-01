/**
 * NewsSkeleton.jsx
 *
 * LOCATION: src/components/skeletons/NewsSkeleton.jsx
 *
 * Skeleton for the News page — matches article cards.
 *
 * USAGE in NewsPage.jsx:
 *
 *   import NewsSkeleton from '../components/skeletons/NewsSkeleton'
 *
 *   if (loading) return <NewsSkeleton />
 */

import React from 'react'
import { Skeleton, SkeletonText, SkeletonTitle, SkeletonBadge } from '../Skeleton'

function ArticleCardSkeleton() {
  return (
    <div style={{
      border:        '0.5px solid var(--border)',
      borderRadius:  '10px',
      padding:       '14px 16px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '9px',
    }}>
      {/* Source + date row */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <SkeletonBadge width={60} height={18} />
        <SkeletonText width={70} />
      </div>
      {/* Headline */}
      <SkeletonTitle width="80%" />
      {/* Excerpt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <SkeletonText width="100%" />
        <SkeletonText width="85%" />
        <SkeletonText width="60%" />
      </div>
      {/* Read more link */}
      <SkeletonText width={80} />
    </div>
  )
}

export default function NewsSkeleton({ count = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Search bar + category filters */}
      <Skeleton width="100%" height={44} radius={8} />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBadge key={i} width={70} height={28} />
        ))}
      </div>
      {/* Article cards */}
      {Array.from({ length: count }).map((_, i) => (
        <ArticleCardSkeleton key={i} />
      ))}
    </div>
  )
}