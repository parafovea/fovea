import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit'
import { Annotation, Time, BoundingBox, InterpolationType } from '../models/types.js'
import { DetectionResponse } from '../api/client.js'
import { BoundingBoxInterpolator, LazyBoundingBoxSequence } from '../utils/interpolation.js'

type AnnotationMode =
  | 'type'    // Assign types from persona ontology (requires persona)
  | 'object'  // Link to world objects (entities, events, locations, collections)

interface AnnotationState {
  annotations: Record<string, Annotation[]>
  selectedAnnotation: Annotation | null
  selectedPersonaId: string | null
  annotationMode: AnnotationMode
  isDrawing: boolean
  drawingMode: 'entity' | 'role' | 'event' | null
  selectedTypeId: string | null  // ID of the selected type for type mode
  temporaryBox: {
    x: number
    y: number
    width: number
    height: number
  } | null
  temporaryTime: Time | null
  linkTargetId: string | null  // ID of entity/event/collection to link
  linkTargetType: 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection' | 'time-collection' | null
  detectionResults: DetectionResponse | null
  detectionQuery: string
  detectionConfidenceThreshold: number
  showDetectionCandidates: boolean

  // Sequence-specific state
  interpolationMode: InterpolationType
  selectedKeyframes: number[]  // Selected keyframe frame numbers
  showMotionPath: boolean
  timelineZoom: number  // 1-10x
  currentFrame: number  // Current video frame
}

const initialState: AnnotationState = {
  annotations: {},
  selectedAnnotation: null,
  selectedPersonaId: null,
  annotationMode: 'type',
  isDrawing: false,
  drawingMode: null,
  selectedTypeId: null,
  temporaryBox: null,
  temporaryTime: null,
  linkTargetId: null,
  linkTargetType: null,
  detectionResults: null,
  detectionQuery: '',
  detectionConfidenceThreshold: 0.5,
  showDetectionCandidates: false,

  // Sequence-specific state
  interpolationMode: 'linear',
  selectedKeyframes: [],
  showMotionPath: false,
  timelineZoom: 1,
  currentFrame: 0,
}

// Interpolator instance (shared across all actions)
const interpolator = new BoundingBoxInterpolator()

