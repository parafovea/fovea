/**
 * Tests for the layers span-annotator controller's on-demand layer creation.
 *
 * A fresh document has no span layer, so the first span must mint exactly one.
 * Rapid span creation before the created layer has been read back must reuse a
 * single stable client-minted layer id — both within one concurrent burst (a
 * single in-flight create is shared) and across sequential creates (the minted
 * id is cached), so the server idempotently upserts one layer instead of a
 * duplicate that would hide the spans.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

import type { SpanDraft } from '../SpanAnnotator'
import { useLayersSpanAnnotator } from './useLayersSpanAnnotator'

const mocks = vi.hoisted(() => ({
  upsertLayerMutateAsync: vi.fn(),
  upsertAnnotationMutate: vi.fn(),
  state: {
    detail: null as unknown,
    ontology: null as unknown,
  },
}))

vi.mock('@store/queries', () => ({
  useLayersAnnotations: () => ({ data: mocks.state.detail, isLoading: false, isError: false }),
  usePersonaOntology: () => ({ data: mocks.state.ontology }),
  useUpsertLayer: () => ({ mutateAsync: mocks.upsertLayerMutateAsync }),
  useUpsertLayersAnnotation: () => ({ mutate: mocks.upsertAnnotationMutate }),
  useDeleteLayersAnnotation: () => ({ mutate: vi.fn() }),
  useCreateLayersRelation: () => ({ mutate: vi.fn() }),
  useDeleteLayersRelation: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/lib/ability', () => ({
  useAbility: () => ({ can: () => true }),
}))

vi.mock('../tokenization', () => ({
  pickPrimaryTokenization: (toks: Array<{ id: string }>) => toks?.[0] ?? null,
  toTokenizedElement: () => ({ name: 'text', tokens: [] }),
  rowsToSpans: () => [],
  rowsToRelations: () => [],
}))

/** A minimal span-create intent over the first two tokens. */
const draft: SpanDraft = {
  segments: [{ elementName: 'text', tokenIndexes: [0, 1] }],
  mode: 'type',
  option: { id: 'type-1', label: 'Person', category: 'Entity Types', type: 'entity' },
}

beforeEach(() => {
  mocks.upsertLayerMutateAsync.mockReset()
  mocks.upsertAnnotationMutate.mockReset()
  // The server echoes the client-minted id it was sent (idempotent upsert-by-id).
  mocks.upsertLayerMutateAsync.mockImplementation(
    async ({ input }: { input: { id: string } }) => ({ id: input.id }),
  )
  // A fresh document: a primary tokenization but no span layer yet.
  mocks.state.detail = {
    id: 'expr-detail-1',
    text: 'hello world',
    tokenizations: [{ id: 'tok-1' }],
    annotationLayers: [],
  }
  mocks.state.ontology = null
})

describe('useLayersSpanAnnotator on-demand span layer', () => {
  it('mints one layer for a concurrent burst of span creates and shares its id', async () => {
    const { result } = renderHook(() => useLayersSpanAnnotator('expr-1', 'persona-1'))

    act(() => {
      result.current.onCreateSpan(draft)
      result.current.onCreateSpan(draft)
    })

    await waitFor(() => expect(mocks.upsertAnnotationMutate).toHaveBeenCalledTimes(2))

    // Only one layer is created for the burst; the second create joins the
    // in-flight promise instead of minting a second layer.
    expect(mocks.upsertLayerMutateAsync).toHaveBeenCalledTimes(1)

    const layerIds = mocks.upsertAnnotationMutate.mock.calls.map(
      (call) => (call[0] as { input: { layerId: string } }).input.layerId,
    )
    expect(layerIds[0]).toBe(layerIds[1])

    const mintedId = (mocks.upsertLayerMutateAsync.mock.calls[0][0] as { input: { id: string } })
      .input.id
    expect(layerIds[0]).toBe(mintedId)
  })

  it('reuses the same stable layer id across sequential creates before the layer is read back', async () => {
    const { result } = renderHook(() => useLayersSpanAnnotator('expr-1', 'persona-1'))

    act(() => {
      result.current.onCreateSpan(draft)
    })
    await waitFor(() => expect(mocks.upsertAnnotationMutate).toHaveBeenCalledTimes(1))

    // The detail graph still reports no span layer (not yet refetched), so the
    // next create re-enters layer creation.
    act(() => {
      result.current.onCreateSpan(draft)
    })
    await waitFor(() => expect(mocks.upsertAnnotationMutate).toHaveBeenCalledTimes(2))

    expect(mocks.upsertLayerMutateAsync).toHaveBeenCalledTimes(2)
    const createdLayerIds = mocks.upsertLayerMutateAsync.mock.calls.map(
      (call) => (call[0] as { input: { id: string } }).input.id,
    )
    // Both create calls carry the same client-minted id, so the server upserts a
    // single layer rather than a duplicate.
    expect(createdLayerIds[0]).toBe(createdLayerIds[1])
  })

  it('sends a client-minted uuid as the layer id so the create is idempotent by id', async () => {
    const { result } = renderHook(() => useLayersSpanAnnotator('expr-1', 'persona-1'))

    act(() => {
      result.current.onCreateSpan(draft)
    })
    await waitFor(() => expect(mocks.upsertLayerMutateAsync).toHaveBeenCalledTimes(1))

    const input = (mocks.upsertLayerMutateAsync.mock.calls[0][0] as { input: { id: string } }).input
    expect(input.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })
})
