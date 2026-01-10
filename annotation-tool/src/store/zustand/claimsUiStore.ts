/**
 * Zustand store for claims UI state.
 *
 * Manages client-side UI state for claims:
 * - selectedClaimId: Currently selected claim in the viewer
 * - extracting: Whether a claim extraction job is in progress
 * - extractionJobId: Current extraction job ID (for polling)
 * - extractionProgress: Progress percentage (0-100)
 * - extractionError: Error message from extraction
 *
 * Server data (claims, relations) is managed by TanStack Query in useClaims.ts
 */

import { create } from 'zustand'

export interface ClaimsUiState {
  // Selection state
  selectedClaimId: string | null

  // Extraction UI state
  extracting: boolean
  extractionJobId: string | null
  extractionProgress: number | null
  extractionError: string | null

  // Actions
  selectClaim: (claimId: string | null) => void
  startExtraction: (jobId: string) => void
  updateExtractionProgress: (progress: number | null) => void
  setExtractionError: (error: string | null) => void
  clearExtractionState: () => void
  reset: () => void
}

const initialState = {
  selectedClaimId: null,
  extracting: false,
  extractionJobId: null,
  extractionProgress: null,
  extractionError: null,
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

  reset: () => set(initialState),
}))