const annotationSlice = createSlice({
  name: 'annotations',
  initialState,
  reducers: {
    setAnnotations: (state, action: PayloadAction<{ videoId: string; annotations: Annotation[] }>) => {
      state.annotations[action.payload.videoId] = action.payload.annotations
    },
    addAnnotation: (state, action: PayloadAction<Annotation>) => {
      const videoId = action.payload.videoId
      if (!state.annotations[videoId]) {
        state.annotations[videoId] = []
      }
      state.annotations[videoId].push(action.payload)
    },
    updateAnnotation: (state, action: PayloadAction<Annotation>) => {
      const videoId = action.payload.videoId
      if (state.annotations[videoId]) {
        const index = state.annotations[videoId].findIndex(a => a.id === action.payload.id)
        if (index !== -1) {
          state.annotations[videoId][index] = action.payload
        }
      }
    },
    deleteAnnotation: (state, action: PayloadAction<{ videoId: string; annotationId: string }>) => {
      const { videoId, annotationId } = action.payload
      if (state.annotations[videoId]) {
        state.annotations[videoId] = state.annotations[videoId].filter(a => a.id !== annotationId)
      }
    },
    selectAnnotation: (state, action: PayloadAction<Annotation | null>) => {
      state.selectedAnnotation = action.payload
    },
    setDrawingMode: (state, action: PayloadAction<'entity' | 'role' | 'event' | null>) => {
      state.drawingMode = action.payload
      state.isDrawing = action.payload !== null
    },
    setSelectedType: (state, action: PayloadAction<{ typeId: string | null; category: 'entity' | 'role' | 'event' | null }>) => {
      state.selectedTypeId = action.payload.typeId
      state.drawingMode = action.payload.category
      state.isDrawing = action.payload.category !== null
    },
    setTemporaryBox: (state, action: PayloadAction<{ x: number; y: number; width: number; height: number } | null>) => {
      state.temporaryBox = action.payload
    },
    clearDrawingState: (state) => {
      state.isDrawing = false
      state.drawingMode = null
      state.selectedTypeId = null
      state.temporaryBox = null
    },
    setSelectedPersona: (state, action: PayloadAction<string | null>) => {
      state.selectedPersonaId = action.payload
    },
    setAnnotationMode: (state, action: PayloadAction<AnnotationMode>) => {
      state.annotationMode = action.payload
      // Clear persona if switching to object mode
      if (action.payload === 'object') {
        state.selectedPersonaId = null
      }
    },
    setTemporaryTime: (state, action: PayloadAction<Time | null>) => {
      state.temporaryTime = action.payload
    },
    setLinkTarget: (state, action: PayloadAction<{
      id: string | null
      type: 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection' | 'time-collection' | null
    }>) => {
      state.linkTargetId = action.payload.id
      state.linkTargetType = action.payload.type
    },
    clearLinkTarget: (state) => {
      state.linkTargetId = null
      state.linkTargetType = null
    },
    setDetectionResults: (state, action: PayloadAction<DetectionResponse | null>) => {
      state.detectionResults = action.payload
    },
    setDetectionQuery: (state, action: PayloadAction<string>) => {
      state.detectionQuery = action.payload
    },
    setDetectionConfidenceThreshold: (state, action: PayloadAction<number>) => {
      state.detectionConfidenceThreshold = action.payload
    },
    setShowDetectionCandidates: (state, action: PayloadAction<boolean>) => {
      state.showDetectionCandidates = action.payload
    },
    clearDetectionState: (state) => {
      state.detectionResults = null
      state.detectionQuery = ''
      state.showDetectionCandidates = false
    },

    // Sequence-specific actions
    setCurrentFrame: (state, action: PayloadAction<number>) => {
      state.currentFrame = action.payload
    },

    setInterpolationMode: (state, action: PayloadAction<InterpolationType>) => {
      state.interpolationMode = action.payload
    },

    setSelectedKeyframes: (state, action: PayloadAction<number[]>) => {
      state.selectedKeyframes = action.payload
    },

    setShowMotionPath: (state, action: PayloadAction<boolean>) => {
      state.showMotionPath = action.payload
    },

    setTimelineZoom: (state, action: PayloadAction<number>) => {
      state.timelineZoom = Math.max(1, Math.min(10, action.payload))
    },

    addKeyframe: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      frameNumber: number
      box?: Partial<BoundingBox>
    }>) => {
      const { videoId, annotationId, frameNumber, box } = action.payload
      const videoAnnotations = state.annotations[videoId]
      if (!videoAnnotations) return

      const annotation = videoAnnotations.find(a => a.id === annotationId)
      if (!annotation) return

      const updatedSequence = interpolator.addKeyframe(
        annotation.boundingBoxSequence,
        frameNumber
      )

      // If box values provided, update the new keyframe
      if (box) {
        const keyframeIndex = updatedSequence.boxes.findIndex(b => b.frameNumber === frameNumber)
        if (keyframeIndex !== -1) {
          updatedSequence.boxes[keyframeIndex] = {
            ...updatedSequence.boxes[keyframeIndex],
            ...box,
          }
        }
      }

      annotation.boundingBoxSequence = updatedSequence
    },

    removeKeyframe: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      frameNumber: number
    }>) => {
      const { videoId, annotationId, frameNumber } = action.payload
      const videoAnnotations = state.annotations[videoId]
      if (!videoAnnotations) return

      const annotation = videoAnnotations.find(a => a.id === annotationId)
      if (!annotation) return

      annotation.boundingBoxSequence = interpolator.removeKeyframe(
        annotation.boundingBoxSequence,
        frameNumber
      )
    },

    updateKeyframe: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      frameNumber: number
      box: Partial<BoundingBox>
    }>) => {
      const { videoId, annotationId, frameNumber, box } = action.payload
      const videoAnnotations = state.annotations[videoId]
      if (!videoAnnotations) return

      const annotation = videoAnnotations.find(a => a.id === annotationId)
      if (!annotation) return

      annotation.boundingBoxSequence = interpolator.updateKeyframe(
        annotation.boundingBoxSequence,
        frameNumber,
        box
      )
    },

    moveKeyframe: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      oldFrame: number
      newFrame: number
    }>) => {
      const { videoId, annotationId, oldFrame, newFrame } = action.payload
      const videoAnnotations = state.annotations[videoId]
      if (!videoAnnotations) return

      const annotation = videoAnnotations.find(a => a.id === annotationId)
      if (!annotation) return

      // Find the keyframe at oldFrame
      const keyframe = annotation.boundingBoxSequence.boxes.find(
        b => b.frameNumber === oldFrame && (b.isKeyframe || b.isKeyframe === undefined)
      )
      if (!keyframe) return

      // Remove old keyframe
      const withoutOld = interpolator.removeKeyframe(
        annotation.boundingBoxSequence,
        oldFrame
      )

      // Add at new location
      const withNew = interpolator.addKeyframe(withoutOld, newFrame)

      // Update the new keyframe with old values
      const newKeyframeIndex = withNew.boxes.findIndex(b => b.frameNumber === newFrame)
      if (newKeyframeIndex !== -1) {
        withNew.boxes[newKeyframeIndex] = {
          ...keyframe,
          frameNumber: newFrame,
        }
      }

      annotation.boundingBoxSequence = withNew
    },

    setSegmentInterpolationMode: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      startFrame: number
      endFrame: number
      mode: InterpolationType
    }>) => {
      const { videoId, annotationId, startFrame, endFrame, mode } = action.payload
      const videoAnnotations = state.annotations[videoId]
      if (!videoAnnotations) return

      const annotation = videoAnnotations.find(a => a.id === annotationId)
      if (!annotation) return

      const sequence = annotation.boundingBoxSequence
      const segmentIndex = sequence.interpolationSegments.findIndex(
        s => s.startFrame === startFrame && s.endFrame === endFrame
      )

      if (segmentIndex !== -1) {
        sequence.interpolationSegments[segmentIndex].type = mode
      }
    },

    setVisibilityRange: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      startFrame: number
      endFrame: number
      visible: boolean
    }>) => {
      const { videoId, annotationId, startFrame, endFrame, visible } = action.payload
      const videoAnnotations = state.annotations[videoId]
      if (!videoAnnotations) return

      const annotation = videoAnnotations.find(a => a.id === annotationId)
      if (!annotation) return

      const sequence = annotation.boundingBoxSequence

      // Add or update visibility range
      const existingRange = sequence.visibilityRanges.find(
        r => r.startFrame === startFrame && r.endFrame === endFrame
      )

      if (existingRange) {
        existingRange.visible = visible
      } else {
        sequence.visibilityRanges.push({ startFrame, endFrame, visible })
      }

      // Sort visibility ranges
      sequence.visibilityRanges.sort((a, b) => a.startFrame - b.startFrame)
    },
  },
})

