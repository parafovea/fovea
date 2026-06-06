/**
 * DOM-based timeline for bounding-box sequence visualization and
 * navigation.
 *
 * The implementation lives in ``./timeline/TimelineRoot``; this file
 * keeps the public prop surface stable for every existing consumer.
 */

import { useCallback } from 'react'
import type { Annotation, InterpolationType } from '@models/types'
import { useMoveKeyframe } from '@store/queries'
import type { BezierControlPointSet } from './InterpolationModeSelector'
import { TimelineRoot } from './timeline/TimelineRoot'

type MoveKeyframe = (params: {
  videoId: string
  annotationId: string
  oldFrame: number
  newFrame: number
  fps?: number
}) => void

export interface TimelineComponentProps {
  /** Currently selected annotation (shown with keyframe details). */
  annotation: Annotation | null
  /** All annotations for this video (shown as track bars). */
  annotations: Annotation[]
  currentFrame: number
  totalFrames: number
  videoFps: number
  onSeek: (frameNumber: number) => void
  onAnnotationSelect: (annotation: Annotation) => void
  /**
   * Reserved for future media-element integration — currently unused by
   * the DOM-based timeline. Kept to avoid breaking existing callers.
   */
  videoRef?: React.RefObject<HTMLVideoElement>
  onAddKeyframe: () => void
  onDeleteKeyframe: () => void
  onCopyPreviousFrame: () => void
  onUpdateInterpolationSegment: (
    segmentIndex: number,
    type: InterpolationType,
    controlPoints?: BezierControlPointSet,
  ) => void
  onClose: () => void
}

/**
 * Thin wrapper that delegates to :class:`TimelineRoot` and wires up the
 * ``useMoveKeyframe`` store mutation so drag-to-reposition keyframes
 * persists through the same pathway as the rest of the editor.
 */
export function TimelineComponent({
  annotation,
  annotations,
  currentFrame,
  totalFrames,
  videoFps,
  onSeek,
  onAnnotationSelect,
  onAddKeyframe,
  onDeleteKeyframe,
  onCopyPreviousFrame,
  onUpdateInterpolationSegment,
  onClose,
}: TimelineComponentProps) {
  const moveKeyframe: MoveKeyframe = useMoveKeyframe()

  const handleMoveKeyframe = useCallback(
    (fromFrame: number, toFrame: number) => {
      if (!annotation) return
      moveKeyframe({
        videoId: annotation.videoId,
        annotationId: annotation.id,
        oldFrame: fromFrame,
        newFrame: toFrame,
        fps: videoFps,
      })
    },
    [annotation, moveKeyframe, videoFps],
  )

  return (
    <TimelineRoot
      annotation={annotation}
      annotations={annotations}
      currentFrame={currentFrame}
      totalFrames={totalFrames}
      videoFps={videoFps}
      onSeek={onSeek}
      onAnnotationSelect={onAnnotationSelect}
      onAddKeyframe={onAddKeyframe}
      onDeleteKeyframe={onDeleteKeyframe}
      onCopyPreviousFrame={onCopyPreviousFrame}
      onMoveKeyframe={handleMoveKeyframe}
      onUpdateInterpolationSegment={onUpdateInterpolationSegment}
      onClose={onClose}
    />
  )
}

export default TimelineComponent
