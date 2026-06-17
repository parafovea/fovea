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
import type { GlossItem, ClaimerType, ClaimTimeSpan } from '@models/types'

export interface DraftClaim {
  // Form state
  gloss: GlossItem[]
  confidence: number
  claimerType: ClaimerType | null
  claimerGloss: GlossItem[]
  claimRelation: GlossItem[]
  claimEventId: string
  claimTimeId: string
  claimLocationId: string
  audio: ('speech' | 'non-speech')[]
  video: ('text' | 'non-text')[]
  metadata: ('text' | 'non-text')[]
  comment: string
  /** Video time spans the claim is grounded in (discontiguous) */
  timeSpans: ClaimTimeSpan[]
  // Context for restoration
  videoId: string
  personaId: string
  summaryId: string
  editingClaimId?: string
  parentClaimId?: string
}

/**
 * State of an in-progress scrub capture. The ClaimEditor dialog is hidden while
 * this is active so the user can scrub the video; the workspace shows a capture
 * banner that reads the playhead. Capture proceeds in two phases: first the
 * span start, then its end.
 */
export interface TimestampCapture {
  phase: 'start' | 'end'
  /** The captured start (seconds), set once the phase advances to 'end'. */
  start?: number
}

export interface ClaimsUiState {
  // Selection state
  selectedClaimId: string | null

  // Draft claim state (for workspace toggle and scrub-capture round-trips)
  draftClaim: DraftClaim | null

  // Scrub timestamp capture state
  timestampCapture: TimestampCapture | null
  /** Set when a capture (or cancel) completes so the editor should re-open. */
  resumeClaimEditor: boolean

  // Extraction UI state
  extracting: boolean
  extractionJobId: string | null
  extractionProgress: number | null
  extractionError: string | null

  // Actions
  selectClaim: (claimId: string | null) => void
  saveDraftClaim: (draft: DraftClaim) => void
  clearDraftClaim: () => void
  startTimestampCapture: () => void
  captureTimestamp: (seconds: number) => void
  cancelTimestampCapture: () => void
  consumeResume: () => void
  startExtraction: (jobId: string) => void
  updateExtractionProgress: (progress: number | null) => void
  setExtractionError: (error: string | null) => void
  clearExtractionState: () => void
  reset: () => void
}

const initialState = {
  selectedClaimId: null,
  draftClaim: null,
  timestampCapture: null,
  resumeClaimEditor: false,
  extracting: false,
  extractionJobId: null,
  extractionProgress: null,
  extractionError: null,
}

export const useClaimsUiStore = create<ClaimsUiState>((set) => ({
  ...initialState,

  selectClaim: (claimId) => set({ selectedClaimId: claimId }),

  saveDraftClaim: (draft) => set({ draftClaim: draft }),
  clearDraftClaim: () => set({ draftClaim: null }),

  startTimestampCapture: () => set({ timestampCapture: { phase: 'start' } }),

  captureTimestamp: (seconds) =>
    set((state) => {
      const capture = state.timestampCapture
      if (!capture) return {}
      if (capture.phase === 'start') {
        // Record the start and advance to capturing the end.
        return { timestampCapture: { phase: 'end', start: seconds } }
      }
      // Phase 'end': finalize the span (ordered) and append it to the draft,
      // then signal the editor to re-open.
      const start = capture.start ?? seconds
      const span: ClaimTimeSpan = {
        start: Math.min(start, seconds),
        end: Math.max(start, seconds),
        source: 'scrub',
      }
      return {
        timestampCapture: null,
        resumeClaimEditor: true,
        draftClaim: state.draftClaim
          ? { ...state.draftClaim, timeSpans: [...state.draftClaim.timeSpans, span] }
          : state.draftClaim,
      }
    }),

  cancelTimestampCapture: () => set({ timestampCapture: null, resumeClaimEditor: true }),

  consumeResume: () => set({ resumeClaimEditor: false }),

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
