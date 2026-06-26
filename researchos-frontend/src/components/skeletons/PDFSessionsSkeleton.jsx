/**
 * PDFSessionsSkeleton.jsx
 *
 * LOCATION: src/components/skeletons/PDFSessionsSkeleton.jsx
 *
 * Skeleton for the PDF Chat page sessions sidebar.
 * Matches the shape of a PDF session list item:
 *   - File icon circle
 *   - Filename
 *   - Meta: pages + chunks + date
 *   - Status badge
 *
 * USAGE in PDFChatPage.jsx:
 *
 *   import PDFSessionsSkeleton from '../components/skeletons/PDFSessionsSkeleton'
 *
 *   if (loadingSessions) return <PDFSessionsSkeleton />
 */

import React from 'react'
import { Skeleton, SkeletonText, SkeletonBadge } from '../Skeleton'

// ── Single session item skeleton ──────────────────────────────────────────────

function SessionItemSkeleton() {
  return (
    <div style={{
      display:      'flex',
      gap:          '10px',
      alignItems:   'flex-start',
      padding:      '10px 12px',
      borderRadius: '8px',
      border:       '0.5px solid var(--color-border-tertiary, #e0ddd5)',
      marginBottom: '6px',
    }}>
      {/* File icon circle */}
      <Skeleton width={36} height={36} circle style={{ flexShrink: 0 }} />

      {/* Text content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Filename */}
        <SkeletonText width="80%" />

        {/* Meta row: pages + chunks */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <SkeletonText width={50} />
          <SkeletonText width={60} />
        </div>

        {/* Status badge + date */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <SkeletonBadge width={52} height={18} />
          <SkeletonText width={70} />
        </div>
      </div>
    </div>
  )
}

// ── Full sessions sidebar skeleton ────────────────────────────────────────────

export default function PDFSessionsSkeleton({ count = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '12px' }}>
      {/* Sidebar header */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        marginBottom:   '12px',
      }}>
        <Skeleton width={120} height={18} radius={5} />
        <Skeleton width={80}  height={28} radius={7} />
      </div>

      {/* Upload zone skeleton */}
      <div style={{
        border:         '1.5px dashed var(--color-border-secondary, #c8c4bc)',
        borderRadius:   '10px',
        padding:        '20px',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '8px',
        marginBottom:   '14px',
      }}>
        <Skeleton width={36} height={36} circle />
        <SkeletonText width={140} />
        <SkeletonText width={100} />
      </div>

      {/* Session items */}
      {Array.from({ length: count }).map((_, i) => (
        <SessionItemSkeleton key={i} />
      ))}
    </div>
  )
}