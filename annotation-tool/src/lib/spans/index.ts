/**
 * Pure, React-agnostic library for the token span-annotation UI.
 *
 * Bundles the view-model types, the selection-to-segments gap-closer, the
 * token-to-span mapping and position classifier, span geometry (bounding boxes
 * and relation arcs), color assignment, and the layers adapters.
 *
 * @module
 */

export type {
  Rect,
  SpanRelation,
  SpanSegment,
  SpanToken,
  SpanTokenClass,
  TextSpan,
  TokenRectMap,
  TokenSelection,
  TokenizedElement,
} from './types'

export { selectionToSegments } from './selectionToSegments'
export { computeTokenSpanMap, tokenClass, tokenKey } from './tokenSpanMap'
export { arcPath, spanBBox } from './spanGeometry'
export { assignSpanColors, tokenBackground, DEFAULT_SPAN_PALETTE } from './spanColors'
export { fromAnnotation, toTokenRefSequence } from './adapters'