export const {
  setAnnotations,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  selectAnnotation,
  setDrawingMode,
  setSelectedType,
  setTemporaryBox,
  clearDrawingState,
  setSelectedPersona,
  setAnnotationMode,
  setTemporaryTime,
  setLinkTarget,
  clearLinkTarget,
  setDetectionResults,
  setDetectionQuery,
  setDetectionConfidenceThreshold,
  setShowDetectionCandidates,
  clearDetectionState,
  setCurrentFrame,
  setInterpolationMode,
  setSelectedKeyframes,
  setShowMotionPath,
  setTimelineZoom,
  addKeyframe,
  removeKeyframe,
  updateKeyframe,
  moveKeyframe,
  setSegmentInterpolationMode,
  setVisibilityRange,
} = annotationSlice.actions

// Selectors
export const selectAnnotations = (state: { annotations: AnnotationState }, videoId: string) =>
  state.annotations.annotations[videoId] || []

export const selectSelectedAnnotation = (state: { annotations: AnnotationState }) =>
  state.annotations.selectedAnnotation

export const selectCurrentFrame = (state: { annotations: AnnotationState }) =>
  state.annotations.currentFrame

export const selectInterpolationMode = (state: { annotations: AnnotationState }) =>
  state.annotations.interpolationMode

export const selectSelectedKeyframes = (state: { annotations: AnnotationState }) =>
  state.annotations.selectedKeyframes

