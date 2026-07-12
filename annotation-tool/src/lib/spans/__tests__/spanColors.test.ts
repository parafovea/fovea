import { describe, it, expect } from 'vitest'

import { assignSpanColors, tokenBackground, DEFAULT_SPAN_PALETTE } from '../spanColors'
import type { TextSpan } from '../types'

describe('assignSpanColors', () => {
  it('reuses one color across spans that share a label', () => {
    const spans: TextSpan[] = [
      { id: 'a', segments: [], label: 'PER' },
      { id: 'b', segments: [], label: 'ORG' },
      { id: 'c', segments: [], label: 'PER' },
    ]
    const colors = assignSpanColors(spans)
    expect(colors.get('a')).toBe(colors.get('c'))
    expect(colors.get('a')).not.toBe(colors.get('b'))
    expect(colors.get('a')).toBe(DEFAULT_SPAN_PALETTE[0])
    expect(colors.get('b')).toBe(DEFAULT_SPAN_PALETTE[1])
  })

  it('reads the label field of an object-shaped label for reuse', () => {
    const spans: TextSpan[] = [
      { id: 'a', segments: [], label: { label: 'PER', label_id: 'Q5' } },
      { id: 'b', segments: [], label: { label: 'PER', label_id: 'Q5' } },
    ]
    const colors = assignSpanColors(spans)
    expect(colors.get('a')).toBe(colors.get('b'))
  })

  it('gives each unlabeled span the next palette color without reuse', () => {
    const spans: TextSpan[] = [
      { id: 'a', segments: [] },
      { id: 'b', segments: [] },
    ]
    const colors = assignSpanColors(spans)
    expect(colors.get('a')).toBe(DEFAULT_SPAN_PALETTE[0])
    expect(colors.get('b')).toBe(DEFAULT_SPAN_PALETTE[1])
  })

  it('honors explicit per-label overrides', () => {
    const spans: TextSpan[] = [{ id: 'a', segments: [], label: 'PER' }]
    const colors = assignSpanColors(spans, DEFAULT_SPAN_PALETTE, { PER: '#ff0000' })
    expect(colors.get('a')).toBe('#ff0000')
  })

  it('wraps around the palette by label order', () => {
    const spans: TextSpan[] = DEFAULT_SPAN_PALETTE.map((_, i) => ({
      id: `s${i}`,
      segments: [],
      label: `L${i}`,
    }))
    spans.push({ id: 'wrap', segments: [], label: 'Lwrap' })
    const colors = assignSpanColors(spans)
    // The ninth distinct label wraps back to the first palette color.
    expect(colors.get('wrap')).toBe(DEFAULT_SPAN_PALETTE[0])
  })
})

describe('tokenBackground', () => {
  const colorMap = new Map<string, string>([
    ['a', '#BBDEFB'],
    ['b', '#C8E6C9'],
  ])

  it('returns transparent for an uncovered token', () => {
    expect(tokenBackground([], colorMap)).toBe('transparent')
  })

  it('returns a solid color for a single covering span', () => {
    expect(tokenBackground(['a'], colorMap)).toBe('#BBDEFB')
  })

  it('returns an equal-width striped gradient for overlapping spans', () => {
    expect(tokenBackground(['a', 'b'], colorMap)).toBe(
      'linear-gradient(135deg, #BBDEFB 0%, #BBDEFB 50%, #C8E6C9 50%, #C8E6C9 100%)',
    )
  })

  it('stripes three overlapping spans into equal thirds', () => {
    const three = new Map([
      ['a', '#111'],
      ['b', '#222'],
      ['c', '#333'],
    ])
    const background = tokenBackground(['a', 'b', 'c'], three)
    expect(background.startsWith('linear-gradient(135deg,')).toBe(true)
    expect(background).toContain('#111 0%')
    expect(background).toContain('#333 100%')
  })
})
