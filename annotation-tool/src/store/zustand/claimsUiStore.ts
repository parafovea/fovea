/**
 * Zustand store for claims UI state.
 *
 * Manages client-side UI state for claims:
 * - selectedClaimId: Currently selected claim in the viewer
 * - extracting: Whether a claim extraction job is in progress
 * - extractionJobId: Current extraction job ID (for polling)
 * - extractionProgress: Progress percentage (0-100)
 * - extractionError: Error message from extraction
 * - draftClaim: Temporary claim state for workspace toggle feature
 *
 * Server data (claims, relations) is managed by TanStack Query in useClaims.ts
 */

import { create } from 'zustand'
import { GlossItem, ClaimerType } from '@models/types'

export interface DraftClaim {
  // Core content
  gloss: GlossItem[]
  confidence: number
  // Claimer fields
  claimerType: ClaimerType | null
  claimerGloss: GlossItem[]
  claimRelation: GlossItem[]
  // Context fields
  claimEventId: string
  claimTimeId: string
  claimLocationId: string
  // Reference data for restoration
  summaryId: string
  personaId?: string
  videoId?: string
  parentClaimId?: string
  editingClaimId?: string // If editing existing claim
  // Navigation
  returnPath: string
}

export interface ClaimsUiState {
  // Selection state
  selectedClaimId: string | null

  // Extraction UI state
  extracting: boolean
  extractionJobId: string | null
  extractionProgress: number | null
  extractionError: string | null

  // Draft claim state for workspace toggle feature
  draftClaim: DraftClaim | null
  hasDraftClaim: boolean

  // Actions
  selectClaim: (claimId: string | null) => void
  startExtraction: (jobId: string) => void
  updateExtractionProgress: (progress: number | null) => void
  setExtractionError: (error: string | null) => void
  clearExtractionState: () => void
  saveDraftClaim: (draft: DraftClaim) => void
  clearDraftClaim: () => void
  reset: () => void
}

const initialState = {
  selectedClaimId: null,
  extracting: false,
  extractionJobId: null,
  extractionProgress: null,
  extractionError: null,
  draftClaim: null,
  hasDraftClaim: false,
}

export const useClaimsUiStore = create<ClaimsUiState>((set) => ({
  ...initialState,

  selectClaim: (claimId) => set({ selectedClaimId: claimId }),

  startExtraction: (jobId) =>
    set({
      extracting: true,
      extractionJobId: jobId,
      extractionProgress: 0,
      extractionError: null,
    }),

  updateExtractionProgress: (progress) => set({ extractionProgress: progress }),

  setExtractionError: (error) =>
    set({
      extracting: false,
      extractionJobId: null,
      extractionProgress: null,
      extractionError: error,
    }),

  clearExtractionState: () =>
    set({
      extracting: false,
      extractionJobId: null,
      extractionProgress: null,
      extractionError: null,
    }),

  saveDraftClaim: (draft) =>
    set({
      draftClaim: draft,
      hasDraftClaim: true,
    }),

  clearDraftClaim: () =>
    set({
      draftClaim: null,
      hasDraftClaim: false,
    }),

  reset: () => set(initialState),
}))
