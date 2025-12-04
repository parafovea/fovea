import { createSlice, PayloadAction, createSelector, createAsyncThunk } from '@reduxjs/toolkit'
import { Annotation, Time, BoundingBox, InterpolationType, TrackingResult } from '../models/types.js'
import { DetectionResponse } from '../api/client.js'
import { BoundingBoxInterpolator, LazyBoundingBoxSequence } from '../utils/interpolation.js'
import { api } from '../services/api'
import { v4 as uuidv4 } from 'uuid'

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
  loadedAnnotationIds: Record<string, string[]>  // Track IDs loaded from API per video (for CREATE vs UPDATE)
  annotationIdMapping: Record<string, Record<string, string>>  // Per-video mapping of client UUID → server ID

  // Tracking-specific state
  trackingResults: TrackingResult[]
  previewedTrackId: string | number | null
  showTrackingResults: boolean

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
  loadedAnnotationIds: {},
  annotationIdMapping: {},

  // Tracking-specific state
  trackingResults: [],
  previewedTrackId: null,
  showTrackingResults: false,

  // Sequence-specific state
  interpolationMode: 'linear',
  selectedKeyframes: [],
  showMotionPath: false,
  timelineZoom: 1,
  currentFrame: 0,
}

// Interpolator instance (shared across all actions)
const interpolator = new BoundingBoxInterpolator()

/**
 * Validates that a key is safe to use as an object property.
 * Prevents prototype pollution by rejecting dangerous property names.
 */
function isSafeKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

/**
 * Creates a safe key for video ID property access.
 * Prepends a marker prefix to prevent CodeQL remote property injection warnings.
 * This follows the official CodeQL recommendation to prepend user-controlled input
 * with a marker character before using it as a property key.
 *
 * @param videoId - The video ID from user input
 * @returns Safe key with "video_" prefix
 */
function makeSafeVideoKey(videoId: string): string {
  return `video_${videoId}`
}

/**
 * Saves all annotations for a video to the database.
 * Handles both creating new annotations and updating existing ones.
 * Tracks which annotations have been saved to distinguish between create and update operations.
 *
 * @param params - Object containing videoId, personaId, and annotations array
 * @param params.videoId - ID of the video these annotations belong to
 * @param params.personaId - ID of the persona (for filtering)
 * @param params.annotations - Array of annotations to save
 * @returns Object with videoId, saved annotations count, and any errors encountered
 */
