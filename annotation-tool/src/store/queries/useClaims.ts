/**
 * TanStack Query hooks for claims management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Claim,
  ClaimExtractionConfig,
  ExtractClaimsResponse,
  ClaimExtractionJobStatus,
  CreateClaimRequest,
  UpdateClaimRequest,
  ClaimRelation,
} from '@models/types'
import { AppError } from '@lib/errors'
import { logError } from '@services/errorLogging'

/** Parse fetch error response to AppError, preserving server error hierarchy */
async function parseFetchError(response: Response, fallbackMessage: string): Promise<AppError> {
  let errorData: { error?: string; message?: string; details?: unknown }
  try {
    errorData = await response.json()
  } catch {
    const text = await response.text().catch(() => '')
    errorData = { error: 'FETCH_FAILED', message: text || fallbackMessage }
  }
  return new AppError(
    errorData.error || 'FETCH_FAILED',
    errorData.message || fallbackMessage,
    errorData.details
  )
}

/** Query key factory for claims */
export const claimsQueryKeys = {
  all: ['claims'] as const,
  bySummary: (summaryId: string) => [...claimsQueryKeys.all, 'summary', summaryId] as const,
  relations: (summaryId: string, claimId: string) =>
    [...claimsQueryKeys.all, 'relations', summaryId, claimId] as const,
  extractionJob: (jobId: string) => [...claimsQueryKeys.all, 'job', jobId] as const,
}

/** Response type for claim relations */
interface ClaimRelationsResponse {
  asSource: ClaimRelation[]
  asTarget: ClaimRelation[]
}

/**
 * Fetch all claims for a summary
 */
async function fetchClaims(
  summaryId: string,
  summaryType: 'video' | 'collection' = 'video'
): Promise<Claim[]> {
  if (!summaryId) {
    throw new AppError('VALIDATION_ERROR', 'Summary ID is required to fetch claims')
  }
  const url = `/api/summaries/${summaryId}/claims?summaryType=${summaryType}&includeSubclaims=true`
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to fetch claims')
  }
  return response.json()
}

/**
 * Create a new claim
 */
async function createClaim(
  summaryId: string,
  claim: CreateClaimRequest
): Promise<Claim[]> {
  const response = await fetch(`/api/summaries/${summaryId}/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(claim),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to create claim')
  }
  const { claims } = await response.json()
  return claims
}

/**
 * Update an existing claim
 */
async function updateClaim(
  summaryId: string,
  claimId: string,
  updates: UpdateClaimRequest
): Promise<Claim[]> {
  const response = await fetch(`/api/summaries/${summaryId}/claims/${claimId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to update claim')
  }
  const { claims } = await response.json()
  return claims
}

/**
 * Delete a claim
 */
async function deleteClaim(summaryId: string, claimId: string): Promise<void> {
  const response = await fetch(`/api/summaries/${summaryId}/claims/${claimId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to delete claim')
  }
}

/**
 * Start claim extraction job
 */
async function extractClaims(
  summaryId: string,
  config: ClaimExtractionConfig
): Promise<ExtractClaimsResponse> {
  const response = await fetch(`/api/summaries/${summaryId}/claims/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(config),
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to start claim extraction')
  }
  return response.json()
}

/**
 * Check extraction job status
 */
async function checkExtractionJob(jobId: string): Promise<ClaimExtractionJobStatus> {
  const response = await fetch(`/api/jobs/claims/${jobId}`, { credentials: 'include' })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to check job status')
  }
  return response.json()
}

/**
 * Fetch relations for a claim
 */
async function fetchClaimRelations(
  summaryId: string,
  claimId: string
): Promise<ClaimRelationsResponse> {
  const response = await fetch(`/api/summaries/${summaryId}/claims/${claimId}/relations`, {
    credentials: 'include',
  })
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to fetch claim relations')
  }
  return response.json()
}

/**
 * Create a claim relation
 */
