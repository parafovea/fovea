/**
 * Unit tests for the layers-to-view-model adapters.
 *
 * Covers tokenization selection and conversion (including inter-token
 * whitespace inference), span construction from annotation rows (with label and
 * kind resolution, and preserved discontiguity), and relation row conversion.
 */

import { describe, it, expect } from 'vitest'

import type { LayersAnnotationRow, TextAnnotationRelationRow } from '@store/queries'

import {
  pickPrimaryTokenization,
  rowsToRelations,
  rowsToSpans,
  toTokenizedElement,
  type WireTokenization,
} from '../tokenization'

const tokenization: WireTokenization = {
  id: 'tok-1',
  kind: 'whitespace',
  isCanonical: true,
  tokens: [
    { tokenIndex: 0, text: 'Ada', textSpan: { charStart: 0, charEnd: 3, byteStart: 0, byteEnd: 3 } },
    { tokenIndex: 1, text: 'wrote', textSpan: { charStart: 4, charEnd: 9, byteStart: 4, byteEnd: 9 } },
    { tokenIndex: 2, text: 'notes', textSpan: { charStart: 10, charEnd: 15, byteStart: 10, byteEnd: 15 } },
  ],
}

describe('pickPrimaryTokenization', () => {
  it('prefers the canonical whitespace tokenization', () => {
    const bpe: WireTokenization = { id: 'tok-2', kind: 'bpe', tokens: [] }
    const picked = pickPrimaryTokenization([bpe, tokenization])
    expect(picked?.id).toBe('tok-1')
  })

  it('returns null when no tokenization parses', () => {
    expect(pickPrimaryTokenization([{ nonsense: true }, null])).toBeNull()
  })
})

describe('toTokenizedElement', () => {
  it('names the element by tokenization id and infers whitespace between tokens', () => {
    const element = toTokenizedElement(tokenization, 'Ada wrote notes')
    expect(element.name).toBe('tok-1')
    expect(element.tokens).toHaveLength(3)
    expect(element.tokens[0]).toMatchObject({ index: 0, text: 'Ada', start: 0, end: 3, whitespaceAfter: true })
    // The last token has no following token, so no trailing whitespace.
    expect(element.tokens[2].whitespaceAfter).toBe(false)
  })

  it('fills a missing surface form from the source text', () => {
    const sparse: WireTokenization = {
      id: 'tok-3',
      tokens: [{ tokenIndex: 0, textSpan: { charStart: 0, charEnd: 5, byteStart: 0, byteEnd: 5 } }],
    }
    const element = toTokenizedElement(sparse, 'hello world')
    expect(element.tokens[0].text).toBe('hello')
  })
})

describe('rowsToSpans', () => {
  const rows: LayersAnnotationRow[] = [
    {
      id: 'ann-1',
      layerId: 'layer-1',
      tokenizationId: 'tok-1',
      anchor: { tokenRefSequence: { tokenIndexes: [0, 2], tokenizationId: { value: 'tok-1' } } },
      tokenIndex: null,
      label: 'PERSON',
      value: null,
      text: null,
      parentAnnotationId: null,
      childIds: null,
      headIndex: null,
      targetIndex: null,
      arguments: null,
      confidence: null,
      ontologyTypeRefId: 'type-9',
      denotesNodeId: null,
      knowledgeRefs: null,
      temporal: null,
      spatial: null,
      features: null,
      startMs: null,
      endMs: null,
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
    },
  ]

  it('builds a discontiguous span with a resolved label and kind', () => {
    const spans = rowsToSpans(rows, 'tok-1', { typeName: (id) => (id === 'type-9' ? 'Person' : undefined) })
    expect(spans).toHaveLength(1)
    expect(spans[0].id).toBe('ann-1')
    expect(spans[0].segments).toEqual([{ elementName: 'tok-1', tokenIndexes: [0, 2] }])
    // The row's explicit label wins over the resolved type name.
    expect(spans[0].label).toBe('PERSON')
    expect(spans[0].spanType).toBe('type')
  })

  it('falls back to the resolved type name when the row has no label', () => {
    const unlabeled = [{ ...rows[0], label: null }]
    const spans = rowsToSpans(unlabeled, 'tok-1', { typeName: () => 'Person' })
    expect(spans[0].label).toBe('Person')
  })
})

describe('rowsToRelations', () => {
  const baseRow: TextAnnotationRelationRow = {
    id: 'rel-1',
    layerId: 'layer-2',
    sourceAnnotationId: 'ann-1',
    targetAnnotationId: 'ann-2',
    relationTypeRef: { id: 'rt-5' },
    label: 'wrote',
    features: null,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  }

  it('maps rows to directed span relations with their type ref', () => {
    expect(rowsToRelations([baseRow])).toEqual([
      { id: 'rel-1', sourceSpanId: 'ann-1', targetSpanId: 'ann-2', relationTypeId: 'rt-5', directed: true },
    ])
  })

  it('derives an undirected relation from a symmetric relation type', () => {
    const symmetricByTypeId = new Map([['rt-5', true]])
    expect(rowsToRelations([baseRow], symmetricByTypeId)[0].directed).toBe(false)
  })

  it('keeps an asymmetric relation type directed', () => {
    const symmetricByTypeId = new Map([['rt-5', false]])
    expect(rowsToRelations([baseRow], symmetricByTypeId)[0].directed).toBe(true)
  })

  it('defaults to directed when the type cannot be resolved', () => {
    const symmetricByTypeId = new Map([['other-type', true]])
    expect(rowsToRelations([baseRow], symmetricByTypeId)[0].directed).toBe(true)
  })
})
