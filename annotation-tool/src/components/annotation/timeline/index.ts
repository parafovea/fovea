/**
 * Public entry point for the modern annotation timeline.
 *
 * Consumers should import from this module rather than poking at
 * individual primitives — the shape of the internal decomposition is
 * considered an implementation detail.
 */

export { TimelineRoot } from './TimelineRoot'
export type { TimelineRootProps } from './TimelineRoot'
export { TIMELINE_SHORTCUTS } from './ShortcutPalette'
export { colorForId, INTERPOLATION_COLORS, INTERPOLATION_LABELS } from './color'
export { formatTimecode, formatRulerLabel } from './timecode'
export { computeViewport, frameToX, xToFrame, snapToKeyframe } from './viewport'
export type {
  TimelineKeyframe,
  TimelineTrackModel,
  TimelineInterpolationSegment,
  TimelineViewport,
  TimelineActions,
} from './types'