export const saveAnnotations = createAsyncThunk(
  'annotations/saveAnnotations',
  async (params: {
    videoId: string
    personaId: string | null
    annotations: Annotation[]
  }, { getState }) => {
    const { videoId, annotations } = params

    // Get loaded IDs and ID mapping from Redux state
    const state = getState() as { annotations: AnnotationState }
    const safeKey = makeSafeVideoKey(videoId)
    const loadedIds = state.annotations.loadedAnnotationIds[safeKey] || []
    const loadedSet = new Set(loadedIds)
    const idMapping = { ...(state.annotations.annotationIdMapping[safeKey] || {}) } // Copy existing mapping

    const savedCount = { created: 0, updated: 0 }
    const errors: Array<{ annotationId: string; error: string }> = []

    // Save each annotation individually
    // The backend has separate endpoints for create (POST) and update (PUT)
    for (const annotation of annotations) {
      // Generate client-side ID if missing (for newly created annotations)
      if (!annotation.id) {
        annotation.id = uuidv4()
      }

      try {
        // Determine if this is a new annotation or an update
        // Check both loadedSet and idMapping to avoid re-creating annotations
        // that have been saved but not yet synced with server ID
        const isNew = !loadedSet.has(annotation.id) && !idMapping[annotation.id]

        if (isNew) {
          // Create new annotation (POST returns annotation with server-generated ID)
          const savedAnnotation = await api.saveAnnotation(annotation)
          savedCount.created++

          // Map client ID to server ID for future reference
          if (savedAnnotation.id !== annotation.id) {
            idMapping[annotation.id] = savedAnnotation.id
            loadedSet.add(savedAnnotation.id)  // Track server ID
          } else {
            loadedSet.add(annotation.id)
          }
        } else {
          // Update existing annotation  - use server ID if we have a mapping
          const serverIdOrOriginal = idMapping[annotation.id] || annotation.id

          // Create a copy with the correct server ID for the API call
          const annotationForUpdate = { ...annotation, id: serverIdOrOriginal }
          await api.updateAnnotation(annotationForUpdate)
          savedCount.updated++
        }
      } catch (error) {
        console.error(`[AUTO-SAVE] Error saving annotation ${annotation.id}:`, error)
        errors.push({
          annotationId: annotation.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Return the updated loaded IDs and ID mapping for the fulfilled handler
    return { videoId, savedCount, errors, loadedIds: Array.from(loadedSet), idMapping }
  }
)

const annotationSlice = createSlice({
  name: 'annotations',
  initialState,
  reducers: {
    setAnnotations: (state, action: PayloadAction<{ videoId: string; annotations: Annotation[] }>) => {
      const videoId = action.payload.videoId
      if (isSafeKey(videoId)) {
        const safeKey = makeSafeVideoKey(videoId)
        // Safe to use prefixed key - prevents CodeQL remote property injection warning
        state.annotations[safeKey] = action.payload.annotations
        // Track which IDs were loaded from API (for distinguishing CREATE vs UPDATE in saveAnnotations)
        state.loadedAnnotationIds[safeKey] = action.payload.annotations
          .map(a => a.id)
          .filter((id): id is string => !!id)
      }
    },
    addAnnotation: (state, action: PayloadAction<Annotation>) => {
      const videoId = action.payload.videoId
      if (isSafeKey(videoId)) {
        const safeKey = makeSafeVideoKey(videoId)
        if (!state.annotations[safeKey]) {
          state.annotations[safeKey] = []
        }
        state.annotations[safeKey].push(action.payload)
      }
    },
    updateAnnotation: (state, action: PayloadAction<Annotation>) => {
      const videoId = action.payload.videoId
      if (isSafeKey(videoId)) {
        const safeKey = makeSafeVideoKey(videoId)
        if (state.annotations[safeKey]) {
          const index = state.annotations[safeKey].findIndex(a => a.id === action.payload.id)
          if (index !== -1) {
            state.annotations[safeKey][index] = action.payload
          }
        }
      }
    },
    deleteAnnotation: (state, action: PayloadAction<{ videoId: string; annotationId: string }>) => {
      const { videoId, annotationId } = action.payload
      if (isSafeKey(videoId)) {
        const safeKey = makeSafeVideoKey(videoId)
        if (state.annotations[safeKey]) {
          state.annotations[safeKey] = state.annotations[safeKey].filter(a => a.id !== annotationId)
        }
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

    // Tracking-specific actions
    setTrackingResults: (state, action: PayloadAction<TrackingResult[]>) => {
      state.trackingResults = action.payload
      state.showTrackingResults = action.payload.length > 0
    },

    setPreviewedTrack: (state, action: PayloadAction<string | number | null>) => {
      state.previewedTrackId = action.payload
    },

    acceptTrack: (state, action: PayloadAction<string | number>) => {
      state.trackingResults = state.trackingResults.filter(
        (track) => track.trackId !== action.payload
      )
      if (state.previewedTrackId === action.payload) {
        state.previewedTrackId = null
      }
    },

    rejectTrack: (state, action: PayloadAction<string | number>) => {
      state.trackingResults = state.trackingResults.filter(
        (track) => track.trackId !== action.payload
      )
      if (state.previewedTrackId === action.payload) {
        state.previewedTrackId = null
      }
    },

    setShowTrackingResults: (state, action: PayloadAction<boolean>) => {
      state.showTrackingResults = action.payload
    },

    clearTrackingState: (state) => {
      state.trackingResults = []
      state.previewedTrackId = null
      state.showTrackingResults = false
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
      fps?: number
    }>) => {
      const { videoId, annotationId, frameNumber, box, fps = 30 } = action.payload
      const safeKey = makeSafeVideoKey(videoId)
      const videoAnnotations = state.annotations[safeKey]
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

      // Update annotation timeSpan to cover all keyframes
      if (updatedSequence.boxes.length > 0) {
        const keyframes = updatedSequence.boxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)
        const sortedKeyframes = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
        const startTime = sortedKeyframes[0].frameNumber / fps
        const endTime = sortedKeyframes[sortedKeyframes.length - 1].frameNumber / fps
        // Ensure minimum 1 second duration for single keyframe to show ghost box
        annotation.timeSpan = {
          startTime,
          endTime: Math.max(endTime, startTime + 1),
        }
      }
    },

    removeKeyframe: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      frameNumber: number
      fps?: number
    }>) => {
      const { videoId, annotationId, frameNumber, fps = 30 } = action.payload
      const safeKey = makeSafeVideoKey(videoId)
      const videoAnnotations = state.annotations[safeKey]
      if (!videoAnnotations) return

      const annotation = videoAnnotations.find(a => a.id === annotationId)
      if (!annotation) return

      annotation.boundingBoxSequence = interpolator.removeKeyframe(
        annotation.boundingBoxSequence,
        frameNumber
      )

      // Update annotation timeSpan to cover remaining keyframes
      const updatedSequence = annotation.boundingBoxSequence
      if (updatedSequence.boxes.length > 0) {
        const keyframes = updatedSequence.boxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)
        const sortedKeyframes = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
        const startTime = sortedKeyframes[0].frameNumber / fps
        const endTime = sortedKeyframes[sortedKeyframes.length - 1].frameNumber / fps
        // Ensure minimum 1 second duration for single keyframe to show ghost box
        annotation.timeSpan = {
          startTime,
          endTime: Math.max(endTime, startTime + 1),
        }
      }
    },

    updateKeyframe: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      frameNumber: number
      box: Partial<BoundingBox>
    }>) => {
      const { videoId, annotationId, frameNumber, box } = action.payload
      const safeKey = makeSafeVideoKey(videoId)
      const videoAnnotations = state.annotations[safeKey]
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
      fps?: number
    }>) => {
      const { videoId, annotationId, oldFrame, newFrame, fps = 30 } = action.payload
      const safeKey = makeSafeVideoKey(videoId)
      const videoAnnotations = state.annotations[safeKey]
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

      // Update annotation timeSpan to cover all keyframes
      if (withNew.boxes.length > 0) {
        const keyframes = withNew.boxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)
        const sortedKeyframes = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
        const startTime = sortedKeyframes[0].frameNumber / fps
        const endTime = sortedKeyframes[sortedKeyframes.length - 1].frameNumber / fps
        // Ensure minimum 1 second duration for single keyframe to show ghost box
        annotation.timeSpan = {
          startTime,
          endTime: Math.max(endTime, startTime + 1),
        }
      }
    },

    setSegmentInterpolationMode: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      startFrame: number
      endFrame: number
      mode: InterpolationType
    }>) => {
      const { videoId, annotationId, startFrame, endFrame, mode } = action.payload
      const safeKey = makeSafeVideoKey(videoId)
      const videoAnnotations = state.annotations[safeKey]
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
      const safeKey = makeSafeVideoKey(videoId)
      const videoAnnotations = state.annotations[safeKey]
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

    updateInterpolationSegment: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      segmentIndex: number
      type: InterpolationType
      controlPoints?: any
    }>) => {
      const { videoId, annotationId, segmentIndex, type, controlPoints } = action.payload
      const safeKey = makeSafeVideoKey(videoId)
      const videoAnnotations = state.annotations[safeKey]
      if (!videoAnnotations) return

      const annotation = videoAnnotations.find(a => a.id === annotationId)
      if (!annotation) return

      const sequence = annotation.boundingBoxSequence
      if (segmentIndex < 0 || segmentIndex >= sequence.interpolationSegments.length) return

      const segment = sequence.interpolationSegments[segmentIndex]
      segment.type = type

      if (type === 'bezier' && controlPoints) {
        segment.controlPoints = controlPoints
      } else if (type !== 'bezier') {
        // Clear control points for non-bezier modes
        delete segment.controlPoints
      }
    },

    toggleVisibilityAtFrame: (state, action: PayloadAction<{
      videoId: string
      annotationId: string
      frameNumber: number
    }>) => {
      const { videoId, annotationId, frameNumber } = action.payload
      const safeKey = makeSafeVideoKey(videoId)
      const videoAnnotations = state.annotations[safeKey]
      if (!videoAnnotations) return

      const annotation = videoAnnotations.find(a => a.id === annotationId)
      if (!annotation) return

      const sequence = annotation.boundingBoxSequence

      // Find range containing this frame
      const rangeIndex = sequence.visibilityRanges.findIndex(
        r => r.startFrame <= frameNumber && r.endFrame >= frameNumber
      )

      if (rangeIndex !== -1) {
        const range = sequence.visibilityRanges[rangeIndex]
        const newVisibility = !range.visible

        // Split the range if frame is in the middle
        if (frameNumber === range.startFrame && frameNumber === range.endFrame) {
          // Single frame range - just toggle it
          range.visible = newVisibility
        } else if (frameNumber === range.startFrame) {
          // Toggle at start - split off first frame
          range.startFrame = frameNumber + 1
          sequence.visibilityRanges.splice(rangeIndex, 0, {
            startFrame: frameNumber,
            endFrame: frameNumber,
            visible: newVisibility
          })
        } else if (frameNumber === range.endFrame) {
          // Toggle at end - split off last frame
          range.endFrame = frameNumber - 1
          sequence.visibilityRanges.push({
            startFrame: frameNumber,
            endFrame: frameNumber,
            visible: newVisibility
          })
        } else {
          // Toggle in middle - split into three ranges
          const originalEnd = range.endFrame
          range.endFrame = frameNumber - 1
          sequence.visibilityRanges.push(
            {
              startFrame: frameNumber,
              endFrame: frameNumber,
              visible: newVisibility
            },
            {
              startFrame: frameNumber + 1,
              endFrame: originalEnd,
              visible: range.visible
            }
          )
        }

        // Sort and merge adjacent ranges with same visibility
        sequence.visibilityRanges.sort((a, b) => a.startFrame - b.startFrame)

        // Merge adjacent ranges
        for (let i = sequence.visibilityRanges.length - 1; i > 0; i--) {
          const curr = sequence.visibilityRanges[i]
          const prev = sequence.visibilityRanges[i - 1]
          if (prev.endFrame + 1 === curr.startFrame && prev.visible === curr.visible) {
            prev.endFrame = curr.endFrame
            sequence.visibilityRanges.splice(i, 1)
          }
        }
      } else {
        // No range found - create a new single-frame hidden range
        sequence.visibilityRanges.push({
          startFrame: frameNumber,
          endFrame: frameNumber,
          visible: false
        })
        sequence.visibilityRanges.sort((a, b) => a.startFrame - b.startFrame)
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(saveAnnotations.pending, (_state) => {
        // Could add loading state here if needed
      })
      .addCase(saveAnnotations.fulfilled, (state, action) => {
        const { videoId, errors, loadedIds, idMapping } = action.payload

        // Update loadedAnnotationIds and ID mapping
        if (isSafeKey(videoId)) {
          const safeKey = makeSafeVideoKey(videoId)
          // Safe to use prefixed key - prevents CodeQL remote property injection warning
          state.loadedAnnotationIds[safeKey] = loadedIds
          state.annotationIdMapping[safeKey] = idMapping
        }

        if (errors.length > 0) {
          console.error('Annotation save errors:', errors)
        }
      })
      .addCase(saveAnnotations.rejected, (_state, action) => {
        console.error('Auto-save failed:', action.error.message)
      })
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
  setTrackingResults,
  setPreviewedTrack,
  acceptTrack,
  rejectTrack,
  setShowTrackingResults,
  clearTrackingState,
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
  updateInterpolationSegment,
  toggleVisibilityAtFrame,
} = annotationSlice.actions

// Selectors
export const selectAnnotations = (state: { annotations: AnnotationState }, videoId: string) => {
  const safeKey = makeSafeVideoKey(videoId)
  return state.annotations.annotations[safeKey] || []
}

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
    (state: { annotations: AnnotationState }, videoId: string, annotationId: string) => {
      const safeKey = makeSafeVideoKey(videoId)
      return state.annotations.annotations[safeKey]?.find(a => a.id === annotationId)
    },
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
  const safeKey = makeSafeVideoKey(videoId)
  const annotation = state.annotations.annotations[safeKey]?.find(a => a.id === annotationId)
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
  const safeKey = makeSafeVideoKey(videoId)
  const annotation = state.annotations.annotations[safeKey]?.find(a => a.id === annotationId)
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
    (state: { annotations: AnnotationState }, videoId: string, annotationId: string) => {
      const safeKey = makeSafeVideoKey(videoId)
      return state.annotations.annotations[safeKey]?.find(a => a.id === annotationId)
    },
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

/**
 * Select visibility ranges for an annotation.
 *
 * @param state - Redux state
 * @param videoId - Video ID
 * @param annotationId - Annotation ID
 * @returns Visibility ranges
 */
export const selectVisibilityRanges = (
  state: { annotations: AnnotationState },
  videoId: string,
  annotationId: string
) => {
  const safeKey = makeSafeVideoKey(videoId)
  const annotation = state.annotations.annotations[safeKey]?.find(a => a.id === annotationId)
  return annotation?.boundingBoxSequence.visibilityRanges || []
}

/**
 * Check if a frame is visible in an annotation.
 *
 * @param state - Redux state
 * @param videoId - Video ID
 * @param annotationId - Annotation ID
 * @param frameNumber - Frame number to check
 * @returns True if frame is visible
 */
export const selectIsVisibleAtFrame = (
  state: { annotations: AnnotationState },
  videoId: string,
  annotationId: string,
  frameNumber: number
): boolean => {
  const safeKey = makeSafeVideoKey(videoId)
  const annotation = state.annotations.annotations[safeKey]?.find(a => a.id === annotationId)
  if (!annotation) return false

  const ranges = annotation.boundingBoxSequence.visibilityRanges
  if (ranges.length === 0) return true

  const range = ranges.find(r => r.startFrame <= frameNumber && r.endFrame >= frameNumber)
  return range?.visible ?? true
}

/**
 * Select interpolation segment containing a frame.
 *
 * @param state - Redux state
 * @param videoId - Video ID
 * @param annotationId - Annotation ID
 * @param frameNumber - Frame number
 * @returns Interpolation segment or null
 */
export const selectInterpolationSegment = (
  state: { annotations: AnnotationState },
  videoId: string,
  annotationId: string,
  frameNumber: number
) => {
  const safeKey = makeSafeVideoKey(videoId)
  const annotation = state.annotations.annotations[safeKey]?.find(a => a.id === annotationId)
  if (!annotation) return null

  return annotation.boundingBoxSequence.interpolationSegments.find(
    s => s.startFrame <= frameNumber && s.endFrame >= frameNumber
  ) || null
}

export default annotationSlice.reducer