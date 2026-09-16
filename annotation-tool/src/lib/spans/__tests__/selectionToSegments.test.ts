import { describe, it, expect } from 'vitest'

import { selectionToSegments } from '../selectionToSegments'
import type { TokenSelection } from '../types'

describe('selectionToSegments', () => {
  it('returns an empty array for an empty selection', () => {
    expect(selectionToSegments([])).toEqual([])
    expect(selectionToSegments(new Set<TokenSelection>())).toEqual([])
  })

  it('produces a single-index segment for a single-token pick', () => {
    const segments = selectionToSegments([{ elementName: 'text', tokenIndex: 4 }])
    expect(segments).toEqual([{ elementName: 'text', tokenIndexes: [4] }])
  })

  it('keeps a contiguous run as one contiguous segment', () => {
    const selection: TokenSelection[] = [
      { elementName: 'text', tokenIndex: 2 },
      { elementName: 'text', tokenIndex: 3 },
      { elementName: 'text', tokenIndex: 4 },
    ]
    expect(selectionToSegments(selection)).toEqual([
      { elementName: 'text', tokenIndexes: [2, 3, 4] },
    ])
  })

  it('closes a discontiguous multi-run selection into one non-contiguous segment', () => {
    // Two runs with a hole at index 2 and index 5: the gap is preserved inside a
    // single segment rather than split into two.
    const selection: TokenSelection[] = [
      { elementName: 'text', tokenIndex: 6 },
      { elementName: 'text', tokenIndex: 0 },
      { elementName: 'text', tokenIndex: 1 },
      { elementName: 'text', tokenIndex: 3 },
      { elementName: 'text', tokenIndex: 4 },
    ]
    expect(selectionToSegments(selection)).toEqual([
      { elementName: 'text', tokenIndexes: [0, 1, 3, 4, 6] },
    ])
  })

  it('deduplicates repeated picks of the same token', () => {
    const selection: TokenSelection[] = [
      { elementName: 'text', tokenIndex: 1 },
      { elementName: 'text', tokenIndex: 1 },
      { elementName: 'text', tokenIndex: 0 },
    ]
    expect(selectionToSegments(selection)).toEqual([
      { elementName: 'text', tokenIndexes: [0, 1] },
    ])
  })

  it('groups picks by element into one sorted segment each', () => {
    const selection: TokenSelection[] = [
      { elementName: 'transcript', tokenIndex: 9 },
      { elementName: 'metadata', tokenIndex: 1 },
      { elementName: 'transcript', tokenIndex: 7 },
      { elementName: 'metadata', tokenIndex: 0 },
    ]
    // Segments come back sorted by element name for a stable order.
    expect(selectionToSegments(selection)).toEqual([
      { elementName: 'metadata', tokenIndexes: [0, 1] },
      { elementName: 'transcript', tokenIndexes: [7, 9] },
    ])
  })

  it('accepts a Set as well as an array', () => {
    const set = new Set<TokenSelection>([
      { elementName: 'text', tokenIndex: 5 },
      { elementName: 'text', tokenIndex: 2 },
    ])
    expect(selectionToSegments(set)).toEqual([{ elementName: 'text', tokenIndexes: [2, 5] }])
  })
})
