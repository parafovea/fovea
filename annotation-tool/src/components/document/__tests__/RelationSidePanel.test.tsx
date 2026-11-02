/**
 * Tests for the relation side panel's directedness glyph and read-only gating.
 *
 * A directed relation renders an arrow connector; an undirected (symmetric)
 * relation renders a dash. Read-only mode hides the per-row delete control.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import type { SpanRelation, TextSpan } from '@/lib/spans'

import { RelationSidePanel } from '../RelationSidePanel'

const spans: TextSpan[] = [
  { id: 's1', segments: [{ elementName: 'tok', tokenIndexes: [0] }], label: 'Ada', spanType: 'type' },
  { id: 's2', segments: [{ elementName: 'tok', tokenIndexes: [1] }], label: 'notes', spanType: 'type' },
]

const directed: SpanRelation = {
  id: 'r-directed',
  sourceSpanId: 's1',
  targetSpanId: 's2',
  relationTypeId: 'wrote',
  directed: true,
}

const undirected: SpanRelation = {
  id: 'r-undirected',
  sourceSpanId: 's1',
  targetSpanId: 's2',
  relationTypeId: 'sibling',
  directed: false,
}

const resolveLabel = (relation: SpanRelation): string => relation.relationTypeId ?? 'related'

describe('RelationSidePanel', () => {
  it('renders an arrow connector for a directed relation', () => {
    const { container } = render(
      <RelationSidePanel
        relations={[directed]}
        spans={spans}
        resolveLabel={resolveLabel}
        onDeleteRelation={vi.fn()}
      />,
    )

    const row = container.querySelector('[data-relation-row="r-directed"]') as HTMLElement
    expect(within(row).getByLabelText('directed to')).toBeInTheDocument()
    expect(row.querySelector('.lucide-arrow-right')).not.toBeNull()
    expect(row.querySelector('.lucide-minus')).toBeNull()
  })

  it('renders a dash connector for an undirected relation', () => {
    const { container } = render(
      <RelationSidePanel
        relations={[undirected]}
        spans={spans}
        resolveLabel={resolveLabel}
        onDeleteRelation={vi.fn()}
      />,
    )

    const row = container.querySelector('[data-relation-row="r-undirected"]') as HTMLElement
    expect(within(row).getByLabelText('undirected, linked with')).toBeInTheDocument()
    expect(row.querySelector('.lucide-minus')).not.toBeNull()
    expect(row.querySelector('.lucide-arrow-right')).toBeNull()
  })

  it('hides the delete control when read-only', () => {
    render(
      <RelationSidePanel
        relations={[directed]}
        spans={spans}
        resolveLabel={resolveLabel}
        onDeleteRelation={vi.fn()}
        readOnly
      />,
    )

    expect(screen.queryByLabelText('Delete relation')).not.toBeInTheDocument()
  })
})
