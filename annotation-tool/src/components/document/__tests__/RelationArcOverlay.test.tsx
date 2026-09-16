/**
 * Tests that the relation-arc overlay draws an arrowhead only for directed
 * relations.
 *
 * The overlay bows a path from source to target; a directed relation carries a
 * `marker-end` arrowhead, while an undirected (symmetric) relation omits it.
 * Positions are supplied directly so the arcs render without DOM measurement.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import type { Rect, SpanRelation } from '@/lib/spans'

import { RelationArcOverlay } from '../RelationArcOverlay'

const positions = new Map<string, Rect>([
  ['s1', { x: 0, y: 20, width: 30, height: 16 }],
  ['s2', { x: 80, y: 20, width: 30, height: 16 }],
])

function relation(directed: boolean): SpanRelation {
  return { id: 'r1', sourceSpanId: 's1', targetSpanId: 's2', relationTypeId: 'rt', directed }
}

describe('RelationArcOverlay', () => {
  it('draws an arrowhead for a directed relation', () => {
    const { container } = render(
      <RelationArcOverlay relations={[relation(true)]} positions={positions} />,
    )
    const path = container.querySelector('g[data-relation-id="r1"] path')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('marker-end')).toMatch(/^url\(#arrow-/)
  })

  it('omits the arrowhead for an undirected relation', () => {
    const { container } = render(
      <RelationArcOverlay relations={[relation(false)]} positions={positions} />,
    )
    const path = container.querySelector('g[data-relation-id="r1"] path')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('marker-end')).toBeNull()
  })
})
