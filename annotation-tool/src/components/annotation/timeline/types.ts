/**
 * Shared types for the modern annotation timeline.
 *
 * Keeps the component primitives decoupled from the larger app: each
 * primitive takes only what it needs and the :class:`TimelineRoot` is the
 * single place that knows about the external ``Annotation`` domain model.
 */

import type { Annotation, InterpolationType } from '@models/types'
import type { BezierControlPointSet } from '../InterpolationModeSelector'

/**
 * A single keyframe projected onto the timeline's coordinate space.
 *
 * Kept deliberately narrow — keyframe primitives don't need the full
 * ``BoundingBox`` payload, just enough to render and dispatch events.
 */
export interface TimelineKeyframe {
  frameNumber: number
  /** ``true`` when this is the currently selected / scrub-target keyframe. */
  isSelected?: boolean
}

/**
 * One visual lane in the track stack. Ordering controls vertical placement.
 */
export interface TimelineTrackModel {
  id: string
  label: string
  /** Hex or HSL color used for the track's accent and keyframe fill. */
  color: string
  /** Keyframes belonging to this track. */
  keyframes: TimelineKeyframe[]
  /** Interpolation segments between adjacent keyframes. */
  segments: readonly TimelineInterpolationSegment[]
  /** Frame range covered by this track's keyframes. */
  range: { start: number; end: number } | null
  /** When true, this track owns the focus state of the timeline. */
  isActive: boolean
  /** Lock prevents keyframe drag / delete / interpolation edits. */
  isLocked: boolean
  /** Solo temporarily hides every other track from rendering. */
  isSolo: boolean
  /**
   * Backreference for event handlers that need the full ``Annotation``.
   * Opaque to the primitives — the root component dereferences this when
   * dispatching ``onAnnotationSelect``.
   */
  annotation: Annotation
}

export interface TimelineInterpolationSegment {
  startFrame: number
  endFrame: number
  type: InterpolationType
  controlPoints?: BezierControlPointSet
}

/**
 * Viewport derived from the current zoom / scroll / container width.
 *
 * ``pixelsPerFrame`` is a function of ``zoom`` and a baseline px/frame; the
 * rest is computed once per render so tick/keyframe positions are a simple
 * multiplication.
 */
export interface TimelineViewport {
  startFrame: number
  endFrame: number
  pixelsPerFrame: number
  containerWidth: number
  zoom: number
  /** Minimum zoom that still fits the entire video in the container. */
  minZoom: number
  /** Upper bound on zoom so users can't tunnel into sub-frame pixels. */
  maxZoom: number
}

/**
 * Callback bundle that the root exposes to primitives. Every handler is
 * pre-bound to whatever track / keyframe the primitive corresponds to so
 * the primitive itself stays unaware of the domain.
 */
export interface TimelineActions {
  onSeek: (frame: number) => void
  onAddKeyframe: () => void
  onDeleteKeyframe: () => void
  onCopyPreviousFrame: () => void
  onMoveKeyframe: (fromFrame: number, toFrame: number) => void
  onSelectTrack: (trackId: string) => void
  onToggleLock: (trackId: string) => void
  onToggleSolo: (trackId: string) => void
  onUpdateInterpolationSegment: (
    segmentIndex: number,
    type: InterpolationType,
    controlPoints?: BezierControlPointSet,
  ) => void
  onClose: () => void
}
