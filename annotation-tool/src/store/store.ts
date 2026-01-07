import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'
import annotationReducer from './slices/annotationSlice'
import videoReducer from './slices/videoSlice'
import personaReducer from './slices/personaSlice'
import worldReducer from './slices/worldSlice'
import videoSummaryReducer from './slices/videoSummarySlice'
import userReducer from './slices/userSlice'
import claimsReducer from './slices/claimsSlice'

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