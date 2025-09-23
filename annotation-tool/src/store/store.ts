import { configureStore } from '@reduxjs/toolkit'
import ontologyReducer from './ontologySlice'
import annotationReducer from './annotationSlice'
import videoReducer from './videoSlice'
import personaReducer from './personaSlice'

export const store = configureStore({
  reducer: {
    ontology: ontologyReducer,
    annotations: annotationReducer,
    videos: videoReducer,
    persona: personaReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch