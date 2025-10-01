import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { VideoMetadata } from '../models/types'

/**
 * State for video management in the annotation tool.
 */
interface VideoState {
  /** Array of all available videos. */
  videos: VideoMetadata[]
  /** Currently selected video for annotation. */
  currentVideo: VideoMetadata | null
  /** Whether videos are currently being loaded. */
  isLoading: boolean
  /** Error message from video operations, if any. */
  error: string | null
  /** Filtering criteria for video list. */
  filter: {
    /** Text search term for filtering videos. */
    searchTerm: string
    /** Array of tag strings to filter by. */
    tags: string[]
  }
  /** Tracking information for the most recent annotation. */
  lastAnnotation: {
    /** Video ID of the last annotation. */
    videoId: string | null
    /** Timestamp of the last annotation in seconds. */
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

/**
 * Redux slice for managing video state in the annotation tool.
 * Handles video loading, selection, filtering, and annotation tracking.
 */
const videoSlice = createSlice({
  name: 'videos',
  initialState,
  reducers: {
    /**
     * Set the complete list of available videos.
     * @param state - Current video state.
     * @param action - Action containing array of video metadata.
     */
    setVideos: (state, action: PayloadAction<VideoMetadata[]>) => {
      state.videos = action.payload
    },
    /**
     * Set the currently selected video for annotation.
     * @param state - Current video state.
     * @param action - Action containing video metadata or null to deselect.
     */
    setCurrentVideo: (state, action: PayloadAction<VideoMetadata | null>) => {
      state.currentVideo = action.payload
    },
    /**
     * Set the loading state for video operations.
     * @param state - Current video state.
     * @param action - Action containing boolean loading state.
     */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    /**
     * Set error state for video operations.
     * @param state - Current video state.
     * @param action - Action containing error message or null to clear.
     */
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    /**
     * Set search term for filtering videos.
     * @param state - Current video state.
     * @param action - Action containing search term string.
     */
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.filter.searchTerm = action.payload
    },
    /**
     * Set tag filter for videos.
     * @param state - Current video state.
     * @param action - Action containing array of tag strings.
     */
    setFilterTags: (state, action: PayloadAction<string[]>) => {
      state.filter.tags = action.payload
    },
    /**
     * Record the last annotation created for tracking purposes.
     * @param state - Current video state.
     * @param action - Action containing video ID and timestamp.
     */
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