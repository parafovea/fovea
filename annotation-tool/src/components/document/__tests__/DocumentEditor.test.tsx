/**
 * Tests that the document editor derives its read-only default from the
 * annotator controller's ability-gated `canEdit`, and that an explicit
 * `readOnly` prop overrides that default.
 *
 * The controller hook is mocked so the test exercises only the edit-vs-view
 * wiring: `canEdit: false` renders the surface read-only (no relation builder,
 * no delete affordances), `canEdit: true` renders it editable, and an explicit
 * `readOnly` prop forces read-only even when the ability would allow editing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import type { TokenizedElement } from '@/lib/spans'

import { useLayersSpanAnnotator, type LayersSpanAnnotatorController } from '../hooks/useLayersSpanAnnotator'
import { DocumentEditor } from '../DocumentEditor'

vi.mock('../hooks/useLayersSpanAnnotator', () => ({
  useLayersSpanAnnotator: vi.fn(),
}))

const element: TokenizedElement = {
  name: 'tok',
  tokens: [{ index: 0, text: 'Ada', start: 0, end: 3, whitespaceAfter: false }],
}

function makeController(canEdit: boolean): LayersSpanAnnotatorController {
  return {
    status: 'ready',
    element,
    text: 'Ada',
    spans: [
      { id: 's1', segments: [{ elementName: 'tok', tokenIndexes: [0] }], label: 'PER', spanType: 'type' },
    ],
    relations: [],
    relationTypes: [],
    quickLabels: [],
    canEdit,
    onCreateSpan: vi.fn(),
    onDeleteSpan: vi.fn(),
    onCreateRelation: vi.fn(),
    onDeleteRelation: vi.fn(),
  }
}

describe('DocumentEditor', () => {
  beforeEach(() => {
    vi.mocked(useLayersSpanAnnotator).mockReset()
  })

  it('renders read-only when the ability denies editing', () => {
    vi.mocked(useLayersSpanAnnotator).mockReturnValue(makeController(false))
    render(<DocumentEditor expressionUri="doc-1" personaId="p-1" />)

    expect(screen.queryByTestId('start-relation-button')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Delete span')).not.toBeInTheDocument()
  })

  it('renders editable when the ability allows editing', () => {
    vi.mocked(useLayersSpanAnnotator).mockReturnValue(makeController(true))
    render(<DocumentEditor expressionUri="doc-1" personaId="p-1" />)

    expect(screen.getByTestId('start-relation-button')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete span')).toBeInTheDocument()
  })

  it('lets an explicit readOnly prop override an editable ability', () => {
    vi.mocked(useLayersSpanAnnotator).mockReturnValue(makeController(true))
    render(<DocumentEditor expressionUri="doc-1" personaId="p-1" readOnly />)

    expect(screen.queryByTestId('start-relation-button')).not.toBeInTheDocument()
  })
})
