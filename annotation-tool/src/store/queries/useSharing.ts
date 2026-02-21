/**
 * TanStack Query hooks for sharing operations.
 *
 * Provides hooks for viewing received and sent shares, creating new shares,
 * revoking shares, and forking shared resources.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

/** Query key factory for sharing. */
export const sharingKeys = {
  all: ['sharing'] as const,
  received: () => [...sharingKeys.all, 'received'] as const,
  sent: () => [...sharingKeys.all, 'sent'] as const,
}

// ============= Fetch Functions =============

async function fetchReceivedShares() {
  const response = await fetch('/api/sharing/received', { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch received shares')
  }
  return response.json()
}

async function fetchSentShares() {
  const response = await fetch('/api/sharing/sent', { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch sent shares')
  }
  return response.json()
}

// ============= Query Hooks =============

/**
 * Hook to fetch shares received by the current user.
 *
 * @returns TanStack Query result with received shares array
 *
 * @example
 * ```typescript
 * const { data: shares, isLoading } = useReceivedShares()
 * ```
 */
export function useReceivedShares() {
  return useQuery({
    queryKey: sharingKeys.received(),
    queryFn: fetchReceivedShares,
    staleTime: 60 * 1000, // 1 minute
  })
}

/**
 * Hook to fetch shares sent by the current user.
 *
 * @returns TanStack Query result with sent shares array
 */
export function useSentShares() {
  return useQuery({
    queryKey: sharingKeys.sent(),
    queryFn: fetchSentShares,
    staleTime: 60 * 1000,
  })
}

// ============= Mutation Hooks =============

/**
 * Hook to share a resource with another user or group.
 * Invalidates both sent and received share caches on success.
 *
 * @example
 * ```typescript
 * const { mutate: share } = useShareResource()
 * share({ resourceType: 'Video', resourceId: videoId, targetUserId: userId, permission: 'read' })
 * ```
 */
export function useShareResource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      resourceType: string
      resourceId: string
      targetUserId?: string
      targetGroupId?: string
      permission: string
    }) => {
      const response = await fetch('/api/sharing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to share resource')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharingKeys.sent() })
      queryClient.invalidateQueries({ queryKey: sharingKeys.received() })
    },
  })
}

/**
 * Hook to revoke an existing share.
 * Invalidates both sent and received share caches on success.
 */
export function useRevokeShare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (shareId: string) => {
      const response = await fetch(`/api/sharing/${shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to revoke share')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharingKeys.sent() })
      queryClient.invalidateQueries({ queryKey: sharingKeys.received() })
    },
  })
}

/**
 * Hook to fork a shared resource, creating a personal copy.
 * Invalidates received shares on success.
 */
export function useForkShare() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (shareId: string) => {
      const response = await fetch(`/api/sharing/${shareId}/fork`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to fork shared resource')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharingKeys.received() })
    },
  })
}
