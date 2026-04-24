/**
 * One track lane — the visual row showing the keyframes + interpolation
 * segments belonging to a single annotation.
 *
 * The lane paints three layers, bottom to top:
 *   1. A faint range bar spanning ``track.range.start..end`` so empty
 *      portions of the track (before the first keyframe, after the last)
 *      stay visually distinct from regions that have data.
 *   2. Every :class:`InterpolationSegment` in ``track.segments``.
 *   3. Every :class:`KeyframeMarker` in ``track.keyframes``.
 *
 * Interaction is owned by the parent; this component only translates
 * pointer events on keyframes into ``onKeyframePointerDown`` calls with
 * the frame number already decoded.
 */

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { InterpolationSegment } from './InterpolationSegment'
import { KeyframeMarker } from './KeyframeMarker'
import { frameToX } from './viewport'
import type { TimelineTrackModel, TimelineViewport } from './types'

interface Props {
  track: TimelineTrackModel
  viewport: TimelineViewport
  currentFrame: number
  selectedKeyframes: ReadonlySet<number>
  onKeyframePointerDown: (
    track: TimelineTrackModel,
    frame: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void
  onSegmentClick?: (track: TimelineTrackModel, segmentIndex: number) => void
}

export const TimelineTrack = memo(function TimelineTrack({
  track,
  viewport,
  currentFrame,
  selectedKeyframes,
  onKeyframePointerDown,
  onSegmentClick,
}: Props) {
  return (
    <div
      data-slot="timeline-track"
      data-track-id={track.id}
      data-active={track.isActive || undefined}
      className={cn(
        'relative h-10 border-b border-white/5',
        'bg-gradient-to-b from-slate-900/40 to-slate-950/40',
        track.isActive && 'bg-slate-900/70',
      )}
    >
      {track.range && (
        <div
          aria-hidden
          className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full"
          style={{
            left: `${frameToX(track.range.start, viewport)}px`,
            width: `${Math.max(
              2,
              frameToX(track.range.end, viewport) - frameToX(track.range.start, viewport),
            )}px`,
            background: `linear-gradient(90deg, ${track.color}20 0%, ${track.color}60 50%, ${track.color}20 100%)`,
          }}
        />
      )}
      {track.segments.map((segment, segmentIndex) => (
        <InterpolationSegment
          key={`${segment.startFrame}-${segment.endFrame}-${segmentIndex}`}
          segment={segment}
          segmentIndex={segmentIndex}
          viewport={viewport}
          onClick={onSegmentClick ? () => onSegmentClick(track, segmentIndex) : undefined}
        />
      ))}
      {track.keyframes.map((kf) => (
        <KeyframeMarker
          key={kf.frameNumber}
          frame={kf.frameNumber}
          color={track.color}
          viewport={viewport}
          isSelected={selectedKeyframes.has(kf.frameNumber)}
          isCurrent={track.isActive && kf.frameNumber === currentFrame}
          isLocked={track.isLocked}
          onPointerDown={(event) => {
            onKeyframePointerDown(track, kf.frameNumber, event)
          }}
        />
      ))}
    </div>
  )
})
