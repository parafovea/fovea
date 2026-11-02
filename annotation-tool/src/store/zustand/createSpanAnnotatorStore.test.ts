/**
 * Unit tests for the instance-scoped span annotator store.
 *
 * Covers store isolation across instances, the selection and draft actions, and
 * the relation builder's guarded finite-state machine (including rejection of
 * self-relations and out-of-phase picks).
 */

import { describe, it, expect } from 'vitest'

import { createSpanAnnotatorStore } from './createSpanAnnotatorStore'

describe('createSpanAnnotatorStore', () => {
  it('gives each instance independent state', () => {
    const a = createSpanAnnotatorStore()
    const b = createSpanAnnotatorStore()

    a.getState().setActiveSpanId('span-a')
    expect(a.getState().activeSpanId).toBe('span-a')
    expect(b.getState().activeSpanId).toBeNull()
  })

  it('replaces and clears the committed selection', () => {
    const store = createSpanAnnotatorStore()

    store.getState().setSelection({ tok: [0, 1, 3] })
    expect(store.getState().committedSelection).toEqual({ tok: [0, 1, 3] })

    store.getState().clearSelection()
    expect(store.getState().committedSelection).toEqual({})
    expect(store.getState().gestureAnchor).toBeNull()
  })

  it('closing the label draft clears the pending selection', () => {
    const store = createSpanAnnotatorStore()

    store.getState().setSelection({ tok: [2] })
    store.getState().openLabelDraft({ segments: [{ elementName: 'tok', tokenIndexes: [2] }], bbox: null })
    expect(store.getState().pendingLabelSpanDraft).not.toBeNull()

    store.getState().closeLabelDraft()
    expect(store.getState().pendingLabelSpanDraft).toBeNull()
    expect(store.getState().committedSelection).toEqual({})
  })

  it('walks the relation machine through source, target, and reset', () => {
    const store = createSpanAnnotatorStore()

    store.getState().startRelation()
    expect(store.getState().relationPhase).toBe('WAITING_SOURCE')

    store.getState().pickRelationSource('span-a')
    expect(store.getState().relationPhase).toBe('WAITING_TARGET')
    expect(store.getState().relationSourceId).toBe('span-a')

    store.getState().pickRelationTarget('span-b')
    expect(store.getState().relationPhase).toBe('WAITING_LABEL')
    expect(store.getState().relationTargetId).toBe('span-b')

    store.getState().resetRelation()
    expect(store.getState().relationPhase).toBe('IDLE')
    expect(store.getState().relationSourceId).toBeNull()
    expect(store.getState().relationTargetId).toBeNull()
  })

  it('rejects a self-relation target', () => {
    const store = createSpanAnnotatorStore()

    store.getState().startRelation()
    store.getState().pickRelationSource('span-a')
    store.getState().pickRelationTarget('span-a')

    // The self-pick is ignored: still awaiting a valid target.
    expect(store.getState().relationPhase).toBe('WAITING_TARGET')
    expect(store.getState().relationTargetId).toBeNull()
  })

  it('ignores picks made in the wrong phase', () => {
    const store = createSpanAnnotatorStore()

    // No source pick is honored before starting.
    store.getState().pickRelationSource('span-a')
    expect(store.getState().relationPhase).toBe('IDLE')
    expect(store.getState().relationSourceId).toBeNull()
  })
})