async function createClaimRelation(
  summaryId: string,
  sourceClaimId: string,
  relation: {
    targetClaimId: string
    relationTypeId: string
    sourceSpans?: Array<{ charStart: number; charEnd: number }>
    targetSpans?: Array<{ charStart: number; charEnd: number }>
    confidence?: number
    notes?: string
  }
): Promise<ClaimRelation> {
  const response = await fetch(
    `/api/summaries/${summaryId}/claims/${sourceClaimId}/relations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(relation),
    }
  )
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to create relation')
  }
  return response.json()
}

/**
 * Delete a claim relation
 */
async function deleteClaimRelation(
  summaryId: string,
  relationId: string
): Promise<void> {
  const response = await fetch(
    `/api/summaries/${summaryId}/claims/relations/${relationId}`,
    {
      method: 'DELETE',
      credentials: 'include',
    }
  )
  if (!response.ok) {
    throw await parseFetchError(response, 'Failed to delete relation')
  }
}

// ============= Hooks =============

/**
 * Hook to fetch claims for a summary
 */
export function useClaims(summaryId: string | undefined, summaryType: 'video' | 'collection' = 'video') {
  return useQuery({
    queryKey: summaryId ? claimsQueryKeys.bySummary(summaryId) : ['claims', 'disabled'],
    queryFn: async () => {
      if (!summaryId || summaryId.trim() === '') {
        throw new AppError('VALIDATION_ERROR', 'Summary ID is required to fetch claims')
      }
      return await fetchClaims(summaryId, summaryType)
    },
    enabled: !!summaryId && summaryId.trim() !== '',
    staleTime: 30000, // 30 seconds
    retry: (failureCount, error) => {
      // Don't retry validation errors (missing summaryId)
      if (error instanceof AppError && error.code === 'VALIDATION_ERROR') {
        return false
      }
      // Retry up to 2 times for network errors
      return failureCount < 2
    },
  })
}

/**
 * Hook to fetch relations for a claim
 */
export function useClaimRelations(summaryId: string, claimId: string) {
  return useQuery({
    queryKey: claimsQueryKeys.relations(summaryId, claimId),
    queryFn: () => fetchClaimRelations(summaryId, claimId),
    enabled: !!summaryId && !!claimId,
  })
}

/**
 * Hook to check extraction job status
 */
export function useExtractionJobStatus(jobId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: claimsQueryKeys.extractionJob(jobId || ''),
    queryFn: () => checkExtractionJob(jobId!),
    enabled: !!jobId && enabled,
    refetchInterval: (query) => {
      const data = query.state.data
      // Keep polling while job is in progress
      if (data?.status === 'processing' || data?.status === 'queued') {
        return 2000 // Poll every 2 seconds
      }
      return false // Stop polling when complete or failed
    },
  })
}

/**
 * Hook to create a claim
 */
export function useCreateClaim() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      summaryId,
      claim,
    }: {
      summaryId: string
      claim: CreateClaimRequest
    }) => createClaim(summaryId, claim),
    onSuccess: (claims, { summaryId }) => {
      // Update cache with returned claims
      queryClient.setQueryData(claimsQueryKeys.bySummary(summaryId), claims)
    },
    onError: (error, variables) => {
      logError(error as Error, undefined, {
        component: 'useCreateClaim',
        summaryId: variables.summaryId,
        claimText: variables.claim.text?.substring(0, 100), // First 100 chars for context
        parentClaimId: variables.claim.parentClaimId,
      })
    },
  })
}

/**
 * Hook to update a claim
 */
export function useUpdateClaim() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      summaryId,
      claimId,
      updates,
    }: {
      summaryId: string
      claimId: string
      updates: UpdateClaimRequest
    }) => updateClaim(summaryId, claimId, updates),
    onSuccess: (claims, { summaryId }) => {
      queryClient.setQueryData(claimsQueryKeys.bySummary(summaryId), claims)
    },
    onError: (error, variables) => {
      logError(error as Error, undefined, {
        component: 'useUpdateClaim',
        summaryId: variables.summaryId,
        claimId: variables.claimId,
        claimText: variables.updates.text?.substring(0, 100), // First 100 chars for context
      })
    },
  })
}

/**
 * Hook to delete a claim
 */
export function useDeleteClaim() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      summaryId,
      claimId,
    }: {
      summaryId: string
      claimId: string
    }) => deleteClaim(summaryId, claimId),
    onSuccess: (_, { summaryId }) => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey: claimsQueryKeys.bySummary(summaryId) })
    },
    onError: (error, variables) => {
      logError(error as Error, undefined, {
        component: 'useDeleteClaim',
        summaryId: variables.summaryId,
        claimId: variables.claimId,
      })
    },
  })
}

/**
 * Hook to start claim extraction
 */
export function useExtractClaims() {
  return useMutation({
    mutationFn: ({
      summaryId,
      config,
    }: {
      summaryId: string
      config: ClaimExtractionConfig
    }) => extractClaims(summaryId, config),
    onError: (error, variables) => {
      logError(error as Error, undefined, {
        component: 'useExtractClaims',
        summaryId: variables.summaryId,
        extractionStrategy: variables.config.extractionStrategy,
        maxClaims: variables.config.maxClaimsPerSummary,
      })
    },
  })
}

/**
 * Hook to create a claim relation
 */
export function useCreateClaimRelation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
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
    }) => createClaimRelation(summaryId, sourceClaimId, relation),
    onSuccess: (_, { summaryId, sourceClaimId }) => {
      // Invalidate relations cache for this claim
      queryClient.invalidateQueries({
        queryKey: claimsQueryKeys.relations(summaryId, sourceClaimId),
      })
    },
  })
}

/**
 * Hook to delete a claim relation
 */
export function useDeleteClaimRelation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      summaryId,
      relationId,
    }: {
      summaryId: string
      relationId: string
      sourceClaimId: string // For cache invalidation
    }) => deleteClaimRelation(summaryId, relationId),
    onSuccess: (_, { summaryId, sourceClaimId }) => {
      queryClient.invalidateQueries({
        queryKey: claimsQueryKeys.relations(summaryId, sourceClaimId),
      })
    },
  })
}
