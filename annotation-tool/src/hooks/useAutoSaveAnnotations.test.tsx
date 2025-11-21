/**
 * @file useAutoSaveAnnotations.test.ts
 * @description Comprehensive tests for annotation auto-save hook.
 * Tests cover the critical duplication bug fix and all edge cases.
 */

import React from 'react'
import { renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { useAutoSaveAnnotations } from './useAutoSaveAnnotations'
import annotationReducer from '../store/annotationSlice'
import { Annotation } from '../models/types'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { api } from '../services/api'

// Mock the API module instead of the thunk
vi.mock('../services/api', () => ({
  api: {
    saveAnnotation: vi.fn().mockResolvedValue({}),
    updateAnnotation: vi.fn().mockResolvedValue({}),
    getAnnotations: vi.fn().mockResolvedValue([])
  }
}))

describe('useAutoSaveAnnotations', () => {
  let store: ReturnType<typeof configureStore>

  const createMockAnnotation = (id: string, label: string): Annotation => ({
    id,
    videoId: 'test-video',
    personaId: 'test-persona',
    type: 'type',
    label,
    timeSpan: { startTime: 0, endTime: 1 },
    boundingBoxSequence: {
      boxes: [{
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        frameNumber: 0,
        isKeyframe: true
      }],
      interpolationSegments: [],
      visibilityRanges: []
    },
    confidence: null,
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    store = configureStore({
      reducer: {
        annotations: annotationReducer
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )

  it('should not auto-save on initial load', async () => {
    const annotations = [createMockAnnotation('ann-1', 'Test')]
    const loadTimestamp = Date.now()

    renderHook(
      () => useAutoSaveAnnotations({
        videoId: 'test-video',
        personaId: 'test-persona',
        annotations,
        lastLoadTimestamp: loadTimestamp,
        debounceMs: 1000
      }),
      { wrapper }
    )

    // Fast-forward past debounce time
    vi.advanceTimersByTime(1500)

    // Should NOT have called API save methods
    expect(api.saveAnnotation).not.toHaveBeenCalled()
    expect(api.updateAnnotation).not.toHaveBeenCalled()
  })

  it('should auto-save when user creates new annotation', async () => {
    const loadTimestamp = Date.now()
    const initialAnnotations = [createMockAnnotation('ann-1', 'Initial')]

    const { rerender } = renderHook(
      ({ annotations }) => useAutoSaveAnnotations({
        videoId: 'test-video',
        personaId: 'test-persona',
        annotations,
        lastLoadTimestamp: loadTimestamp,
        debounceMs: 1000
      }),
      {
        wrapper,
        initialProps: { annotations: initialAnnotations }
      }
    )

    // Clear the mock to ignore initial render
    vi.clearAllMocks()

    // User creates a new annotation
    const updatedAnnotations = [
      ...initialAnnotations,
      createMockAnnotation('ann-2', 'New')
    ]

    rerender({ annotations: updatedAnnotations })

    // Fast-forward past debounce time and allow promises to resolve
    await vi.advanceTimersByTimeAsync(1500)

    // Should have called API to CREATE the new annotation and UPDATE the existing one
    expect(api.saveAnnotation).toHaveBeenCalled()
    expect(api.updateAnnotation).toHaveBeenCalled()
  })

  it('should NOT duplicate annotations after reload', async () => {
    // Simulate first page load
    const firstLoadTimestamp = 1000
    const annotations = [
      createMockAnnotation('ann-1', 'Existing 1'),
      createMockAnnotation('ann-2', 'Existing 2')
    ]

    const { unmount } = renderHook(
      ({ lastLoadTimestamp, annotations }) => useAutoSaveAnnotations({
        videoId: 'test-video',
        personaId: 'test-persona',
        annotations,
        lastLoadTimestamp,
        debounceMs: 1000
      }),
      {
        wrapper,
        initialProps: { lastLoadTimestamp: firstLoadTimestamp, annotations }
      }
    )

    vi.clearAllMocks()

    // Simulate page reload - unmount and remount with same annotations
    unmount()

    const secondLoadTimestamp = 2000
    renderHook(
      () => useAutoSaveAnnotations({
        videoId: 'test-video',
        personaId: 'test-persona',
        annotations, // Same annotations reloaded from API
        lastLoadTimestamp: secondLoadTimestamp,
        debounceMs: 1000
      }),
      { wrapper }
    )

    // Fast-forward past debounce time
    vi.advanceTimersByTime(1500)

    // Should NOT auto-save because annotations were just loaded
    expect(api.saveAnnotation).not.toHaveBeenCalled()
    expect(api.updateAnnotation).not.toHaveBeenCalled()
  })

  it('should track loaded IDs correctly across reloads', async () => {
    // First load with 2 annotations
    const firstLoadTimestamp = 1000
    const initialAnnotations = [
      createMockAnnotation('ann-1', 'First'),
      createMockAnnotation('ann-2', 'Second')
    ]

    const { unmount } = renderHook(
      ({ lastLoadTimestamp, annotations }) => useAutoSaveAnnotations({
        videoId: 'test-video',
        personaId: 'test-persona',
        annotations,
        lastLoadTimestamp,
        debounceMs: 1000
      }),
      {
        wrapper,
        initialProps: { lastLoadTimestamp: firstLoadTimestamp, annotations: initialAnnotations }
      }
    )

    vi.clearAllMocks()
    unmount()

    // Reload with 3 annotations (user added one before reload)
    const secondLoadTimestamp = 2000
    const reloadedAnnotations = [
      ...initialAnnotations,
      createMockAnnotation('ann-3', 'Added before reload')
    ]

    const { rerender: rerender2 } = renderHook(
      ({ lastLoadTimestamp, annotations }) => useAutoSaveAnnotations({
        videoId: 'test-video',
        personaId: 'test-persona',
        annotations,
        lastLoadTimestamp,
        debounceMs: 1000
      }),
      {
        wrapper,
        initialProps: { lastLoadTimestamp: secondLoadTimestamp, annotations: reloadedAnnotations }
      }
    )

    vi.clearAllMocks()

    // Now user adds a 4th annotation
    const withNewAnnotation = [
      ...reloadedAnnotations,
      createMockAnnotation('ann-4', 'New after reload')
    ]

    rerender2({ lastLoadTimestamp: secondLoadTimestamp, annotations: withNewAnnotation })

    await vi.advanceTimersByTimeAsync(1500)

    // Should CREATE the new annotation and UPDATE the existing loaded ones
    expect(api.saveAnnotation).toHaveBeenCalled()
    expect(api.updateAnnotation).toHaveBeenCalled()
  })

  it('should debounce multiple rapid changes', async () => {
    const loadTimestamp = Date.now()
    const initialAnnotations = [createMockAnnotation('ann-1', 'Initial')]

    const { rerender } = renderHook(
      ({ annotations }) => useAutoSaveAnnotations({
        videoId: 'test-video',
        personaId: 'test-persona',
        annotations,
        lastLoadTimestamp: loadTimestamp,
        debounceMs: 1000
      }),
      {
        wrapper,
        initialProps: { annotations: initialAnnotations }
      }
    )

    vi.clearAllMocks()

    // Make 3 rapid changes
    const change1 = [...initialAnnotations, createMockAnnotation('ann-2', 'Change 1')]
    rerender({ annotations: change1 })

    vi.advanceTimersByTime(500)

    const change2 = [...change1, createMockAnnotation('ann-3', 'Change 2')]
    rerender({ annotations: change2 })

    vi.advanceTimersByTime(500)

    const change3 = [...change2, createMockAnnotation('ann-4', 'Change 3')]
    rerender({ annotations: change3 })

    // Should not have saved yet
    expect(api.saveAnnotation).not.toHaveBeenCalled()

    // Fast-forward to complete debounce
    await vi.advanceTimersByTimeAsync(1000)

    // Should CREATE all 3 new annotations and UPDATE the existing one
    expect(api.saveAnnotation).toHaveBeenCalled()
    expect(api.updateAnnotation).toHaveBeenCalled()
  })

  it('should not save when annotations are empty', async () => {
    const loadTimestamp = Date.now()

    renderHook(
      () => useAutoSaveAnnotations({
        videoId: 'test-video',
        personaId: 'test-persona',
        annotations: [],
        lastLoadTimestamp: loadTimestamp,
        debounceMs: 1000
      }),
      { wrapper }
    )

    vi.advanceTimersByTime(1500)

    expect(api.saveAnnotation).not.toHaveBeenCalled()
    expect(api.updateAnnotation).not.toHaveBeenCalled()
  })

  it('should not save when videoId is undefined', async () => {
    const loadTimestamp = Date.now()
    const annotations = [createMockAnnotation('ann-1', 'Test')]

    renderHook(
      () => useAutoSaveAnnotations({
        videoId: undefined,
        personaId: 'test-persona',
        annotations,
        lastLoadTimestamp: loadTimestamp,
        debounceMs: 1000
      }),
      { wrapper }
    )

    vi.advanceTimersByTime(1500)

    expect(api.saveAnnotation).not.toHaveBeenCalled()
    expect(api.updateAnnotation).not.toHaveBeenCalled()
  })

  it('should handle annotation updates (not just additions)', async () => {
    const loadTimestamp = Date.now()
    const initialAnnotations = [createMockAnnotation('ann-1', 'Original')]

    const { rerender } = renderHook(
      ({ annotations }) => useAutoSaveAnnotations({
        videoId: 'test-video',
        personaId: 'test-persona',
        annotations,
        lastLoadTimestamp: loadTimestamp,
        debounceMs: 1000
      }),
      {
        wrapper,
        initialProps: { annotations: initialAnnotations }
      }
    )

    vi.clearAllMocks()

    // Update existing annotation
    const updatedAnnotations = [{ ...initialAnnotations[0], label: 'Modified' }]
    rerender({ annotations: updatedAnnotations })

    await vi.advanceTimersByTimeAsync(1500)

    // Should call UPDATE (not CREATE) since ann-1 was loaded
    expect(api.updateAnnotation).toHaveBeenCalled()
    expect(api.saveAnnotation).not.toHaveBeenCalled()
  })
})
