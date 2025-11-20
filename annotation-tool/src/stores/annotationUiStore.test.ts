/**
 * Tests for Annotation UI Store
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useAnnotationUiStore } from './annotationUiStore'
import { Annotation } from '../models/types'

describe('AnnotationUiStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useAnnotationUiStore.getState().resetAllState()
  })

  describe('Initial State', () => {
    it('should have correct initial drawing state', () => {
      const state = useAnnotationUiStore.getState()
      expect(state.isDrawing).toBe(false)
      expect(state.drawingMode).toBe(null)
      expect(state.temporaryBox).toBe(null)
      expect(state.temporaryTime).toBe(null)
    })

    it('should have correct initial selection state', () => {
      const state = useAnnotationUiStore.getState()
      expect(state.selectedAnnotation).toBe(null)
      expect(state.selectedTypeId).toBe(null)
      expect(state.selectedPersonaId).toBe(null)
      expect(state.selectedKeyframes).toEqual([])
    })

    it('should have correct initial mode state', () => {
      const state = useAnnotationUiStore.getState()
      expect(state.annotationMode).toBe('type')
      expect(state.interpolationMode).toBe('linear')
    })

    it('should have correct initial link state', () => {
      const state = useAnnotationUiStore.getState()
      expect(state.linkTargetId).toBe(null)
      expect(state.linkTargetType).toBe(null)
    })

    it('should have correct initial detection UI state', () => {
      const state = useAnnotationUiStore.getState()
      expect(state.showDetectionCandidates).toBe(false)
      expect(state.detectionQuery).toBe('')
      expect(state.detectionConfidenceThreshold).toBe(0.5)
    })

    it('should have correct initial tracking UI state', () => {
      const state = useAnnotationUiStore.getState()
      expect(state.showTrackingResults).toBe(false)
      expect(state.previewedTrackId).toBe(null)
    })

    it('should have correct initial timeline UI state', () => {
      const state = useAnnotationUiStore.getState()
      expect(state.showMotionPath).toBe(false)
      expect(state.timelineZoom).toBe(1)
      expect(state.currentFrame).toBe(0)
    })
  })

  describe('Drawing Actions', () => {
    it('should set isDrawing', () => {
      const { setIsDrawing } = useAnnotationUiStore.getState()
      setIsDrawing(true)
      expect(useAnnotationUiStore.getState().isDrawing).toBe(true)
      setIsDrawing(false)
      expect(useAnnotationUiStore.getState().isDrawing).toBe(false)
    })

    it('should set drawingMode', () => {
      const { setDrawingMode } = useAnnotationUiStore.getState()
      setDrawingMode('entity')
      expect(useAnnotationUiStore.getState().drawingMode).toBe('entity')
      setDrawingMode('role')
      expect(useAnnotationUiStore.getState().drawingMode).toBe('role')
      setDrawingMode('event')
      expect(useAnnotationUiStore.getState().drawingMode).toBe('event')
      setDrawingMode(null)
      expect(useAnnotationUiStore.getState().drawingMode).toBe(null)
    })

    it('should set temporaryBox', () => {
      const { setTemporaryBox } = useAnnotationUiStore.getState()
      const box = { x: 10, y: 20, width: 100, height: 50 }
      setTemporaryBox(box)
      expect(useAnnotationUiStore.getState().temporaryBox).toEqual(box)
      setTemporaryBox(null)
      expect(useAnnotationUiStore.getState().temporaryBox).toBe(null)
    })

    it('should set temporaryTime', () => {
      const { setTemporaryTime } = useAnnotationUiStore.getState()
      const time = { start: 0, end: 10 }
      setTemporaryTime(time)
      expect(useAnnotationUiStore.getState().temporaryTime).toEqual(time)
      setTemporaryTime(null)
      expect(useAnnotationUiStore.getState().temporaryTime).toBe(null)
    })

    it('should reset drawing state', () => {
      const { setIsDrawing, setDrawingMode, setTemporaryBox, resetDrawingState } =
        useAnnotationUiStore.getState()

      // Set some drawing state
      setIsDrawing(true)
      setDrawingMode('entity')
      setTemporaryBox({ x: 0, y: 0, width: 100, height: 100 })

      // Reset
      resetDrawingState()

      const state = useAnnotationUiStore.getState()
      expect(state.isDrawing).toBe(false)
      expect(state.drawingMode).toBe(null)
      expect(state.temporaryBox).toBe(null)
    })
  })

  describe('Selection Actions', () => {
    it('should set selectedAnnotation', () => {
      const { setSelectedAnnotation } = useAnnotationUiStore.getState()
      const annotation = {
        id: '1',
        videoId: 'video-1',
        time: { start: 0, end: 10 },
      } as Annotation
      setSelectedAnnotation(annotation)
      expect(useAnnotationUiStore.getState().selectedAnnotation).toEqual(annotation)
      setSelectedAnnotation(null)
      expect(useAnnotationUiStore.getState().selectedAnnotation).toBe(null)
    })

    it('should set selectedTypeId', () => {
      const { setSelectedTypeId } = useAnnotationUiStore.getState()
      setSelectedTypeId('type-123')
      expect(useAnnotationUiStore.getState().selectedTypeId).toBe('type-123')
      setSelectedTypeId(null)
      expect(useAnnotationUiStore.getState().selectedTypeId).toBe(null)
    })

    it('should set selectedPersonaId', () => {
      const { setSelectedPersonaId } = useAnnotationUiStore.getState()
      setSelectedPersonaId('persona-456')
      expect(useAnnotationUiStore.getState().selectedPersonaId).toBe('persona-456')
      setSelectedPersonaId(null)
      expect(useAnnotationUiStore.getState().selectedPersonaId).toBe(null)
    })

    it('should set selectedKeyframes', () => {
      const { setSelectedKeyframes } = useAnnotationUiStore.getState()
      const frames = [10, 20, 30]
      setSelectedKeyframes(frames)
      expect(useAnnotationUiStore.getState().selectedKeyframes).toEqual(frames)
    })

    it('should add keyframe', () => {
      const { addKeyframe } = useAnnotationUiStore.getState()
      addKeyframe(10)
      expect(useAnnotationUiStore.getState().selectedKeyframes).toEqual([10])
      addKeyframe(5)
      expect(useAnnotationUiStore.getState().selectedKeyframes).toEqual([5, 10]) // sorted
      addKeyframe(15)
      expect(useAnnotationUiStore.getState().selectedKeyframes).toEqual([5, 10, 15])
    })

    it('should remove keyframe', () => {
      const { setSelectedKeyframes, removeKeyframe } = useAnnotationUiStore.getState()
      setSelectedKeyframes([5, 10, 15, 20])
      removeKeyframe(10)
      expect(useAnnotationUiStore.getState().selectedKeyframes).toEqual([5, 15, 20])
      removeKeyframe(5)
      expect(useAnnotationUiStore.getState().selectedKeyframes).toEqual([15, 20])
    })

    it('should clear keyframes', () => {
      const { setSelectedKeyframes, clearKeyframes } = useAnnotationUiStore.getState()
      setSelectedKeyframes([5, 10, 15])
      clearKeyframes()
      expect(useAnnotationUiStore.getState().selectedKeyframes).toEqual([])
    })

    it('should reset selection state', () => {
      const {
        setSelectedAnnotation,
        setSelectedTypeId,
        setSelectedKeyframes,
        resetSelectionState,
      } = useAnnotationUiStore.getState()

      // Set some selection state
      setSelectedAnnotation({ id: '1', videoId: 'v1', time: { start: 0, end: 10 } } as Annotation)
      setSelectedTypeId('type-1')
      setSelectedKeyframes([1, 2, 3])

      // Reset
      resetSelectionState()

      const state = useAnnotationUiStore.getState()
      expect(state.selectedAnnotation).toBe(null)
      expect(state.selectedTypeId).toBe(null)
      expect(state.selectedKeyframes).toEqual([])
    })
  })

  describe('Mode Actions', () => {
    it('should set annotationMode', () => {
      const { setAnnotationMode } = useAnnotationUiStore.getState()
      setAnnotationMode('object')
      expect(useAnnotationUiStore.getState().annotationMode).toBe('object')
      setAnnotationMode('type')
      expect(useAnnotationUiStore.getState().annotationMode).toBe('type')
    })

    it('should set interpolationMode', () => {
      const { setInterpolationMode } = useAnnotationUiStore.getState()
      setInterpolationMode('cubic')
      expect(useAnnotationUiStore.getState().interpolationMode).toBe('cubic')
      setInterpolationMode('linear')
      expect(useAnnotationUiStore.getState().interpolationMode).toBe('linear')
    })
  })

  describe('Link Actions', () => {
    it('should set link target', () => {
      const { setLinkTarget } = useAnnotationUiStore.getState()
      setLinkTarget('entity-123', 'entity')
      const state = useAnnotationUiStore.getState()
      expect(state.linkTargetId).toBe('entity-123')
      expect(state.linkTargetType).toBe('entity')
    })

    it('should clear link target', () => {
      const { setLinkTarget, clearLinkTarget } = useAnnotationUiStore.getState()
      setLinkTarget('event-456', 'event')
      clearLinkTarget()
      const state = useAnnotationUiStore.getState()
      expect(state.linkTargetId).toBe(null)
      expect(state.linkTargetType).toBe(null)
    })
  })

  describe('Detection UI Actions', () => {
    it('should set showDetectionCandidates', () => {
      const { setShowDetectionCandidates } = useAnnotationUiStore.getState()
      setShowDetectionCandidates(true)
      expect(useAnnotationUiStore.getState().showDetectionCandidates).toBe(true)
      setShowDetectionCandidates(false)
      expect(useAnnotationUiStore.getState().showDetectionCandidates).toBe(false)
    })

    it('should set detectionQuery', () => {
      const { setDetectionQuery } = useAnnotationUiStore.getState()
      setDetectionQuery('person with red shirt')
      expect(useAnnotationUiStore.getState().detectionQuery).toBe('person with red shirt')
    })

    it('should set detectionConfidenceThreshold', () => {
      const { setDetectionConfidenceThreshold } = useAnnotationUiStore.getState()
      setDetectionConfidenceThreshold(0.75)
      expect(useAnnotationUiStore.getState().detectionConfidenceThreshold).toBe(0.75)
    })
  })

  describe('Tracking UI Actions', () => {
    it('should set showTrackingResults', () => {
      const { setShowTrackingResults } = useAnnotationUiStore.getState()
      setShowTrackingResults(true)
      expect(useAnnotationUiStore.getState().showTrackingResults).toBe(true)
      setShowTrackingResults(false)
      expect(useAnnotationUiStore.getState().showTrackingResults).toBe(false)
    })

    it('should set previewedTrackId', () => {
      const { setPreviewedTrackId } = useAnnotationUiStore.getState()
      setPreviewedTrackId('track-123')
      expect(useAnnotationUiStore.getState().previewedTrackId).toBe('track-123')
      setPreviewedTrackId(456)
      expect(useAnnotationUiStore.getState().previewedTrackId).toBe(456)
      setPreviewedTrackId(null)
      expect(useAnnotationUiStore.getState().previewedTrackId).toBe(null)
    })
  })

  describe('Timeline UI Actions', () => {
    it('should set showMotionPath', () => {
      const { setShowMotionPath } = useAnnotationUiStore.getState()
      setShowMotionPath(true)
      expect(useAnnotationUiStore.getState().showMotionPath).toBe(true)
      setShowMotionPath(false)
      expect(useAnnotationUiStore.getState().showMotionPath).toBe(false)
    })

    it('should set timelineZoom', () => {
      const { setTimelineZoom } = useAnnotationUiStore.getState()
      setTimelineZoom(5)
      expect(useAnnotationUiStore.getState().timelineZoom).toBe(5)
    })

    it('should clamp timelineZoom between 1 and 10', () => {
      const { setTimelineZoom } = useAnnotationUiStore.getState()
      setTimelineZoom(0.5)
      expect(useAnnotationUiStore.getState().timelineZoom).toBe(1)
      setTimelineZoom(15)
      expect(useAnnotationUiStore.getState().timelineZoom).toBe(10)
    })

    it('should set currentFrame', () => {
      const { setCurrentFrame } = useAnnotationUiStore.getState()
      setCurrentFrame(100)
      expect(useAnnotationUiStore.getState().currentFrame).toBe(100)
    })

    it('should not allow negative currentFrame', () => {
      const { setCurrentFrame } = useAnnotationUiStore.getState()
      setCurrentFrame(-5)
      expect(useAnnotationUiStore.getState().currentFrame).toBe(0)
    })
  })

  describe('Reset All State', () => {
    it('should reset all state to initial values', () => {
      const store = useAnnotationUiStore.getState()

      // Modify various state
      store.setIsDrawing(true)
      store.setDrawingMode('entity')
      store.setSelectedTypeId('type-1')
      store.setAnnotationMode('object')
      store.setShowDetectionCandidates(true)
      store.setTimelineZoom(5)
      store.setLinkTarget('entity-1', 'entity')

      // Reset all
      store.resetAllState()

      const state = useAnnotationUiStore.getState()

      // Verify reset
      expect(state.isDrawing).toBe(false)
      expect(state.drawingMode).toBe(null)
      expect(state.selectedTypeId).toBe(null)
      expect(state.annotationMode).toBe('type')
      expect(state.showDetectionCandidates).toBe(false)
      expect(state.timelineZoom).toBe(1)
      expect(state.linkTargetId).toBe(null)
      expect(state.linkTargetType).toBe(null)
    })
  })

  describe('Store Integration', () => {
    it('should maintain separate state for multiple consumers', () => {
      const { setIsDrawing, setDrawingMode } = useAnnotationUiStore.getState()

      setIsDrawing(true)
      setDrawingMode('entity')

      const state1 = useAnnotationUiStore.getState()
      const state2 = useAnnotationUiStore.getState()

      expect(state1.isDrawing).toBe(true)
      expect(state2.isDrawing).toBe(true)
      expect(state1.drawingMode).toBe('entity')
      expect(state2.drawingMode).toBe('entity')
    })

    it('should update state immediately', () => {
      const { setIsDrawing } = useAnnotationUiStore.getState()

      expect(useAnnotationUiStore.getState().isDrawing).toBe(false)
      setIsDrawing(true)
      expect(useAnnotationUiStore.getState().isDrawing).toBe(true)
    })
  })
})
