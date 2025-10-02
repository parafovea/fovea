import { configureStore } from '@reduxjs/toolkit'
import annotationReducer from './annotationSlice'
import videoReducer from './videoSlice'
import personaReducer from './personaSlice'
import worldReducer from './worldSlice'
import videoSummaryReducer from './videoSummarySlice'

export const store = configureStore({
  reducer: {
    annotations: annotationReducer,
    videos: videoReducer,
    persona: personaReducer,
    world: worldReducer,
    videoSummaries: videoSummaryReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch