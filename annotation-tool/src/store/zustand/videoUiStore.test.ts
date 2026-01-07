/**
 * Tests for videoUiStore Zustand store.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useVideoUiStore } from './videoUiStore'

describe('videoUiStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useVideoUiStore.getState().resetAllState()
  })

  describe('filter state', () => {
    it('sets search term', () => {
      const { setSearchTerm } = useVideoUiStore.getState()

      setSearchTerm('test search')

      expect(useVideoUiStore.getState().searchTerm).toBe('test search')
    })

    it('sets tag filters', () => {
      const { setTagFilters } = useVideoUiStore.getState()

      setTagFilters(['tag1', 'tag2'])

      expect(useVideoUiStore.getState().tagFilters).toEqual(['tag1', 'tag2'])
    })

    it('clears all filters', () => {
      const { setSearchTerm, setTagFilters, clearFilters } = useVideoUiStore.getState()

      setSearchTerm('search')
      setTagFilters(['tag'])
      clearFilters()

      expect(useVideoUiStore.getState().searchTerm).toBe('')
      expect(useVideoUiStore.getState().tagFilters).toEqual([])
    })
  })

  describe('last annotation tracking', () => {
    it('sets last annotation', () => {
      const { setLastAnnotation } = useVideoUiStore.getState()

      setLastAnnotation('video-123', 1234567890)

      const state = useVideoUiStore.getState()
      expect(state.lastAnnotation.videoId).toBe('video-123')
      expect(state.lastAnnotation.timestamp).toBe(1234567890)
    })

    it('clears last annotation', () => {
      const { setLastAnnotation, clearLastAnnotation } = useVideoUiStore.getState()

      setLastAnnotation('video-123', 1234567890)
      clearLastAnnotation()

      const state = useVideoUiStore.getState()
      expect(state.lastAnnotation.videoId).toBeNull()
      expect(state.lastAnnotation.timestamp).toBe(0)
    })
  })

  describe('summary job tracking', () => {
    it('sets active summary job', () => {
      const { setActiveSummaryJob } = useVideoUiStore.getState()

      setActiveSummaryJob('video-1', 'persona-1', 'job-123')

      expect(useVideoUiStore.getState().activeSummaryJobs['video-1:persona-1']).toBe('job-123')
    })

    it('clears summary job', () => {
      const { setActiveSummaryJob, clearSummaryJob } = useVideoUiStore.getState()

      setActiveSummaryJob('video-1', 'persona-1', 'job-123')
      clearSummaryJob('video-1', 'persona-1')

      expect(useVideoUiStore.getState().activeSummaryJobs['video-1:persona-1']).toBeUndefined()
    })

    it('getActiveJobId returns job ID or null', () => {
      const { setActiveSummaryJob, getActiveJobId } = useVideoUiStore.getState()

      expect(getActiveJobId('video-1', 'persona-1')).toBeNull()

      setActiveSummaryJob('video-1', 'persona-1', 'job-123')
      expect(useVideoUiStore.getState().getActiveJobId('video-1', 'persona-1')).toBe('job-123')
    })
  })

  describe('video summaries tracking', () => {
    it('adds video summary', () => {
      const { addVideoSummary } = useVideoUiStore.getState()

      addVideoSummary('video-1', 'persona-1')

      expect(useVideoUiStore.getState().videoSummaries['video-1']).toContain('persona-1')
    })

    it('does not duplicate video summary', () => {
      const { addVideoSummary } = useVideoUiStore.getState()

      addVideoSummary('video-1', 'persona-1')
      addVideoSummary('video-1', 'persona-1')

      expect(useVideoUiStore.getState().videoSummaries['video-1']).toHaveLength(1)
    })

    it('removes video summary', () => {
      const { addVideoSummary, removeVideoSummary } = useVideoUiStore.getState()

      addVideoSummary('video-1', 'persona-1')
      addVideoSummary('video-1', 'persona-2')
      removeVideoSummary('video-1', 'persona-1')

      expect(useVideoUiStore.getState().videoSummaries['video-1']).toEqual(['persona-2'])
    })

    it('hasSummary returns correct value', () => {
      const { addVideoSummary, hasSummary } = useVideoUiStore.getState()

      expect(hasSummary('video-1', 'persona-1')).toBe(false)

      addVideoSummary('video-1', 'persona-1')
      expect(useVideoUiStore.getState().hasSummary('video-1', 'persona-1')).toBe(true)
      expect(useVideoUiStore.getState().hasSummary('video-1', 'persona-2')).toBe(false)
    })
  })

  describe('resetAllState', () => {
    it('resets all state to initial values', () => {
      const store = useVideoUiStore.getState()

      // Modify various state
      store.setSearchTerm('test')
      store.setTagFilters(['tag'])
      store.setLastAnnotation('video-1', 123)
      store.setActiveSummaryJob('video-1', 'persona-1', 'job-123')
      store.addVideoSummary('video-1', 'persona-1')

      // Reset
      store.resetAllState()

      const newState = useVideoUiStore.getState()
      expect(newState.searchTerm).toBe('')
      expect(newState.tagFilters).toEqual([])
      expect(newState.lastAnnotation.videoId).toBeNull()
      expect(newState.activeSummaryJobs).toEqual({})
      expect(newState.videoSummaries).toEqual({})
    })
  })
})
