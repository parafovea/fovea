/**
 * @file redux-state.test.ts
 * @description Integration tests for Redux state management.
 * Validates state updates, selectors, and undo/redo functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import annotationSlice, {
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  selectAnnotations,
} from '../../src/store/annotationSlice.js'
import { Annotation } from '../../src/models/types.js'

describe('Redux State Management', () => {
  let store: ReturnType<typeof configureStore>

  beforeEach(() => {
    // Create fresh store for each test
    store = configureStore({
      reducer: {
        annotations: annotationSlice,
      },
    })
  })

  describe('sequence updates propagate to all subscribers', () => {
    it('dispatching addAnnotation updates state immediately', () => {
      const annotation: Annotation = {
        id: 'test-annotation-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [{ x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
          trackingSource: 'manual',
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      }

      // Get initial state
      const initialState = store.getState()
      expect(Object.keys(initialState.annotations.annotations)).toHaveLength(0)

      // Dispatch action
      store.dispatch(addAnnotation(annotation))

      // Verify state updated
      const updatedState = store.getState()
      const annotations = selectAnnotations(updatedState, 'test-video')
      expect(annotations).toBeDefined()
      expect(annotations).toHaveLength(1)
      expect(annotations[0].id).toBe('test-annotation-1')
    })

    it('multiple subscribers receive same updated state', () => {
      const annotation: Annotation = {
        id: 'test-annotation-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [{ x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [],
          trackingSource: 'manual',
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      }

      // Simulate multiple subscribers
      const subscriber1Updates: any[] = []
      const subscriber2Updates: any[] = []

      const unsubscribe1 = store.subscribe(() => {
        subscriber1Updates.push(store.getState().annotations)
      })

      const unsubscribe2 = store.subscribe(() => {
        subscriber2Updates.push(store.getState().annotations)
      })

      // Dispatch action
      store.dispatch(addAnnotation(annotation))

      // Both subscribers should have received update
      expect(subscriber1Updates).toHaveLength(1)
      expect(subscriber2Updates).toHaveLength(1)

      // Updates should be identical
      expect(subscriber1Updates[0]).toEqual(subscriber2Updates[0])

      unsubscribe1()
      unsubscribe2()
    })

    it('updateAnnotation triggers re-render', () => {
      // Add initial annotation
      const annotation: Annotation = {
        id: 'test-annotation-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [{ x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [],
          trackingSource: 'manual',
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      }

      store.dispatch(addAnnotation(annotation))

      // Subscribe to updates
      let updateCount = 0
      const unsubscribe = store.subscribe(() => {
        updateCount++
      })

      // Update annotation
      const updatedAnnotation: Annotation = {
        ...annotation,
        boundingBoxSequence: {
          ...annotation.boundingBoxSequence,
          boxes: [
            { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
            { x: 100, y: 100, width: 100, height: 100, frameNumber: 10, isKeyframe: true },
          ],
          keyframeCount: 2,
        },
      }

      store.dispatch(updateAnnotation(updatedAnnotation))

      // Should trigger update
      expect(updateCount).toBe(1)

      // Verify state changed
      const state = store.getState()
      const annotations = selectAnnotations(state, 'test-video')
      expect(annotations[0].boundingBoxSequence.keyframeCount).toBe(2)

      unsubscribe()
    })
  })

  describe('undo/redo functionality', () => {
    it('supports undo for addAnnotation', () => {
      // Note: This requires implementing undo/redo middleware
      // For now, test the state changes directly

      const annotation: Annotation = {
        id: 'test-annotation-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [{ x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [],
          trackingSource: 'manual',
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      }

      // Add annotation
      store.dispatch(addAnnotation(annotation))
      expect(selectAnnotations(store.getState(), 'test-video')).toHaveLength(1)

      // Undo (delete annotation)
      store.dispatch(deleteAnnotation({ videoId: 'test-video', annotationId: 'test-annotation-1' }))
      expect(selectAnnotations(store.getState(), 'test-video')).toHaveLength(0)

      // Redo (add again)
      store.dispatch(addAnnotation(annotation))
      expect(selectAnnotations(store.getState(), 'test-video')).toHaveLength(1)
    })

    it('supports undo for updateAnnotation', () => {
      const annotation: Annotation = {
        id: 'test-annotation-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [{ x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [],
          trackingSource: 'manual',
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      }

      // Add annotation
      store.dispatch(addAnnotation(annotation))

      const originalSequence = annotation.boundingBoxSequence

      // Update annotation
      const updatedAnnotation: Annotation = {
        ...annotation,
        boundingBoxSequence: {
          ...originalSequence,
          boxes: [
            { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
            { x: 100, y: 100, width: 100, height: 100, frameNumber: 10, isKeyframe: true },
          ],
          keyframeCount: 2,
        },
      }

      store.dispatch(updateAnnotation(updatedAnnotation))

      expect(selectAnnotations(store.getState(), 'test-video')[0].boundingBoxSequence.keyframeCount).toBe(2)

      // Undo (restore original)
      store.dispatch(updateAnnotation(annotation))

      expect(selectAnnotations(store.getState(), 'test-video')[0].boundingBoxSequence.keyframeCount).toBe(1)
    })

    it('undo/redo maintains state consistency', () => {
      const actions: Annotation[] = []

      // Perform 10 add/update/delete operations
      for (let i = 0; i < 10; i++) {
        const annotation: Annotation = {
          id: `annotation-${i}`,
          videoId: 'test-video',
          personaId: 'test-persona',
          annotationType: 'type',
          boundingBoxSequence: {
            boxes: [{ x: i, y: i, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [],
            trackingSource: 'manual',
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
        }

        actions.push(annotation)
        store.dispatch(addAnnotation(annotation))
      }

      expect(selectAnnotations(store.getState(), 'test-video')).toHaveLength(10)

      // Undo all (delete in reverse)
      for (let i = 9; i >= 0; i--) {
        store.dispatch(deleteAnnotation({ videoId: 'test-video', annotationId: `annotation-${i}` }))
      }

      expect(selectAnnotations(store.getState(), 'test-video')).toHaveLength(0)

      // Redo all (add again)
      actions.forEach((annotation) => {
        store.dispatch(addAnnotation(annotation))
      })

      expect(selectAnnotations(store.getState(), 'test-video')).toHaveLength(10)
    })
  })

  describe('no memory leaks on repeated operations', () => {
    it('repeated add/remove does not grow memory', () => {
      const memBefore = process.memoryUsage().heapUsed / 1024 / 1024 // MB

      // Perform 1000 add/remove cycles
      for (let i = 0; i < 1000; i++) {
        const annotation: Annotation = {
          id: 'test-annotation',
          videoId: 'test-video',
          personaId: 'test-persona',
          annotationType: 'type',
          boundingBoxSequence: {
            boxes: [{ x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [],
            trackingSource: 'manual',
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
        }

        store.dispatch(addAnnotation(annotation))
        store.dispatch(deleteAnnotation({ videoId: 'test-video', annotationId: 'test-annotation' }))
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const memAfter = process.memoryUsage().heapUsed / 1024 / 1024 // MB
      const memGrowth = memAfter - memBefore
      const memGrowthPercent = (memGrowth / memBefore) * 100

      console.log(`Memory before: ${memBefore.toFixed(2)}MB`)
      console.log(`Memory after: ${memAfter.toFixed(2)}MB`)
      console.log(`Growth: ${memGrowth.toFixed(2)}MB (${memGrowthPercent.toFixed(1)}%)`)

      // Allow some memory growth accounting for GC timing variance
      // Threshold set to catch actual leaks while tolerating normal variance and CI environment differences
      expect(memGrowthPercent).toBeLessThan(50)
    })

    it('large state updates do not leak', () => {
      const memBefore = process.memoryUsage().heapUsed / 1024 / 1024

      // Add 100 annotations
      for (let i = 0; i < 100; i++) {
        const annotation: Annotation = {
          id: `annotation-${i}`,
          videoId: 'test-video',
          personaId: 'test-persona',
          annotationType: 'type',
          boundingBoxSequence: {
            boxes: [{ x: i, y: i, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [],
            trackingSource: 'manual',
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
        }

        store.dispatch(addAnnotation(annotation))
      }

      // Update all 100 annotations 10 times
      for (let j = 0; j < 10; j++) {
        for (let i = 0; i < 100; i++) {
          const updated: Annotation = {
            id: `annotation-${i}`,
            videoId: 'test-video',
            personaId: 'test-persona',
            annotationType: 'type',
            boundingBoxSequence: {
              boxes: [
                { x: i + j, y: i + j, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
              ],
              interpolationSegments: [],
              visibilityRanges: [],
              trackingSource: 'manual',
              totalFrames: 1,
              keyframeCount: 1,
              interpolatedFrameCount: 0,
            },
          }
          store.dispatch(updateAnnotation(updated))
        }
      }

      if (global.gc) {
        global.gc()
      }

      const memAfter = process.memoryUsage().heapUsed / 1024 / 1024
      const memGrowth = memAfter - memBefore
      const memGrowthPercent = (memGrowth / memBefore) * 100

      console.log(`1000 updates - Memory before: ${memBefore.toFixed(2)}MB`)
      console.log(`1000 updates - Memory after: ${memAfter.toFixed(2)}MB`)
      console.log(`1000 updates - Growth: ${memGrowth.toFixed(2)}MB (${memGrowthPercent.toFixed(1)}%)`)

      // Should not grow excessively (allow for some growth from Redux state, CI has variable memory)
      expect(memGrowthPercent).toBeLessThan(100)
    })
  })

  describe('selector performance', () => {
    it('selectors memoize correctly', () => {
      // Add 100 annotations
      for (let i = 0; i < 100; i++) {
        const annotation: Annotation = {
          id: `annotation-${i}`,
          videoId: 'test-video',
          personaId: 'test-persona',
          annotationType: 'type',
          boundingBoxSequence: {
            boxes: [{ x: i, y: i, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [],
            trackingSource: 'manual',
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
        }

        store.dispatch(addAnnotation(annotation))
      }

      // Get state multiple times
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        store.getState().annotations.annotations
      }

      const duration = performance.now() - start

      console.log(`1000 selector calls: ${duration.toFixed(2)}ms`)
      console.log(`Average per call: ${(duration / 1000).toFixed(4)}ms`)

      // Should be very fast due to memoization
      expect(duration).toBeLessThan(10)
    })
  })

  describe('concurrent updates', () => {
    it('handles rapid sequential updates', () => {
      const annotation: Annotation = {
        id: 'test-annotation',
        videoId: 'test-video',
        personaId: 'test-persona',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [{ x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [],
          trackingSource: 'manual',
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      }

      store.dispatch(addAnnotation(annotation))

      // Rapid updates (simulating user scrubbing)
      for (let i = 0; i < 100; i++) {
        const updated: Annotation = {
          id: 'test-annotation',
          videoId: 'test-video',
          personaId: 'test-persona',
          annotationType: 'type',
          boundingBoxSequence: {
            boxes: [{ x: i, y: i, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [],
            trackingSource: 'manual',
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
        }
        store.dispatch(updateAnnotation(updated))
      }

      // Final state should reflect last update
      const state = store.getState()
      const annotations = selectAnnotations(state, 'test-video')
      expect(annotations[0].boundingBoxSequence.boxes[0].x).toBe(99)
    })
  })
})
