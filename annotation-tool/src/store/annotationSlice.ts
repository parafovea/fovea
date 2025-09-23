import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Annotation } from '../models/types'

interface AnnotationState {
  annotations: Record<string, Annotation[]>
  selectedAnnotation: Annotation | null
  selectedPersonaId: string | null
  isDrawing: boolean
  drawingMode: 'entity' | 'role' | 'event' | null
  temporaryBox: {
    x: number
    y: number
    width: number
    height: number
  } | null
}

const initialState: AnnotationState = {
  annotations: {},
  selectedAnnotation: null,
  selectedPersonaId: null,
  isDrawing: false,
  drawingMode: null,
  temporaryBox: null,
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
} = annotationSlice.actions

export default annotationSlice.reducer