import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'
import annotationReducer from './annotationSlice'
import videoReducer from './videoSlice'
import personaReducer from './personaSlice'
import worldReducer from './worldSlice'
import videoSummaryReducer from './videoSummarySlice'
import userReducer from './userSlice'
import claimsReducer from './claimsSlice'

export const store = configureStore({
  reducer: {
    annotations: annotationReducer,
    videos: videoReducer,
    persona: personaReducer,
    world: worldReducer,
    videoSummaries: videoSummaryReducer,
    user: userReducer,
    claims: claimsReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Typed hooks
export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector