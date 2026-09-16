import { describe, it, expect } from 'vitest'

import { computeTokenSpanMap, tokenClass, tokenKey } from '../tokenSpanMap'
import type { TextSpan } from '../types'

/** A single span covering a non-contiguous run [0, 1, 3] in one element. */
const discontiguousSpan: TextSpan = {
  id: 's1',
  segments: [{ elementName: 'text', tokenIndexes: [0, 1, 3] }],
}

describe('tokenKey', () => {
  it('joins element and index with a colon', () => {
    expect(tokenKey('text', 3)).toBe('text:3')
  })
})

describe('computeTokenSpanMap', () => {
  it('maps each covered index independently and leaves gaps uncovered', () => {
    const map = computeTokenSpanMap([discontiguousSpan])
    expect(map.get('text:0')).toEqual(['s1'])
    expect(map.get('text:1')).toEqual(['s1'])
    expect(map.get('text:3')).toEqual(['s1'])
    // The gap at index 2 is not covered.
    expect(map.has('text:2')).toBe(false)
  })

  it('lists every span covering a token in span order', () => {
    const spans: TextSpan[] = [
      { id: 's1', segments: [{ elementName: 'text', tokenIndexes: [0, 1] }] },
      { id: 's2', segments: [{ elementName: 'text', tokenIndexes: [1, 2] }] },
    ]
    const map = computeTokenSpanMap(spans)
    expect(map.get('text:1')).toEqual(['s1', 's2'])
    expect(map.get('text:0')).toEqual(['s1'])
    expect(map.get('text:2')).toEqual(['s2'])
  })

  it('keys tokens per element so identical indexes in different elements do not collide', () => {
    const spans: TextSpan[] = [
      {
        id: 's1',
        segments: [
          { elementName: 'a', tokenIndexes: [0] },
          { elementName: 'b', tokenIndexes: [0] },
        ],
      },
    ]
    const map = computeTokenSpanMap(spans)
    expect(map.get('a:0')).toEqual(['s1'])
    expect(map.get('b:0')).toEqual(['s1'])
  })
})

describe('tokenClass', () => {
  const spans = [discontiguousSpan]

  it('classifies the start of a contiguous run as span-first', () => {
    expect(tokenClass('text', 0, 's1', spans)).toBe('span-first')
  })

  it('classifies the end of a contiguous run as span-last', () => {
    expect(tokenClass('text', 1, 's1', spans)).toBe('span-last')
  })

  it('classifies a token bridged on both sides as span-middle', () => {
    const contiguous: TextSpan[] = [
      { id: 'c', segments: [{ elementName: 'text', tokenIndexes: [0, 1, 2] }] },
    ]
    expect(tokenClass('text', 1, 'c', contiguous)).toBe('span-middle')
  })

  it('classifies a token isolated by a gap as span-single', () => {
    // Index 3 sits alone past the hole at index 2, so neither neighbor is shared.
    expect(tokenClass('text', 3, 's1', spans)).toBe('span-single')
  })

  it('returns span-single for an unknown span id', () => {
    expect(tokenClass('text', 1, 'missing', spans)).toBe('span-single')
  })
})
