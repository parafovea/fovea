/**
 * Video UI Store (Zustand)
 *
 * Manages UI state for video browsing and selection.
 * This store contains ONLY UI state (search filters, job tracking, selections).
 *
 * **Architectural Decision:**
 * - UI State (ephemeral, local) → Zustand (this store)
 * - Server State (video data) → TanStack Query (useVideos.ts)
 *
 * **What belongs in this store:**
 * - Search/filter state (searchTerm, tags)
 * - Last annotation tracking for navigation
 * - Active summary job tracking (UI state, not persisted)
 * - Summary completion tracking for badge display
 *
 * **What does NOT belong here:**
 * - Video metadata from backend (use useVideos hook)
 * - Video summaries (use useSummaries hooks)
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface VideoUiState {
  // ========== Filter State ==========
  /** Search term for filtering videos */
  searchTerm: string
  /** Tag filters for video list */
  tagFilters: string[]

  // ========== Tracking State ==========
  /** Last annotation created, for "continue where you left off" feature */
  lastAnnotation: {
    videoId: string | null
    timestamp: number
  }
  /** Active summary generation jobs by "videoId:personaId" key */
  activeSummaryJobs: Record<string, string>
  /** Personas that have summaries for each video (videoId -> personaId[]) */
  videoSummaries: Record<string, string[]>

  // ========== Actions ==========
  // Filter actions
  setSearchTerm: (term: string) => void
  setTagFilters: (tags: string[]) => void
  clearFilters: () => void

  // Tracking actions
  setLastAnnotation: (videoId: string, timestamp: number) => void
  clearLastAnnotation: () => void

  // Summary job actions
  setActiveSummaryJob: (videoId: string, personaId: string, jobId: string) => void
  clearSummaryJob: (videoId: string, personaId: string) => void
  addVideoSummary: (videoId: string, personaId: string) => void
  removeVideoSummary: (videoId: string, personaId: string) => void
  hasSummary: (videoId: string, personaId: string) => boolean
  getActiveJobId: (videoId: string, personaId: string) => string | null

  // Utility actions
  resetAllState: () => void
}

/**
 * Initial state values
 */
const initialState = {
  searchTerm: '',
  tagFilters: [],
  lastAnnotation: {
    videoId: null,
    timestamp: 0,
  },
  activeSummaryJobs: {},
  videoSummaries: {},
}

/**
 * Video UI Store
 *
 * Use this store for video browsing UI state.
 *
 * @example
 * ```typescript
 * import { useVideoUiStore } from '@/store/zustand'
 *
 * function VideoBrowser() {
 *   const searchTerm = useVideoUiStore(state => state.searchTerm)
 *   const setSearchTerm = useVideoUiStore(state => state.setSearchTerm)
 *
 *   return <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
 * }
 * ```
 */
export const useVideoUiStore = create<VideoUiState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Filter actions
      setSearchTerm: (searchTerm) => set({ searchTerm }, false, 'setSearchTerm'),
      setTagFilters: (tagFilters) => set({ tagFilters }, false, 'setTagFilters'),
      clearFilters: () =>
        set({ searchTerm: '', tagFilters: [] }, false, 'clearFilters'),

      // Tracking actions
      setLastAnnotation: (videoId, timestamp) =>
        set({ lastAnnotation: { videoId, timestamp } }, false, 'setLastAnnotation'),
      clearLastAnnotation: () =>
        set({ lastAnnotation: { videoId: null, timestamp: 0 } }, false, 'clearLastAnnotation'),

      // Summary job actions
      setActiveSummaryJob: (videoId, personaId, jobId) =>
        set(
          (state) => ({
            activeSummaryJobs: {
              ...state.activeSummaryJobs,
              [`${videoId}:${personaId}`]: jobId,
            },
          }),
          false,
          'setActiveSummaryJob'
        ),

      clearSummaryJob: (videoId, personaId) =>
        set(
          (state) => {
            const { [`${videoId}:${personaId}`]: _removed, ...rest } = state.activeSummaryJobs
            void _removed // Acknowledge unused variable from destructuring
            return { activeSummaryJobs: rest }
          },
          false,
          'clearSummaryJob'
        ),

      addVideoSummary: (videoId, personaId) =>
        set(
          (state) => {
            const existing = state.videoSummaries[videoId] || []
            if (existing.includes(personaId)) {
              return state // Already exists
            }
            return {
              videoSummaries: {
                ...state.videoSummaries,
                [videoId]: [...existing, personaId],
              },
            }
          },
          false,
          'addVideoSummary'
        ),

      removeVideoSummary: (videoId, personaId) =>
        set(
          (state) => {
            const existing = state.videoSummaries[videoId] || []
            return {
              videoSummaries: {
                ...state.videoSummaries,
                [videoId]: existing.filter((id) => id !== personaId),
              },
            }
          },
          false,
          'removeVideoSummary'
        ),

      // Helper methods (not actions, just getters)
      hasSummary: (videoId, personaId) => {
        const state = get()
        return state.videoSummaries[videoId]?.includes(personaId) ?? false
      },

      getActiveJobId: (videoId, personaId) => {
        const state = get()
        return state.activeSummaryJobs[`${videoId}:${personaId}`] ?? null
      },

      // Utility actions
      resetAllState: () => set(initialState, false, 'resetAllState'),
    }),
    { name: 'VideoUiStore' }
  )
)
