import { describe, it, expect, beforeEach } from 'vitest'
import { useClaimsUiStore, DraftClaim } from '@store/zustand/claimsUiStore'

describe('claimsUiStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useClaimsUiStore.getState().reset()
  })

  describe('draft claim', () => {
    const mockDraft: DraftClaim = {
      gloss: [{ type: 'text', content: 'Test claim' }],
      confidence: 0.8,
      claimerType: null,
      claimerGloss: [],
      claimRelation: [],
      claimEventId: '',
      claimTimeId: '',
      claimLocationId: '',
      summaryId: 'summary-1',
      personaId: 'persona-1',
      videoId: 'video-1',
      returnPath: '/annotate/video-1',
    }

    it('saves draft claim state', () => {
      const { saveDraftClaim } = useClaimsUiStore.getState()

      saveDraftClaim(mockDraft)

      const state = useClaimsUiStore.getState()
      expect(state.draftClaim).toEqual(mockDraft)
      expect(state.hasDraftClaim).toBe(true)
    })

    it('clears draft claim', () => {
      const { saveDraftClaim, clearDraftClaim } = useClaimsUiStore.getState()

      // First save a draft
      saveDraftClaim(mockDraft)
      expect(useClaimsUiStore.getState().hasDraftClaim).toBe(true)

      // Then clear it
      clearDraftClaim()

      const state = useClaimsUiStore.getState()
      expect(state.draftClaim).toBeNull()
      expect(state.hasDraftClaim).toBe(false)
    })

    it('preserves draft claim content correctly', () => {
      const { saveDraftClaim } = useClaimsUiStore.getState()

      const detailedDraft: DraftClaim = {
        gloss: [
          { type: 'text', content: 'The ' },
          { type: 'objectRef', content: 'entity-1', refType: 'entity-object' },
          { type: 'text', content: ' is a ' },
          { type: 'typeRef', content: 'type-1', refType: 'entity' },
        ],
        confidence: 0.95,
        claimerType: 'entity',
        claimerGloss: [{ type: 'objectRef', content: 'claimer-1', refType: 'entity-object' }],
        claimRelation: [{ type: 'text', content: 'claims' }],
        claimEventId: 'event-1',
        claimTimeId: 'time-1',
        claimLocationId: 'location-1',
        summaryId: 'summary-2',
        personaId: 'persona-2',
        videoId: 'video-2',
        parentClaimId: 'parent-1',
        editingClaimId: 'claim-1',
        returnPath: '/annotate/video-2?tab=claims',
      }

      saveDraftClaim(detailedDraft)

      const state = useClaimsUiStore.getState()
      expect(state.draftClaim).toEqual(detailedDraft)
      expect(state.draftClaim?.gloss).toHaveLength(4)
      expect(state.draftClaim?.claimerType).toBe('entity')
      expect(state.draftClaim?.editingClaimId).toBe('claim-1')
    })

    it('overwrites previous draft when saving new one', () => {
      const { saveDraftClaim } = useClaimsUiStore.getState()

      const firstDraft: DraftClaim = {
        ...mockDraft,
        gloss: [{ type: 'text', content: 'First draft' }],
      }

      const secondDraft: DraftClaim = {
        ...mockDraft,
        gloss: [{ type: 'text', content: 'Second draft' }],
      }

      saveDraftClaim(firstDraft)
      saveDraftClaim(secondDraft)

      const state = useClaimsUiStore.getState()
      expect(state.draftClaim?.gloss[0].content).toBe('Second draft')
    })

    it('resets draft claim when store is reset', () => {
      const { saveDraftClaim, reset } = useClaimsUiStore.getState()

      saveDraftClaim(mockDraft)
      expect(useClaimsUiStore.getState().hasDraftClaim).toBe(true)

      reset()

      const state = useClaimsUiStore.getState()
      expect(state.draftClaim).toBeNull()
      expect(state.hasDraftClaim).toBe(false)
    })
  })
})
