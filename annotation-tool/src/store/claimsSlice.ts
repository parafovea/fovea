import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit'
import { Claim, ClaimExtractionConfig, ExtractClaimsResponse, ClaimExtractionJobStatus, CreateClaimRequest, UpdateClaimRequest } from '../models/types'

interface ClaimsState {
  claimsBySummary: Record<string, Claim[]> // Map summaryId -> claims
  selectedClaimId: string | null
  extracting: boolean
  extractionJobId: string | null
  extractionProgress: number | null
  extractionError: string | null
  loading: boolean
  error: string | null
}

const initialState: ClaimsState = {
  claimsBySummary: {},
  selectedClaimId: null,
  extracting: false,
  extractionJobId: null,
  extractionProgress: null,
  extractionError: null,
  loading: false,
  error: null,
}

// Async thunks for API calls

/**
 * Fetch all claims for a summary
 */
export const fetchClaims = createAsyncThunk(
  'claims/fetch',
  async ({ summaryId, summaryType = 'video' }: { summaryId: string; summaryType?: 'video' | 'collection' }) => {
    const response = await fetch(
      `/api/summaries/${summaryId}/claims?summaryType=${summaryType}&includeSubclaims=true`
    )
    if (!response.ok) {
      throw new Error('Failed to fetch claims')
    }
    const claims = await response.json()
    return { summaryId, claims }
  }
)

/**
 * Create a new claim
 */
export const createClaim = createAsyncThunk(
  'claims/create',
  async ({ summaryId, claim }: { summaryId: string; claim: CreateClaimRequest }) => {
    const response = await fetch(`/api/summaries/${summaryId}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(claim),
    })
    if (!response.ok) {
      throw new Error('Failed to create claim')
    }
    const { claims } = await response.json()
    return { summaryId, claims }
  }
)

/**
 * Update an existing claim
 */
export const updateClaim = createAsyncThunk(
  'claims/update',
  async ({
    summaryId,
    claimId,
    updates,
  }: {
    summaryId: string
    claimId: string
    updates: UpdateClaimRequest
  }) => {
    const response = await fetch(`/api/summaries/${summaryId}/claims/${claimId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!response.ok) {
      throw new Error('Failed to update claim')
    }
    const { claims } = await response.json()
    return { summaryId, claims }
  }
)

/**
 * Delete a claim
 */
export const deleteClaim = createAsyncThunk(
  'claims/delete',
  async ({ summaryId, claimId }: { summaryId: string; claimId: string }) => {
    const response = await fetch(`/api/summaries/${summaryId}/claims/${claimId}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error('Failed to delete claim')
    }
    return { summaryId, claimId }
  }
)

/**
 * Start claim extraction job
 */
export const extractClaims = createAsyncThunk(
  'claims/extract',
  async ({ summaryId, config }: { summaryId: string; config: ClaimExtractionConfig }) => {
    const response = await fetch(`/api/summaries/${summaryId}/claims/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!response.ok) {
      throw new Error('Failed to start claim extraction')
    }
    const result: ExtractClaimsResponse = await response.json()
    return result
  }
)

/**
 * Check extraction job status
 */
export const checkExtractionJob = createAsyncThunk(
  'claims/checkJob',
  async (jobId: string) => {
    const response = await fetch(`/api/jobs/claims/${jobId}`)
    if (!response.ok) {
      throw new Error('Failed to check job status')
    }
    const status: ClaimExtractionJobStatus = await response.json()
    return status
  }
)

const claimsSlice = createSlice({
  name: 'claims',
  initialState,
  reducers: {
    selectClaim: (state, action: PayloadAction<string | null>) => {
      state.selectedClaimId = action.payload
    },
    clearExtractionState: (state) => {
      state.extracting = false
      state.extractionJobId = null
      state.extractionProgress = null
      state.extractionError = null
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch claims
    builder.addCase(fetchClaims.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(fetchClaims.fulfilled, (state, action) => {
      state.loading = false
      state.claimsBySummary[action.payload.summaryId] = action.payload.claims
    })
    builder.addCase(fetchClaims.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to fetch claims'
    })

    // Create claim
    builder.addCase(createClaim.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(createClaim.fulfilled, (state, action) => {
      state.loading = false
      const { summaryId, claims } = action.payload
      state.claimsBySummary[summaryId] = claims
    })
    builder.addCase(createClaim.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to create claim'
    })

    // Update claim
    builder.addCase(updateClaim.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(updateClaim.fulfilled, (state, action) => {
      state.loading = false
      const { summaryId, claims } = action.payload
      state.claimsBySummary[summaryId] = claims
    })
    builder.addCase(updateClaim.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to update claim'
    })

    // Delete claim
    builder.addCase(deleteClaim.fulfilled, (state, action) => {
      const { summaryId, claimId } = action.payload
      if (state.claimsBySummary[summaryId]) {
        // Remove claim from tree
        const removeFromTree = (claims: Claim[]): Claim[] => {
          return claims.filter((c) => {
            if (c.id === claimId) return false
            if (c.subclaims) {
              c.subclaims = removeFromTree(c.subclaims)
            }
            return true
          })
        }
        state.claimsBySummary[summaryId] = removeFromTree(state.claimsBySummary[summaryId])
      }
      if (state.selectedClaimId === claimId) {
        state.selectedClaimId = null
      }
    })

    // Extract claims
    builder.addCase(extractClaims.pending, (state) => {
      state.extracting = true
      state.extractionError = null
    })
    builder.addCase(extractClaims.fulfilled, (state, action) => {
      state.extractionJobId = action.payload.jobId
      state.extractionProgress = 0
    })
    builder.addCase(extractClaims.rejected, (state, action) => {
      state.extracting = false
      state.extractionError = action.error.message || 'Failed to start extraction'
    })

    // Check extraction job
    builder.addCase(checkExtractionJob.fulfilled, (state, action) => {
      const status = action.payload
      state.extractionProgress = status.progress || null

      if (status.status === 'completed') {
        state.extracting = false
        state.extractionJobId = null
        state.extractionProgress = null
        // Claims will be fetched separately after completion
      } else if (status.status === 'failed') {
        state.extracting = false
        state.extractionJobId = null
        state.extractionProgress = null
        state.extractionError = status.error || 'Extraction failed'
      }
      // If still processing, keep polling
    })
    builder.addCase(checkExtractionJob.rejected, (state, action) => {
      state.extracting = false
      state.extractionJobId = null
      state.extractionError = action.error.message || 'Failed to check job status'
    })
  },
})

export const { selectClaim, clearExtractionState, clearError } = claimsSlice.actions
export default claimsSlice.reducer
