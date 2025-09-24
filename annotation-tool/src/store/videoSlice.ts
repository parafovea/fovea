import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { VideoMetadata } from '../models/types'

interface VideoState {
  videos: VideoMetadata[]
  currentVideo: VideoMetadata | null
  isLoading: boolean
  error: string | null
  filter: {
    searchTerm: string
    tags: string[]
  }
  lastAnnotation: {
    videoId: string | null
    timestamp: number
  }
}

const initialState: VideoState = {
  videos: [],
  currentVideo: null,
  isLoading: false,
  error: null,
  filter: {
    searchTerm: '',
    tags: [],
  },
  lastAnnotation: {
    videoId: null,
    timestamp: 0,
  },
}

const videoSlice = createSlice({
  name: 'videos',
  initialState,
  reducers: {
    setVideos: (state, action: PayloadAction<VideoMetadata[]>) => {
      state.videos = action.payload
    },
    setCurrentVideo: (state, action: PayloadAction<VideoMetadata | null>) => {
      state.currentVideo = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.filter.searchTerm = action.payload
    },
    setFilterTags: (state, action: PayloadAction<string[]>) => {
      state.filter.tags = action.payload
    },
    setLastAnnotation: (state, action: PayloadAction<{ videoId: string; timestamp: number }>) => {
      state.lastAnnotation = action.payload
    },
  },
})

export const {
  setVideos,
  setCurrentVideo,
  setLoading,
  setError,
  setSearchTerm,
  setFilterTags,
  setLastAnnotation,
} = videoSlice.actions

export default videoSlice.reducer