export const selectShowMotionPath = (state: { annotations: AnnotationState }) =>
  state.annotations.showMotionPath

export const selectTimelineZoom = (state: { annotations: AnnotationState }) =>
  state.annotations.timelineZoom

/**
 * Select annotation at a specific frame with interpolation.
 *
 * @param state - Redux state
 * @param videoId - Video ID
 * @param annotationId - Annotation ID
 * @param frameNumber - Frame number
 * @returns Interpolated bounding box at frame
 */
export const selectAnnotationAtFrame = createSelector(
  [
    (state: { annotations: AnnotationState }, videoId: string, annotationId: string) =>
      state.annotations.annotations[videoId]?.find(a => a.id === annotationId),
    (_state: { annotations: AnnotationState }, _videoId: string, _annotationId: string, frameNumber: number) => frameNumber,
  ],
  (annotation, frameNumber) => {
    if (!annotation) return null

    const lazy = new LazyBoundingBoxSequence(
      annotation.boundingBoxSequence.boxes,
      annotation.boundingBoxSequence.interpolationSegments
    )

    return lazy.getBoxAtFrame(frameNumber)
  }
)

/**
 * Select keyframes for an annotation.
 *
 * @param state - Redux state
 * @param videoId - Video ID
 * @param annotationId - Annotation ID
 * @returns Keyframe bounding boxes
 */
export const selectKeyframes = (
  state: { annotations: AnnotationState },
  videoId: string,
  annotationId: string
): BoundingBox[] => {
  const annotation = state.annotations.annotations[videoId]?.find(a => a.id === annotationId)
  if (!annotation) return []

  return annotation.boundingBoxSequence.boxes.filter(
    b => b.isKeyframe || b.isKeyframe === undefined
  )
}

/**
 * Select interpolation segments for an annotation.
 *
 * @param state - Redux state
 * @param videoId - Video ID
 * @param annotationId - Annotation ID
 * @returns Interpolation segments
 */
export const selectInterpolationSegments = (
  state: { annotations: AnnotationState },
  videoId: string,
  annotationId: string
) => {
  const annotation = state.annotations.annotations[videoId]?.find(a => a.id === annotationId)
  if (!annotation) return []

  return annotation.boundingBoxSequence.interpolationSegments
}

/**
 * Check if a frame is a keyframe.
 *
 * @param state - Redux state
 * @param videoId - Video ID
 * @param annotationId - Annotation ID
 * @param frameNumber - Frame number to check
 * @returns True if frame is a keyframe
 */
export const selectIsKeyframe = (
  state: { annotations: AnnotationState },
  videoId: string,
  annotationId: string,
  frameNumber: number
): boolean => {
  const keyframes = selectKeyframes(state, videoId, annotationId)
  return keyframes.some(k => k.frameNumber === frameNumber)
}

/**
 * Select motion path for visualization.
 *
 * @param state - Redux state
 * @param videoId - Video ID
 * @param annotationId - Annotation ID
 * @returns Motion path points
 */
export const selectMotionPath = createSelector(
  [
    (state: { annotations: AnnotationState }, videoId: string, annotationId: string) =>
      state.annotations.annotations[videoId]?.find(a => a.id === annotationId),
  ],
  (annotation) => {
    if (!annotation) return []

    const keyframes = annotation.boundingBoxSequence.boxes.filter(
      b => b.isKeyframe || b.isKeyframe === undefined
    )

    if (keyframes.length < 2) return []

    // Generate all interpolated frames
    const allBoxes = interpolator.interpolate(
      keyframes,
      annotation.boundingBoxSequence.interpolationSegments
    )

    // Return path points (center of each box)
    return allBoxes.map(box => ({
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      frameNumber: box.frameNumber,
      isKeyframe: box.isKeyframe || false,
    }))
  }
)

export default annotationSlice.reducer