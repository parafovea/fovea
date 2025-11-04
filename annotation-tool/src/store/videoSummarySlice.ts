import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit'
import { VideoSummary } from '../models/types'

interface VideoSummaryState {
  summaries: Record<string, VideoSummary[]> // videoId -> summaries
  currentSummary: VideoSummary | null
  loading: boolean
  saving: boolean
  error: string | null
}

const initialState: VideoSummaryState = {
  summaries: {},
  currentSummary: null,
  loading: false,
  saving: false,
  error: null,
}

// Async thunks for API calls
export const fetchVideoSummaries = createAsyncThunk(
  'videoSummaries/fetch',
  async (videoId: string) => {
    const response = await fetch(`/api/videos/${videoId}/summaries`)
    if (!response.ok) {
      throw new Error('Failed to fetch video summaries')
    }
    const data = await response.json()
    return { videoId, summaries: data }
  }
)

export const fetchVideoSummaryForPersona = createAsyncThunk(
  'videoSummaries/fetchForPersona',
  async ({ videoId, personaId }: { videoId: string; personaId: string }) => {
    const response = await fetch(`/api/videos/${videoId}/summaries/${personaId}`)
    if (!response.ok) {
      if (response.status === 404) {
        return null // No summary exists yet
      }
      throw new Error('Failed to fetch video summary')
    }
    return await response.json()
  }
)

export const saveVideoSummary = createAsyncThunk(
  'videoSummaries/save',
  async (summary: VideoSummary) => {
    const url = summary.id
      ? `/api/videos/${summary.videoId}/summaries/${summary.id}`
      : `/api/summaries`

    const response = await fetch(url, {
      method: summary.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
    })

    if (!response.ok) {
      throw new Error('Failed to save video summary')
    }
    return await response.json()
  }
)

export const deleteVideoSummary = createAsyncThunk(
  'videoSummaries/delete',
  async ({ videoId, summaryId }: { videoId: string; summaryId: string }) => {
    const response = await fetch(`/api/videos/${videoId}/summaries/${summaryId}`, {
      method: 'DELETE',
    })
    
    if (!response.ok) {
      throw new Error('Failed to delete video summary')
    }
    return { videoId, summaryId }
  }
)

const videoSummarySlice = createSlice({
  name: 'videoSummaries',
  initialState,
  reducers: {
    setCurrentSummary: (state, action: PayloadAction<VideoSummary | null>) => {
      state.currentSummary = action.payload
    },
    updateCurrentSummary: (state, action: PayloadAction<Partial<VideoSummary>>) => {
      if (state.currentSummary) {
        state.currentSummary = {
          ...state.currentSummary,
          ...action.payload,
          updatedAt: new Date().toISOString(),
        }
      }
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch summaries
    builder.addCase(fetchVideoSummaries.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(fetchVideoSummaries.fulfilled, (state, action) => {
      state.loading = false
      state.summaries[action.payload.videoId] = action.payload.summaries
    })
    builder.addCase(fetchVideoSummaries.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to fetch summaries'
    })
    
    // Fetch summary for persona
    builder.addCase(fetchVideoSummaryForPersona.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(fetchVideoSummaryForPersona.fulfilled, (state, action) => {
      state.loading = false
      state.currentSummary = action.payload
    })
    builder.addCase(fetchVideoSummaryForPersona.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to fetch summary'
    })
    
    // Save summary
    builder.addCase(saveVideoSummary.pending, (state) => {
      state.saving = true
      state.error = null
    })
    builder.addCase(saveVideoSummary.fulfilled, (state, action) => {
      state.saving = false
      state.currentSummary = action.payload
      
      // Update in summaries list
      const videoId = action.payload.videoId
      if (!state.summaries[videoId]) {
        state.summaries[videoId] = []
      }
      const index = state.summaries[videoId].findIndex(s => s.id === action.payload.id)
      if (index >= 0) {
        state.summaries[videoId][index] = action.payload
      } else {
        state.summaries[videoId].push(action.payload)
      }
    })
    builder.addCase(saveVideoSummary.rejected, (state, action) => {
      state.saving = false
      state.error = action.error.message || 'Failed to save summary'
    })
    
    // Delete summary
    builder.addCase(deleteVideoSummary.fulfilled, (state, action) => {
      const { videoId, summaryId } = action.payload
      if (state.summaries[videoId]) {
        state.summaries[videoId] = state.summaries[videoId].filter(s => s.id !== summaryId)
      }
      if (state.currentSummary?.id === summaryId) {
        state.currentSummary = null
      }
    })
  },
})

export const { setCurrentSummary, updateCurrentSummary, clearError } = videoSummarySlice.actions
export default videoSummarySlice.reducer