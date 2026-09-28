import { describe, it, expect } from 'vitest'

import { arcPath, spanBBox } from '../spanGeometry'
import type { Rect, TextSpan, TokenRectMap } from '../types'

const discontiguousSpan: TextSpan = {
  id: 's1',
  segments: [{ elementName: 'text', tokenIndexes: [0, 1, 3] }],
}

describe('spanBBox', () => {
  it('bounds every token of every segment, enclosing the gap', () => {
    const rects: TokenRectMap = new Map<string, Rect>([
      ['text:0', { x: 0, y: 0, width: 10, height: 16 }],
      ['text:1', { x: 12, y: 0, width: 10, height: 16 }],
      // Index 2 is the gap and has no rect; index 3 sits past it.
      ['text:3', { x: 40, y: 0, width: 10, height: 16 }],
    ])
    expect(spanBBox('s1', [discontiguousSpan], rects)).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 16,
    })
  })

  it('folds tokens across multiple elements and rows into one extent', () => {
    const span: TextSpan = {
      id: 'm',
      segments: [
        { elementName: 'a', tokenIndexes: [0] },
        { elementName: 'b', tokenIndexes: [0] },
      ],
    }
    const rects: TokenRectMap = new Map<string, Rect>([
      ['a:0', { x: 10, y: 0, width: 20, height: 16 }],
      ['b:0', { x: 0, y: 24, width: 30, height: 16 }],
    ])
    expect(spanBBox('m', [span], rects)).toEqual({ x: 0, y: 0, width: 30, height: 40 })
  })

  it('returns null when no token of the span has a measured rect', () => {
    expect(spanBBox('s1', [discontiguousSpan], new Map())).toBeNull()
  })

  it('returns null for an unknown span id', () => {
    const rects: TokenRectMap = new Map([['text:0', { x: 0, y: 0, width: 10, height: 16 }]])
    expect(spanBBox('missing', [discontiguousSpan], rects)).toBeNull()
  })
})

describe('arcPath', () => {
  const source: Rect = { x: 0, y: 10, width: 20, height: 16 }
  const target: Rect = { x: 100, y: 10, width: 20, height: 16 }

  it('draws a quadratic bow from source center to target center', () => {
    // x1 = 10, x2 = 110, bow = |100| * 0.3 + 20 = 50, midY = 10 - 50 = -40.
    expect(arcPath(source, target, 0)).toBe('M 10 10 Q 60 -40 110 10')
  })

  it('raises the bow one level per stagger step', () => {
    // bow = 50 + 1 * 14 = 64, midY = 10 - 64 = -54.
    expect(arcPath(source, target, 1)).toBe('M 10 10 Q 60 -54 110 10')
  })

  it('bows above the higher of the two rectangles', () => {
    const lowered: Rect = { x: 100, y: 30, width: 20, height: 16 }
    // min(y1, y2) = 10, bow = 50, midY = 10 - 50 = -40.
    expect(arcPath(source, lowered, 0)).toBe('M 10 10 Q 60 -40 110 30')
  })
})
