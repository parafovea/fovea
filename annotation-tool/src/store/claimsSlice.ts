import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit'
import { Claim, ClaimExtractionConfig, ExtractClaimsResponse, ClaimExtractionJobStatus, CreateClaimRequest, UpdateClaimRequest, ClaimRelation } from '../models/types'

interface ClaimRelationsData {
  asSource: ClaimRelation[]
  asTarget: ClaimRelation[]
  isLoading: boolean
  error: string | null
}

interface ClaimsState {
  claimsBySummary: Record<string, Claim[]> // Map summaryId -> claims
  selectedClaimId: string | null
  extracting: boolean
  extractionJobId: string | null
  extractionProgress: number | null
  extractionError: string | null
  loading: boolean
  error: string | null
  relations: Record<string, ClaimRelationsData> // Map claimId -> relations
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
  relations: {},
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

/**
 * Fetch all relations for a claim
 */
export const fetchClaimRelations = createAsyncThunk(
  'claims/fetchRelations',
  async ({ summaryId, claimId }: { summaryId: string; claimId: string }) => {
    const response = await fetch(`/api/summaries/${summaryId}/claims/${claimId}/relations`)
    if (!response.ok) {
      throw new Error('Failed to fetch claim relations')
    }
    const data = await response.json()
    return { claimId, data }
  }
)

/**
 * Create a new claim relation
 */
export const createClaimRelation = createAsyncThunk(
  'claims/createRelation',
  async ({
    summaryId,
    sourceClaimId,
    relation,
  }: {
    summaryId: string
    sourceClaimId: string
    relation: {
      targetClaimId: string
      relationTypeId: string
      sourceSpans?: Array<{ charStart: number; charEnd: number }>
      targetSpans?: Array<{ charStart: number; charEnd: number }>
      confidence?: number
      notes?: string
    }
  }) => {
    const response = await fetch(
      `/api/summaries/${summaryId}/claims/${sourceClaimId}/relations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relation),
      }
    )
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create relation')
    }
    const createdRelation = await response.json()
    return { sourceClaimId, relation: createdRelation }
  }
)

/**
 * Delete a claim relation
 */
export const deleteClaimRelation = createAsyncThunk(
  'claims/deleteRelation',
  async ({
    summaryId,
    relationId,
    sourceClaimId,
  }: {
    summaryId: string
    relationId: string
    sourceClaimId: string
  }) => {
    const response = await fetch(
      `/api/summaries/${summaryId}/claims/relations/${relationId}`,
      {
        method: 'DELETE',
      }
    )
    if (!response.ok) {
      throw new Error('Failed to delete relation')
    }
    return { relationId, sourceClaimId }
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

    // Fetch claim relations
    builder.addCase(fetchClaimRelations.pending, (state, action) => {
      const { claimId } = action.meta.arg
      state.relations[claimId] = {
        asSource: [],
        asTarget: [],
        isLoading: true,
        error: null,
      }
    })
    builder.addCase(fetchClaimRelations.fulfilled, (state, action) => {
      const { claimId, data } = action.payload
      state.relations[claimId] = {
        asSource: data.asSource,
        asTarget: data.asTarget,
        isLoading: false,
        error: null,
      }
    })
    builder.addCase(fetchClaimRelations.rejected, (state, action) => {
      const { claimId } = action.meta.arg
      if (state.relations[claimId]) {
        state.relations[claimId].isLoading = false
        state.relations[claimId].error = action.error.message || 'Failed to load relations'
      }
    })

    // Create claim relation
    builder.addCase(createClaimRelation.fulfilled, (state, action) => {
      const { sourceClaimId, relation } = action.payload
      if (state.relations[sourceClaimId]) {
        state.relations[sourceClaimId].asSource.push(relation)
      }
    })

    // Delete claim relation
    builder.addCase(deleteClaimRelation.fulfilled, (state, action) => {
      const { relationId, sourceClaimId } = action.payload
      if (state.relations[sourceClaimId]) {
        state.relations[sourceClaimId].asSource = state.relations[sourceClaimId].asSource.filter(
          (r) => r.id !== relationId
        )
      }
    })
  },
})

export const { selectClaim, clearExtractionState, clearError } = claimsSlice.actions
export default claimsSlice.reducer
