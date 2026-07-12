/**
 * Maps tokens to the spans that cover them, and classifies each token's
 * rounded-chunk position within a span.
 *
 * Ported from bead's `computeTokenSpanMap`, adapted so that discontiguity is
 * handled correctly: every index of every segment is visited independently, so
 * a span with a gap maps each of its tokens without bridging the hole. The
 * `tokenClass` helper then reports, per span, whether the same span covers the
 * left and right neighbors, which lets a discontiguous span render as separate
 * rounded chunks.
 *
 * @module
 */

import type { SpanTokenClass, TextSpan } from './types'

/**
 * Builds the stable `"element:index"` key for a token.
 *
 * @param elementName - the element the token belongs to
 * @param index - the 0-based token index
 * @returns the map key
 */
export function tokenKey(elementName: string, index: number): string {
  return `${elementName}:${index}`
}

/**
 * Computes which spans cover each token.
 *
 * Each index of each segment of each span is visited independently and keyed by
 * `"element:index"`, so a span whose segment is non-contiguous maps every one
 * of its tokens (and only those) without filling the gap. A token covered by
 * several spans lists them in span iteration order.
 *
 * @param spans - the spans to index
 * @returns a map from `"element:index"` to the ids of the spans covering that
 *   token
 *
 * @example
 * ```typescript
 * const map = computeTokenSpanMap([
 *   { id: 's1', segments: [{ elementName: 'text', tokenIndexes: [0, 1, 3] }] },
 * ])
 * map.get('text:3') // => ['s1']
 * map.has('text:2') // => false (the gap is not covered)
 * ```
 */
export function computeTokenSpanMap(spans: TextSpan[]): Map<string, string[]> {
  const map = new Map<string, string[]>()

  for (const span of spans) {
    for (const segment of span.segments) {
      for (const index of segment.tokenIndexes) {
        const key = tokenKey(segment.elementName, index)
        const list = map.get(key)
        if (list) {
          list.push(span.id)
        } else {
          map.set(key, [span.id])
        }
      }
    }
  }

  return map
}

/**
 * Collects the set of indexes one span covers in a given element.
 */
function spanIndexesInElement(spanId: string, elementName: string, spans: TextSpan[]): Set<number> {
  const indexes = new Set<number>()
  const span = spans.find((s) => s.id === spanId)
  if (!span) return indexes
  for (const segment of span.segments) {
    if (segment.elementName === elementName) {
      for (const index of segment.tokenIndexes) indexes.add(index)
    }
  }
  return indexes
}

/**
 * Classifies a token's rounded-chunk position within one span.
 *
 * Reports whether the same span covers the immediate left and right neighbors
 * of the token in the element, so that contiguous runs are drawn as a single
 * rounded pill and a gap breaks the span into separate chunks:
 *
 * - `span-middle`: the span covers both neighbors
 * - `span-first`: the span covers the right neighbor only (start of a run)
 * - `span-last`: the span covers the left neighbor only (end of a run)
 * - `span-single`: the span covers neither neighbor (an isolated token)
 *
 * A token that the span does not itself cover, or an unknown span id, yields
 * `span-single` (no neighbor is shared).
 *
 * @param elementName - the element the token belongs to
 * @param index - the 0-based token index
 * @param spanId - the span to classify the token against
 * @param spans - all spans (used to resolve the span's index set)
 * @returns the token's position class within the span
 *
 * @example
 * ```typescript
 * const spans = [{ id: 's1', segments: [{ elementName: 'text', tokenIndexes: [0, 1, 3] }] }]
 * tokenClass('text', 0, 's1', spans) // => 'span-first'
 * tokenClass('text', 1, 's1', spans) // => 'span-last'
 * tokenClass('text', 3, 's1', spans) // => 'span-single' (isolated by the gap)
 * ```
 */
export function tokenClass(
  elementName: string,
  index: number,
  spanId: string,
  spans: TextSpan[],
): SpanTokenClass {
  const indexes = spanIndexesInElement(spanId, elementName, spans)
  const hasLeft = indexes.has(index - 1)
  const hasRight = indexes.has(index + 1)

  if (hasLeft && hasRight) return 'span-middle'
  if (hasLeft) return 'span-last'
  if (hasRight) return 'span-first'
  return 'span-single'
}
