/**
 * Colored bar rendered between two keyframes to visualise the segment's
 * interpolation type.
 *
 * Each interpolation kind has its own color (see ``INTERPOLATION_COLORS``).
 * The rendering uses a gradient that fades out at the endpoints so the
 * segment joins smoothly into the keyframe markers instead of butting
 * against them with a hard edge.
 */

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { INTERPOLATION_COLORS, INTERPOLATION_LABELS } from './color'
import { frameToX } from './viewport'
import type { TimelineInterpolationSegment, TimelineViewport } from './types'

interface Props {
  segment: TimelineInterpolationSegment
  viewport: TimelineViewport
  onClick?: (segmentIndex: number) => void
  segmentIndex: number
}

export const InterpolationSegment = memo(function InterpolationSegment({
  segment,
  viewport,
  onClick,
  segmentIndex,
}: Props) {
  const startX = frameToX(segment.startFrame, viewport)
  const endX = frameToX(segment.endFrame, viewport)
  const width = Math.max(2, endX - startX)
  if (endX < 0 || startX > viewport.containerWidth) return null

  const color = INTERPOLATION_COLORS[segment.type] ?? INTERPOLATION_COLORS.linear
  const label = INTERPOLATION_LABELS[segment.type] ?? 'Linear'

  return (
    <button
      type="button"
      data-slot="timeline-interpolation-segment"
      data-type={segment.type}
      aria-label={`${label} interpolation from frame ${segment.startFrame} to ${segment.endFrame}`}
      title={label}
      onClick={() => onClick?.(segmentIndex)}
      className={cn(
        'absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full',
        'cursor-pointer transition-[height,opacity] duration-100',
        'hover:h-[5px] hover:opacity-100 opacity-80',
      )}
      style={{
        transform: `translate3d(${startX}px, -50%, 0)`,
        width: `${width}px`,
        background: `linear-gradient(90deg, transparent 0%, ${color} 10%, ${color} 90%, transparent 100%)`,
      }}
    />
  )
})
