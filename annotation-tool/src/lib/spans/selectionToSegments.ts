/**
 * Turns a flat token selection into span segments, closing over the gaps.
 *
 * A selection is a flat bag of per-element token picks; a span segment is the
 * full, deduplicated, sorted (possibly non-contiguous) index set for one
 * element. This is the interactive-selection step bead never wired: the user
 * clicks or drags arbitrary tokens, and the result is grouped by element into
 * one segment each, preserving discontiguity rather than splitting on gaps.
 *
 * @module
 */

import type { SpanSegment, TokenSelection } from './types'

/**
 * Groups a flat token selection into one segment per element.
 *
 * Indexes within each element are deduplicated and sorted ascending; segments
 * are returned sorted by element name for a stable order. A run of contiguous
 * picks yields a single segment with contiguous indexes; picks with holes yield
 * a single segment with a non-contiguous index set (the gap is closed into one
 * segment, not split). An empty selection yields an empty array.
 *
 * @param selection - the flat token picks, as a `Set` or array
 * @returns one `SpanSegment` per element, each carrying that element's full
 *   deduplicated, ascending index set
 *
 * @example
 * ```typescript
 * selectionToSegments([
 *   { elementName: 'text', tokenIndex: 0 },
 *   { elementName: 'text', tokenIndex: 3 },
 *   { elementName: 'text', tokenIndex: 1 },
 * ])
 * // => [{ elementName: 'text', tokenIndexes: [0, 1, 3] }]
 * ```
 */
export function selectionToSegments(selection: Iterable<TokenSelection>): SpanSegment[] {
  const byElement = new Map<string, Set<number>>()

  for (const { elementName, tokenIndex } of selection) {
    let indexes = byElement.get(elementName)
    if (!indexes) {
      indexes = new Set<number>()
      byElement.set(elementName, indexes)
    }
    indexes.add(tokenIndex)
  }

  const segments: SpanSegment[] = []
  for (const [elementName, indexes] of byElement) {
    segments.push({
      elementName,
      tokenIndexes: [...indexes].sort((a, b) => a - b),
    })
  }

  segments.sort((a, b) => a.elementName.localeCompare(b.elementName))
  return segments
}
