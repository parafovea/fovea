/**
 * Keyframe marker rendered as a rotated rounded square (diamond).
 *
 * States:
 *  - **idle**: filled track color, subtle ring for legibility.
 *  - **hover**: small lift via ``-translate-y-0.5`` and brighter ring.
 *  - **selected**: double ring + glow.
 *  - **current-frame**: soft amber halo to echo the playhead.
 *  - **locked**: half opacity, cursor hint, click blocked.
 *
 * The primitive itself dispatches pointer events up to a parent-provided
 * handler so drag-and-marquee logic lives in the root.
 */

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { frameToX } from './viewport'
import type { TimelineViewport } from './types'

interface Props {
  frame: number
  color: string
  viewport: TimelineViewport
  isSelected: boolean
  isCurrent: boolean
  isLocked?: boolean
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void
  label?: string
}

export const KeyframeMarker = memo(function KeyframeMarker({
  frame,
  color,
  viewport,
  isSelected,
  isCurrent,
  isLocked = false,
  onPointerDown,
  label,
}: Props) {
  const x = frameToX(frame, viewport)
  if (x < -16 || x > viewport.containerWidth + 16) return null

  return (
    <button
      type="button"
      data-slot="timeline-keyframe"
      data-selected={isSelected || undefined}
      data-current={isCurrent || undefined}
      data-locked={isLocked || undefined}
      aria-label={label ?? `Keyframe at frame ${frame}`}
      disabled={isLocked}
      onPointerDown={(event) => {
        if (isLocked) return
        onPointerDown?.(event)
      }}
      className={cn(
        'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45',
        'rounded-[3px] cursor-grab active:cursor-grabbing',
        'transition-transform duration-75 ease-out',
        'hover:-translate-y-[calc(50%+2px)] hover:z-10',
        'focus-visible:outline-none',
        isLocked && 'cursor-not-allowed opacity-50',
        isSelected && 'ring-2 ring-white ring-offset-1 ring-offset-slate-950 z-10',
        isCurrent && !isSelected && 'ring-1 ring-amber-300/80',
      )}
      style={{
        transform: `translate3d(${x}px, -50%, 0) rotate(45deg)`,
        backgroundColor: color,
        boxShadow: isCurrent
          ? '0 0 0 1px rgba(0,0,0,0.4), 0 0 10px rgba(251,191,36,0.55)'
          : '0 0 0 1px rgba(0,0,0,0.4)',
      }}
    />
  )
})
