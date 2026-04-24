/**
 * Timeline ruler with adaptive major/minor ticks and SMPTE labels.
 *
 * Renders above the track stack. The parent passes a computed
 * :class:`TimelineViewport` so this component does not own zoom state —
 * it just projects the viewport into DOM.
 */

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { formatRulerLabel } from './timecode'
import { computeTicks, frameToX, getMajorTickInterval } from './viewport'
import type { TimelineViewport } from './types'

interface Props {
  viewport: TimelineViewport
  fps: number
  className?: string
}

/**
 * ~32px tall ruler. Major ticks render full-height with a timecode label;
 * minor ticks are a third of that height and unlabelled. The backdrop is
 * a vertical gradient that blends into the track surface below.
 */
export const TimelineRuler = memo(function TimelineRuler({ viewport, fps, className }: Props) {
  const ticks = computeTicks(viewport, fps)
  const majorInterval = getMajorTickInterval(viewport.zoom, fps)

  return (
    <div
      role="presentation"
      className={cn(
        'relative h-8 w-full select-none',
        'bg-gradient-to-b from-slate-950/80 via-slate-900/60 to-transparent',
        'border-b border-white/5',
        className,
      )}
      data-slot="timeline-ruler"
    >
      {ticks.map(({ frame, isMajor }) => {
        const x = frameToX(frame, viewport)
        if (x < -32 || x > viewport.containerWidth + 32) return null
        return (
          <div
            key={frame}
            data-slot={isMajor ? 'ruler-tick-major' : 'ruler-tick-minor'}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ transform: `translateX(${x}px)` }}
          >
            <div
              className={cn(
                'absolute left-0 w-px',
                isMajor
                  ? 'top-0 bottom-0 bg-white/25'
                  : 'top-4 bottom-0 bg-white/10',
              )}
            />
            {isMajor && (
              <span
                className={cn(
                  'absolute left-1 top-0.5 font-mono text-[10px] leading-none tabular-nums',
                  'text-slate-300',
                )}
              >
                {formatRulerLabel(frame, fps, majorInterval)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
})
