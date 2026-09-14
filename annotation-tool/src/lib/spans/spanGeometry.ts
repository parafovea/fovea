/**
 * Geometry for span highlights and relation arcs.
 *
 * `spanBBox` ports bead's `computeSpanPositions`: it bounds every token of every
 * segment of a span, so a discontiguous span yields one rectangle enclosing all
 * of its chunks. `arcPath` ports the relation-arc drawing into a pure function
 * returning an SVG path `d` for a quadratic bow above the text, staggered by
 * index so stacked relations do not overlap.
 *
 * @module
 */

import { tokenKey } from './tokenSpanMap'
import type { Rect, TextSpan, TokenRectMap } from './types'

/** Vertical spacing (px) between staggered relation-arc levels. */
const ARC_LEVEL_SPACING = 14

/** Base clearance (px) added to the height-scaled bow of a relation arc. */
const ARC_BASE_HEIGHT = 20

/** Rounds to two decimal places to keep emitted SVG paths tidy and stable. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Computes the bounding rectangle of a span over all of its tokens.
 *
 * Every index of every segment is looked up in `tokenRects` and folded into a
 * min/max extent, so the returned rectangle encloses all chunks of a
 * discontiguous span (including the gap between them). Tokens absent from
 * `tokenRects` are skipped; a span with no measured tokens yields `null`.
 *
 * @param spanId - the span to bound
 * @param spans - all spans (used to resolve the span's segments)
 * @param tokenRects - measured rectangles keyed by `"element:index"`
 * @returns the enclosing rectangle, or `null` when no token was measured
 *
 * @example
 * ```typescript
 * const rects = new Map([
 *   ['text:0', { x: 0, y: 0, width: 10, height: 16 }],
 *   ['text:3', { x: 40, y: 0, width: 10, height: 16 }],
 * ])
 * spanBBox('s1', spans, rects) // => { x: 0, y: 0, width: 50, height: 16 }
 * ```
 */
export function spanBBox(spanId: string, spans: TextSpan[], tokenRects: TokenRectMap): Rect | null {
  const span = spans.find((s) => s.id === spanId)
  if (!span) return null

  let minLeft = Number.POSITIVE_INFINITY
  let minTop = Number.POSITIVE_INFINITY
  let maxRight = Number.NEGATIVE_INFINITY
  let maxBottom = Number.NEGATIVE_INFINITY

  for (const segment of span.segments) {
    for (const index of segment.tokenIndexes) {
      const rect = tokenRects.get(tokenKey(segment.elementName, index))
      if (!rect) continue
      minLeft = Math.min(minLeft, rect.x)
      minTop = Math.min(minTop, rect.y)
      maxRight = Math.max(maxRight, rect.x + rect.width)
      maxBottom = Math.max(maxBottom, rect.y + rect.height)
    }
  }

  if (minLeft === Number.POSITIVE_INFINITY) return null
  return { x: minLeft, y: minTop, width: maxRight - minLeft, height: maxBottom - minTop }
}

/**
 * Builds the SVG path for a relation arc between two span rectangles.
 *
 * The arc is a single quadratic bow rising above the text: it starts at the top
 * center of the source rectangle, curves over a control point above the higher
 * of the two rectangles, and lands at the top center of the target. The bow
 * height scales with the horizontal distance and is raised by `stagger` levels
 * so that stacked arcs clear one another.
 *
 * @param sourceRect - the source span's rectangle
 * @param targetRect - the target span's rectangle
 * @param stagger - the 0-based stacking level (raises the bow by one level each)
 * @returns the `d` attribute for an SVG `<path>`
 *
 * @example
 * ```typescript
 * arcPath(
 *   { x: 0, y: 10, width: 20, height: 16 },
 *   { x: 100, y: 10, width: 20, height: 16 },
 *   0,
 * )
 * // => 'M 10 10 Q 60 -40 110 10'
 * ```
 */
export function arcPath(sourceRect: Rect, targetRect: Rect, stagger: number): string {
  const x1 = sourceRect.x + sourceRect.width / 2
  const x2 = targetRect.x + targetRect.width / 2
  const y1 = sourceRect.y
  const y2 = targetRect.y

  const bow = Math.abs(x2 - x1) * 0.3 + ARC_BASE_HEIGHT + stagger * ARC_LEVEL_SPACING
  const midX = (x1 + x2) / 2
  const midY = Math.min(y1, y2) - bow

  return `M ${round(x1)} ${round(y1)} Q ${round(midX)} ${round(midY)} ${round(x2)} ${round(y2)}`
}
