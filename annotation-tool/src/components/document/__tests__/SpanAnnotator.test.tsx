/**
 * Render smoke tests for the span annotator.
 *
 * Mounts the annotator with a small mock tokenization and two spans (one
 * contiguous, one discontiguous) and asserts that tokens render, that coverage
 * is reflected in `data-span-ids` (including the discontiguous gap), and that
 * the side panels report the span and relation counts. The annotator owns its
 * store, so no provider or network is needed here; the label picker (which
 * would pull the persona ontology) stays closed.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

import type { SpanRelation, TextSpan, TokenizedElement } from '@/lib/spans'

import { SpanAnnotator } from '../SpanAnnotator'

const TEXT = 'The quick brown fox'

const element: TokenizedElement = {
  name: 'tok',
  tokens: [
    { index: 0, text: 'The', start: 0, end: 3, whitespaceAfter: true },
    { index: 1, text: 'quick', start: 4, end: 9, whitespaceAfter: true },
    { index: 2, text: 'brown', start: 10, end: 15, whitespaceAfter: true },
    { index: 3, text: 'fox', start: 16, end: 19, whitespaceAfter: false },
  ],
}

// s1 is contiguous over [0,1]; s2 is discontiguous over [0,3], leaving a gap at
// token 2 so the discontiguity is exercised by the coverage map.
const spans: TextSpan[] = [
  { id: 's1', segments: [{ elementName: 'tok', tokenIndexes: [0, 1] }], label: 'PER', spanType: 'type' },
  { id: 's2', segments: [{ elementName: 'tok', tokenIndexes: [0, 3] }], label: 'ORG', spanType: 'type' },
]

const relations: SpanRelation[] = [
  { id: 'r1', sourceSpanId: 's1', targetSpanId: 's2', relationTypeId: 'rt1', directed: true },
]

describe('SpanAnnotator', () => {
  it('renders every token of the tokenization', () => {
    render(<SpanAnnotator tokenization={element} text={TEXT} spans={spans} relations={relations} />)

    expect(screen.getByText('The')).toBeInTheDocument()
    expect(screen.getByText('quick')).toBeInTheDocument()
    expect(screen.getByText('brown')).toBeInTheDocument()
    expect(screen.getByText('fox')).toBeInTheDocument()
  })

  it('marks covered tokens with their span ids and leaves the gap uncovered', () => {
    const { container } = render(
      <SpanAnnotator tokenization={element} text={TEXT} spans={spans} relations={relations} />,
    )

    const first = container.querySelector('[data-key="tok:0"]')
    const gap = container.querySelector('[data-key="tok:2"]')
    const last = container.querySelector('[data-key="tok:3"]')

    // Token 0 is covered by both spans; token 3 only by the discontiguous s2.
    expect(first?.getAttribute('data-span-ids')).toContain('s1')
    expect(first?.getAttribute('data-span-ids')).toContain('s2')
    expect(last?.getAttribute('data-span-ids')).toBe('s2')
    // Token 2 sits in s2's gap, so it carries no coverage.
    expect(gap?.hasAttribute('data-span-ids')).toBe(false)
  })

  it('lists the spans and relations in the side panels', () => {
    render(<SpanAnnotator tokenization={element} text={TEXT} spans={spans} relations={relations} />)

    expect(screen.getByText('Spans (2)')).toBeInTheDocument()
    expect(screen.getByText('Relations (1)')).toBeInTheDocument()
    expect(screen.getByTestId('relation-arc-overlay')).toBeInTheDocument()
  })

  it('hides the side panels and relations when configured', () => {
    render(
      <SpanAnnotator
        tokenization={element}
        text={TEXT}
        spans={spans}
        relations={relations}
        config={{ showSidePanels: false, showRelations: false }}
      />,
    )

    expect(screen.queryByText('Spans (2)')).not.toBeInTheDocument()
    expect(screen.queryByTestId('relation-arc-overlay')).not.toBeInTheDocument()
  })

  describe('read-only mode', () => {
    it('hides editing affordances and keeps pointer gestures inert', () => {
      const { container } = render(
        <SpanAnnotator
          tokenization={element}
          text={TEXT}
          spans={spans}
          relations={relations}
          relationTypes={[]}
          config={{ readOnly: true }}
        />,
      )

      // No relation-builder entry point and no delete affordances.
      expect(screen.queryByTestId('start-relation-button')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Delete span')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Delete relation')).not.toBeInTheDocument()
      // The label picker stays hidden.
      expect(screen.queryByTestId('span-label-anchor')).not.toBeInTheDocument()

      // A pointer gesture over the tokens does not commit a selection or open
      // the label picker.
      const token = container.querySelector('[data-key="tok:0"]') as HTMLElement
      fireEvent.pointerDown(token)
      fireEvent.pointerUp(token)
      expect(screen.queryByTestId('span-label-anchor')).not.toBeInTheDocument()
    })
  })

  describe('relation endpoint picking', () => {
    it('picks an overlapping span as an endpoint from its side-panel row', () => {
      const { container } = render(
        <SpanAnnotator
          tokenization={element}
          text={TEXT}
          spans={spans}
          relations={[]}
          relationTypes={[]}
        />,
      )

      // Begin the relation builder.
      fireEvent.click(screen.getByTestId('start-relation-button'))
      const status = (): HTMLElement => screen.getByTestId('relation-status')
      expect(within(status()).getByText('Click the source span')).toBeInTheDocument()

      // Both s1 and s2 cover token 0, so a token click can only reach the
      // primary span. Picking the non-primary span s2 from its row sets it as
      // the source anyway.
      fireEvent.click(container.querySelector('[data-span-row="s2"]') as HTMLElement)
      expect(within(status()).getByText('Click the target span')).toBeInTheDocument()

      // Picking s1 as the target advances the builder to the type step.
      fireEvent.click(container.querySelector('[data-span-row="s1"]') as HTMLElement)
      expect(within(status()).getByText('Choose a relation type')).toBeInTheDocument()
    })
  })
})
