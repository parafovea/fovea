/**
 * Tests for claimsUiStore Zustand store.
 *
 * Validates draft claim persistence, clearing, and field preservation
 * for the workspace toggle feature.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useClaimsUiStore } from './claimsUiStore'
import type { DraftClaim } from './claimsUiStore'
import type { GlossItem, ClaimerType } from '@models/types'

/**
 * Creates a complete DraftClaim with all fields populated.
 *
 * @param overrides - partial DraftClaim fields to override defaults
 * @returns a fully populated DraftClaim
 */
function createMockDraftClaim(overrides: Partial<DraftClaim> = {}): DraftClaim {
  return {
    gloss: [{ type: 'text', content: 'Test claim text' }] satisfies GlossItem[],
    confidence: 0.85,
    claimerType: 'entity' satisfies ClaimerType,
    claimerGloss: [{ type: 'text', content: 'John Doe' }] satisfies GlossItem[],
    claimRelation: [{ type: 'text', content: 'believes' }] satisfies GlossItem[],
    claimEventId: 'event-1',
    claimTimeId: 'time-1',
    claimLocationId: 'location-1',
    audio: ['speech'],
    video: ['text', 'non-text'],
    metadata: ['non-text'],
    comment: 'Test comment for draft',
    timeSpans: [],
    videoId: 'video-123',
    personaId: 'persona-456',
    summaryId: 'summary-789',
    editingClaimId: 'claim-abc',
    parentClaimId: 'claim-parent',
    ...overrides,
  }
}

