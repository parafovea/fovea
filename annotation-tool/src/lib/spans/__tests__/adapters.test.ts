import { describe, it, expect } from 'vitest'

import type { Annotation } from '@fovea/layers-schema'

import { fromAnnotation, toTokenRefSequence } from '../adapters'

describe('toTokenRefSequence', () => {
  it('copies the segment indexes and wraps the tokenization id', () => {
    const sequence = toTokenRefSequence({ elementName: 'text', tokenIndexes: [0, 1, 3] }, 'tok-1')
    expect(sequence).toEqual({
      tokenIndexes: [0, 1, 3],
      tokenizationId: { value: 'tok-1' },
    })
  })

  it('copies the index array rather than aliasing it', () => {
    const segment = { elementName: 'text', tokenIndexes: [2, 5] }
    const sequence = toTokenRefSequence(segment, 'tok-1')
    segment.tokenIndexes.push(9)
    expect(sequence.tokenIndexes).toEqual([2, 5])
  })
})

describe('fromAnnotation', () => {
  it('reads the token-ref-sequence anchor into a single-segment span', () => {
    const annotation: Annotation = {
      uuid: { value: 's1' },
      label: 'PER',
      anchor: {
        tokenRefSequence: {
          tokenIndexes: [2, 3],
          tokenizationId: { value: 'tok-1' },
          anchorTokenIndex: 2,
        },
      },
    }
    expect(fromAnnotation(annotation, 'tok-1')).toEqual({
      id: 's1',
      segments: [{ elementName: 'tok-1', tokenIndexes: [2, 3] }],
      headIndex: 2,
      label: 'PER',
    })
  })

  it('yields an empty segment when the annotation has no token-ref anchor', () => {
    const annotation: Annotation = { uuid: { value: 's2' } }
    expect(fromAnnotation(annotation, 'tok-1')).toEqual({
      id: 's2',
      segments: [{ elementName: 'tok-1', tokenIndexes: [] }],
    })
  })

  it('omits the head when the sequence carries no anchor token index', () => {
    const annotation: Annotation = {
      uuid: { value: 's3' },
      anchor: {
        tokenRefSequence: { tokenIndexes: [0], tokenizationId: { value: 'tok-1' } },
      },
    }
    const span = fromAnnotation(annotation, 'tok-1')
    expect(span.headIndex).toBeUndefined()
    expect('label' in span).toBe(false)
  })
})
