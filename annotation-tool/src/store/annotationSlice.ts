import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Annotation, Time } from '../models/types'
import { DetectionResponse } from '../api/client'

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
}

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
} = annotationSlice.actions

export default annotationSlice.reducer