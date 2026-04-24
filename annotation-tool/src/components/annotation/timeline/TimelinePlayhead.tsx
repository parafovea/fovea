/**
 * Vertical playhead indicator.
 *
 * The playhead is a 1px vertical rule with a 12px diamond head clipped to
 * the ruler area. It is positioned exclusively via ``transform`` so the
 * browser can promote it to a compositor layer — scrubbing then feels
 * instantaneous even at 60 fps on modest hardware.
 *
 * Pointer events are owned by :class:`TimelineRoot`; this primitive is
 * purely visual (``pointer-events: none``) so it never intercepts scrubs
 * aimed at the ruler or tracks.
 */

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { frameToX } from './viewport'
import type { TimelineViewport } from './types'

interface Props {
  frame: number
  viewport: TimelineViewport
  /** Whether the user is actively dragging the playhead. */
  isScrubbing: boolean
  className?: string
}

export const TimelinePlayhead = memo(function TimelinePlayhead({
  frame,
  viewport,
  isScrubbing,
  className,
}: Props) {
  const x = frameToX(frame, viewport)
  // Clip to viewport so a playhead past the visible range doesn't spill.
  if (x < -24 || x > viewport.containerWidth + 24) return null

  return (
    <div
      aria-hidden
      data-slot="timeline-playhead"
      className={cn(
        'absolute top-0 bottom-0 pointer-events-none z-20',
        'will-change-transform',
        className,
      )}
      style={{ transform: `translate3d(${x}px, 0, 0)` }}
    >
      {/* Diamond head — 12px rotated square, amber at rest, brighter while scrubbing. */}
      <div
        className={cn(
          'absolute top-0.5 -translate-x-1/2 size-3 rotate-45',
          'rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.35)]',
          'transition-colors duration-75',
          isScrubbing
            ? 'bg-amber-300 shadow-[0_0_14px_rgba(253,186,116,0.55)]'
            : 'bg-amber-400/90',
        )}
      />
      {/* Vertical rule. Slightly taller opacity while scrubbing so the
          focus target is obvious at a glance. */}
      <div
        className={cn(
          'absolute left-1/2 top-3.5 bottom-0 w-px -translate-x-1/2',
          isScrubbing ? 'bg-amber-300/80' : 'bg-amber-400/60',
        )}
      />
    </div>
  )
})
