/**
 * Thin adapters between the local span view-model and the layers records.
 *
 * The UI works in the `TextSpan` / `SpanSegment` view-model; the wire format is
 * the `@fovea/layers-schema` `Annotation` with a `tokenRefSequence` anchor.
 * These functions translate one segment to a `TokenRefSequence` and one
 * `Annotation` back to a single-segment `TextSpan`. They stay deliberately thin:
 * multi-segment composition and label resolution live in the caller.
 *
 * @module
 */

import type { Annotation, TokenRefSequence } from '@fovea/layers-schema'

import type { SpanSegment, TextSpan } from './types'

/**
 * Converts one span segment to a layers `TokenRefSequence`.
 *
 * The segment's indexes are copied verbatim (order and any discontiguity are
 * preserved) and tagged with the tokenization they index into.
 *
 * @param segment - the segment to convert
 * @param tokenizationId - UUID of the tokenization the indexes reference
 * @returns the equivalent `TokenRefSequence`
 *
 * @example
 * ```typescript
 * toTokenRefSequence({ elementName: 'text', tokenIndexes: [0, 1, 3] }, 'tok-1')
 * // => { tokenIndexes: [0, 1, 3], tokenizationId: { value: 'tok-1' } }
 * ```
 */
export function toTokenRefSequence(segment: SpanSegment, tokenizationId: string): TokenRefSequence {
  return {
    tokenIndexes: [...segment.tokenIndexes],
    tokenizationId: { value: tokenizationId },
  }
}

/**
 * Builds a single-segment `TextSpan` from a layers `Annotation`.
 *
 * Reads the annotation's `anchor.tokenRefSequence` for the token indexes and the
 * optional head, and uses `tokenizationId` as the segment's element name so the
 * span is scoped to the token stream it annotates. An annotation without a
 * token-ref-sequence anchor yields a span with an empty segment.
 *
 * @param annotation - the source layers annotation
 * @param tokenizationId - the element name to scope the produced segment to
 *   (the tokenization the annotation indexes into)
 * @returns the equivalent view-model span
 *
 * @example
 * ```typescript
 * fromAnnotation(
 *   { uuid: { value: 's1' }, label: 'PER', anchor: { tokenRefSequence: { tokenIndexes: [2, 3], tokenizationId: { value: 'tok-1' } } } },
 *   'tok-1',
 * )
 * // => { id: 's1', segments: [{ elementName: 'tok-1', tokenIndexes: [2, 3] }], label: 'PER' }
 * ```
 */
export function fromAnnotation(annotation: Annotation, tokenizationId: string): TextSpan {
  const sequence = annotation.anchor?.tokenRefSequence
  const segment: SpanSegment = {
    elementName: tokenizationId,
    tokenIndexes: sequence ? [...sequence.tokenIndexes] : [],
  }

  const span: TextSpan = {
    id: annotation.uuid.value,
    segments: [segment],
  }

  if (sequence?.anchorTokenIndex !== undefined) span.headIndex = sequence.anchorTokenIndex
  if (annotation.label !== undefined) span.label = annotation.label

  return span
}