describe('claimsUiStore', () => {
  beforeEach(() => {
    useClaimsUiStore.getState().reset()
  })

  describe('initial state', () => {
    it('starts with draftClaim as null', () => {
      const state = useClaimsUiStore.getState()
      expect(state.draftClaim).toBeNull()
    })

    it('starts with selectedClaimId as null', () => {
      const state = useClaimsUiStore.getState()
      expect(state.selectedClaimId).toBeNull()
    })

    it('starts with extraction state cleared', () => {
      const state = useClaimsUiStore.getState()
      expect(state.extracting).toBe(false)
      expect(state.extractionJobId).toBeNull()
      expect(state.extractionProgress).toBeNull()
      expect(state.extractionError).toBeNull()
    })
  })

  describe('saveDraftClaim', () => {
    it('stores the draft claim in state', () => {
      const draft = createMockDraftClaim()
      useClaimsUiStore.getState().saveDraftClaim(draft)

      expect(useClaimsUiStore.getState().draftClaim).toEqual(draft)
    })

    it('preserves gloss field with all reference types', () => {
      const glossWithRefs: GlossItem[] = [
        { type: 'text', content: 'The ' },
        { type: 'typeRef', content: 'baseball', refType: 'entity', refPersonaId: 'p-1' },
        { type: 'text', content: ' was thrown by ' },
        { type: 'objectRef', content: 'player-1', refType: 'entity-object' },
      ]
      const draft = createMockDraftClaim({ gloss: glossWithRefs })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      const stored = useClaimsUiStore.getState().draftClaim
      expect(stored?.gloss).toEqual(glossWithRefs)
      expect(stored?.gloss).toHaveLength(4)
      expect(stored?.gloss[1].refType).toBe('entity')
      expect(stored?.gloss[1].refPersonaId).toBe('p-1')
    })

    it('preserves confidence value', () => {
      const draft = createMockDraftClaim({ confidence: 0.42 })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      expect(useClaimsUiStore.getState().draftClaim?.confidence).toBe(0.42)
    })

    it('preserves claimerType (including null)', () => {
      const draftWithClaimer = createMockDraftClaim({ claimerType: 'author' })
      useClaimsUiStore.getState().saveDraftClaim(draftWithClaimer)
      expect(useClaimsUiStore.getState().draftClaim?.claimerType).toBe('author')

      const draftNullClaimer = createMockDraftClaim({ claimerType: null })
      useClaimsUiStore.getState().saveDraftClaim(draftNullClaimer)
      expect(useClaimsUiStore.getState().draftClaim?.claimerType).toBeNull()
    })

    it('preserves claimer gloss and claim relation', () => {
      const claimerGloss: GlossItem[] = [{ type: 'objectRef', content: 'reporter-1', refType: 'entity-object' }]
      const claimRelation: GlossItem[] = [{ type: 'text', content: 'asserts' }]
      const draft = createMockDraftClaim({ claimerGloss, claimRelation })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      const stored = useClaimsUiStore.getState().draftClaim
      expect(stored?.claimerGloss).toEqual(claimerGloss)
      expect(stored?.claimRelation).toEqual(claimRelation)
    })

    it('preserves claim context IDs', () => {
      const draft = createMockDraftClaim({
        claimEventId: 'event-xyz',
        claimTimeId: 'time-abc',
        claimLocationId: 'location-def',
      })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      const stored = useClaimsUiStore.getState().draftClaim
      expect(stored?.claimEventId).toBe('event-xyz')
      expect(stored?.claimTimeId).toBe('time-abc')
      expect(stored?.claimLocationId).toBe('location-def')
    })

    it('preserves modality metadata arrays', () => {
      const draft = createMockDraftClaim({
        audio: ['speech', 'non-speech'],
        video: ['text'],
        metadata: ['text', 'non-text'],
      })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      const stored = useClaimsUiStore.getState().draftClaim
      expect(stored?.audio).toEqual(['speech', 'non-speech'])
      expect(stored?.video).toEqual(['text'])
      expect(stored?.metadata).toEqual(['text', 'non-text'])
    })

    it('preserves empty modality arrays', () => {
      const draft = createMockDraftClaim({
        audio: [],
        video: [],
        metadata: [],
      })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      const stored = useClaimsUiStore.getState().draftClaim
      expect(stored?.audio).toEqual([])
      expect(stored?.video).toEqual([])
      expect(stored?.metadata).toEqual([])
    })

    it('preserves comment field', () => {
      const draft = createMockDraftClaim({ comment: 'Important note about this claim' })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      expect(useClaimsUiStore.getState().draftClaim?.comment).toBe('Important note about this claim')
    })

    it('preserves empty comment', () => {
      const draft = createMockDraftClaim({ comment: '' })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      expect(useClaimsUiStore.getState().draftClaim?.comment).toBe('')
    })

    it('preserves restoration context fields', () => {
      const draft = createMockDraftClaim({
        videoId: 'vid-1',
        personaId: 'per-2',
        summaryId: 'sum-3',
        editingClaimId: 'edit-4',
        parentClaimId: 'parent-5',
      })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      const stored = useClaimsUiStore.getState().draftClaim
      expect(stored?.videoId).toBe('vid-1')
      expect(stored?.personaId).toBe('per-2')
      expect(stored?.summaryId).toBe('sum-3')
      expect(stored?.editingClaimId).toBe('edit-4')
      expect(stored?.parentClaimId).toBe('parent-5')
    })

    it('preserves draft with optional fields undefined', () => {
      const draft = createMockDraftClaim({
        editingClaimId: undefined,
        parentClaimId: undefined,
      })
      useClaimsUiStore.getState().saveDraftClaim(draft)

      const stored = useClaimsUiStore.getState().draftClaim
      expect(stored?.editingClaimId).toBeUndefined()
      expect(stored?.parentClaimId).toBeUndefined()
    })

    it('overwrites previous draft when called again', () => {
      const firstDraft = createMockDraftClaim({ comment: 'first draft' })
      const secondDraft = createMockDraftClaim({ comment: 'second draft' })

      useClaimsUiStore.getState().saveDraftClaim(firstDraft)
      expect(useClaimsUiStore.getState().draftClaim?.comment).toBe('first draft')

      useClaimsUiStore.getState().saveDraftClaim(secondDraft)
      expect(useClaimsUiStore.getState().draftClaim?.comment).toBe('second draft')
    })
  })

  describe('clearDraftClaim', () => {
    it('sets draftClaim to null', () => {
      const draft = createMockDraftClaim()
      useClaimsUiStore.getState().saveDraftClaim(draft)
      expect(useClaimsUiStore.getState().draftClaim).not.toBeNull()

      useClaimsUiStore.getState().clearDraftClaim()
      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
    })

    it('is safe to call when already null', () => {
      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
      useClaimsUiStore.getState().clearDraftClaim()
      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
    })

    it('does not affect other state fields', () => {
      useClaimsUiStore.getState().selectClaim('claim-123')
      useClaimsUiStore.getState().saveDraftClaim(createMockDraftClaim())

      useClaimsUiStore.getState().clearDraftClaim()

      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
      expect(useClaimsUiStore.getState().selectedClaimId).toBe('claim-123')
    })
  })

  describe('reset', () => {
    it('clears draftClaim along with all other state', () => {
      useClaimsUiStore.getState().saveDraftClaim(createMockDraftClaim())
      useClaimsUiStore.getState().selectClaim('claim-1')
      useClaimsUiStore.getState().startExtraction('job-1')

      useClaimsUiStore.getState().reset()

      const state = useClaimsUiStore.getState()
      expect(state.draftClaim).toBeNull()
      expect(state.selectedClaimId).toBeNull()
      expect(state.extracting).toBe(false)
      expect(state.extractionJobId).toBeNull()
    })
  })

  describe('interaction with other actions', () => {
    it('saveDraftClaim does not affect extraction state', () => {
      useClaimsUiStore.getState().startExtraction('job-1')

      useClaimsUiStore.getState().saveDraftClaim(createMockDraftClaim())

      const state = useClaimsUiStore.getState()
      expect(state.draftClaim).not.toBeNull()
      expect(state.extracting).toBe(true)
      expect(state.extractionJobId).toBe('job-1')
    })

    it('selectClaim does not affect draftClaim', () => {
      useClaimsUiStore.getState().saveDraftClaim(createMockDraftClaim())

      useClaimsUiStore.getState().selectClaim('other-claim')

      expect(useClaimsUiStore.getState().draftClaim).not.toBeNull()
      expect(useClaimsUiStore.getState().selectedClaimId).toBe('other-claim')
    })
  })

  describe('timestamp capture', () => {
    it('captures start then end and appends an ordered span to the draft', () => {
      const store = useClaimsUiStore.getState()
      store.saveDraftClaim(createMockDraftClaim({ timeSpans: [] }))
      store.startTimestampCapture()
      expect(useClaimsUiStore.getState().timestampCapture).toEqual({ phase: 'start' })

      store.captureTimestamp(3.0)
      expect(useClaimsUiStore.getState().timestampCapture).toEqual({ phase: 'end', start: 3.0 })

      // End captured before start in time: the stored span is ordered.
      store.captureTimestamp(1.0)
      const state = useClaimsUiStore.getState()
      expect(state.timestampCapture).toBeNull()
      expect(state.resumeClaimEditor).toBe(true)
      expect(state.draftClaim?.timeSpans).toEqual([{ start: 1.0, end: 3.0, source: 'scrub' }])
    })

    it('appends multiple discontiguous spans across captures', () => {
      const store = useClaimsUiStore.getState()
      store.saveDraftClaim(createMockDraftClaim({ timeSpans: [] }))

      store.startTimestampCapture()
      store.captureTimestamp(1.0)
      store.captureTimestamp(2.0)
      store.consumeResume()

      store.startTimestampCapture()
      store.captureTimestamp(10.0)
      store.captureTimestamp(12.0)

      expect(useClaimsUiStore.getState().draftClaim?.timeSpans).toEqual([
        { start: 1.0, end: 2.0, source: 'scrub' },
        { start: 10.0, end: 12.0, source: 'scrub' },
      ])
    })

    it('cancel clears capture and signals resume without adding a span', () => {
      const store = useClaimsUiStore.getState()
      store.saveDraftClaim(createMockDraftClaim({ timeSpans: [] }))
      store.startTimestampCapture()
      store.captureTimestamp(2.0)
      store.cancelTimestampCapture()

      const state = useClaimsUiStore.getState()
      expect(state.timestampCapture).toBeNull()
      expect(state.resumeClaimEditor).toBe(true)
      expect(state.draftClaim?.timeSpans).toEqual([])
    })

    it('consumeResume clears the resume flag', () => {
      useClaimsUiStore.getState().cancelTimestampCapture()
      expect(useClaimsUiStore.getState().resumeClaimEditor).toBe(true)
      useClaimsUiStore.getState().consumeResume()
      expect(useClaimsUiStore.getState().resumeClaimEditor).toBe(false)
    })
  })
})
