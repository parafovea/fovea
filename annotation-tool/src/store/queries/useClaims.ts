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
} from '../../models/types'

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
  const response = await fetch(
    `/api/summaries/${summaryId}/claims?summaryType=${summaryType}&includeSubclaims=true`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch claims')
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
    body: JSON.stringify(claim),
  })
  if (!response.ok) {
    throw new Error('Failed to create claim')
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
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    throw new Error('Failed to update claim')
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
  })
  if (!response.ok) {
    throw new Error('Failed to delete claim')
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
    body: JSON.stringify(config),
  })
  if (!response.ok) {
    throw new Error('Failed to start claim extraction')
  }
  return response.json()
}

/**
 * Check extraction job status
 */
async function checkExtractionJob(jobId: string): Promise<ClaimExtractionJobStatus> {
  const response = await fetch(`/api/jobs/claims/${jobId}`)
  if (!response.ok) {
    throw new Error('Failed to check job status')
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
  const response = await fetch(`/api/summaries/${summaryId}/claims/${claimId}/relations`)
  if (!response.ok) {
    throw new Error('Failed to fetch claim relations')
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
      body: JSON.stringify(relation),
    }
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create relation')
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
    }
  )
  if (!response.ok) {
    throw new Error('Failed to delete relation')
  }
}

// ============= Hooks =============

/**
 * Hook to fetch claims for a summary
 */
export function useClaims(summaryId: string | undefined, summaryType: 'video' | 'collection' = 'video') {
  return useQuery({
    queryKey: claimsQueryKeys.bySummary(summaryId || ''),
    queryFn: () => fetchClaims(summaryId!, summaryType),
    enabled: !!summaryId,
    staleTime: 30000, // 30 seconds
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
