import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Annotation, Time } from '../models/types'

type AnnotationMode = 
  | 'type-assignment'  // Assign types directly (requires persona)
  | 'entity-link'      // Link to world entity
  | 'event-link'       // Link to world event
  | 'location-link'    // Link to location entity
  | 'collection-link'  // Link to collection

interface AnnotationState {
  annotations: Record<string, Annotation[]>
  selectedAnnotation: Annotation | null
  selectedPersonaId: string | null
  annotationMode: AnnotationMode
  isDrawing: boolean
  drawingMode: 'entity' | 'role' | 'event' | null
  temporaryBox: {
    x: number
    y: number
    width: number
    height: number
  } | null
  temporaryTime: Time | null
  linkTargetId: string | null  // ID of entity/event/collection to link
  linkTargetType: 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection' | 'time-collection' | null
}

const initialState: AnnotationState = {
  annotations: {},
  selectedAnnotation: null,
  selectedPersonaId: null,
  annotationMode: 'type-assignment',
  isDrawing: false,
  drawingMode: null,
  temporaryBox: null,
  temporaryTime: null,
  linkTargetId: null,
  linkTargetType: null,
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
    setTemporaryBox: (state, action: PayloadAction<{ x: number; y: number; width: number; height: number } | null>) => {
      state.temporaryBox = action.payload
    },
    clearDrawingState: (state) => {
      state.isDrawing = false
      state.drawingMode = null
      state.temporaryBox = null
    },
    setSelectedPersona: (state, action: PayloadAction<string | null>) => {
      state.selectedPersonaId = action.payload
    },
    setAnnotationMode: (state, action: PayloadAction<AnnotationMode>) => {
      state.annotationMode = action.payload
      // Clear persona if switching to a mode that doesn't need it
      if (action.payload !== 'type-assignment') {
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
  },
})

export const {
  setAnnotations,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  selectAnnotation,
  setDrawingMode,
  setTemporaryBox,
  clearDrawingState,
  setSelectedPersona,
  setAnnotationMode,
  setTemporaryTime,
  setLinkTarget,
  clearLinkTarget,
} = annotationSlice.actions

export default annotationSlice.reducer