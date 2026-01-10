/**
 * TanStack Query hooks for admin session management operations.
 * Provides declarative data fetching with automatic caching and refetching.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query'

/**
 * API error response.
 */
export interface ApiError {
  message: string
  statusCode?: number
}

/**
 * Session data with user information.
 */
export interface Session {
  id: string
  userId: string
  username: string
  displayName: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
  expiresAt: string
}

/**
 * Query key factory for sessions.
 * Provides consistent cache keys across the application.
 */
export const sessionKeys = {
  all: ['admin', 'sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: () => [...sessionKeys.lists()] as const,
}

/**
 * Fetch all active sessions.
 * Data is cached and automatically refetched every 30 seconds.
 *
 * @param options - TanStack Query options
 * @returns Query result with sessions data
 */
export function useSessions(
  options?: Omit<UseQueryOptions<Session[], ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<Session[], ApiError>({
    queryKey: sessionKeys.list(),
    queryFn: async () => {
      const response = await fetch('/api/admin/sessions', { credentials: 'include' })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to fetch sessions', statusCode: response.status }
      }
      return response.json()
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
    ...options,
  })
}

/**
 * Mutation hook for revoking a session.
 * Invalidates session list on success.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with revoke function
 */
export function useRevokeSession(
  options?: UseMutationOptions<void, ApiError, string>
) {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: async (sessionId) => {
      const response = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to revoke session', statusCode: response.status }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() })
    },
    ...options,
  })
}
