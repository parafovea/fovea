/**
 * TanStack Query hooks for API key management operations.
 * Provides declarative data fetching with automatic caching and refetching.
 * API keys are user-scoped, not persona-scoped.
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
 * API key provider type.
 */
export type ApiKeyProvider = 'anthropic' | 'openai' | 'google'

/**
 * API key data.
 */
export interface ApiKey {
  id: string
  userId: string
  provider: ApiKeyProvider
  keyName: string
  keyMask: string
  isActive: boolean
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
  isAdminKey?: boolean
}

/**
 * Request type for creating an API key.
 */
export interface CreateApiKeyRequest {
  provider: ApiKeyProvider
  keyName: string
  apiKey: string
}

/**
 * Request type for updating an API key.
 */
export interface UpdateApiKeyRequest {
  keyName?: string
  apiKey?: string
  isActive?: boolean
}

/**
 * Query key factory for API keys.
 * Provides consistent cache keys across the application.
 */
export const apiKeyKeys = {
  all: ['api-keys'] as const,
  lists: () => [...apiKeyKeys.all, 'list'] as const,
  list: () => [...apiKeyKeys.lists()] as const,
  adminKeys: () => [...apiKeyKeys.all, 'admin'] as const,
}

/**
 * Fetch user API keys.
 * Data is cached and automatically refetched when stale.
 *
 * @param options - TanStack Query options
 * @returns Query result with API keys data
 */
export function useApiKeys(
  options?: Omit<UseQueryOptions<ApiKey[], ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<ApiKey[], ApiError>({
    queryKey: apiKeyKeys.list(),
    queryFn: async () => {
      const response = await fetch('/api/api-keys', { credentials: 'include' })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to fetch API keys', statusCode: response.status }
      }
      return response.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Fetch admin API keys.
 * Only available to admin users.
 * Returns keys marked as admin keys that are inherited by all users.
 *
 * @param options - TanStack Query options
 * @returns Query result with admin API keys data
 */
export function useAdminApiKeys(
  options?: Omit<UseQueryOptions<ApiKey[], ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<ApiKey[], ApiError>({
    queryKey: apiKeyKeys.adminKeys(),
    queryFn: async () => {
      const response = await fetch('/api/admin/api-keys', { credentials: 'include' })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to fetch admin API keys', statusCode: response.status }
      }
      const keys = await response.json()
      return keys.map((key: ApiKey) => ({ ...key, isAdminKey: true }))
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Fetch all API keys (user keys + admin keys).
 * Combines user-specific keys with inherited admin keys.
 *
 * @param isAdmin - Whether current user is admin
 * @returns Combined query result with all API keys
 */
export function useAllApiKeys(isAdmin: boolean) {
  const userKeys = useApiKeys()
  const adminKeys = useAdminApiKeys({ enabled: isAdmin })

  return {
    data: [
      ...(userKeys.data || []),
      ...(isAdmin ? (adminKeys.data || []) : []),
    ],
    isLoading: userKeys.isLoading || (isAdmin && adminKeys.isLoading),
    error: userKeys.error || adminKeys.error,
    refetch: () => {
      userKeys.refetch()
      if (isAdmin) {
        adminKeys.refetch()
      }
    },
  }
}

/**
 * Mutation hook for creating an API key.
 * Invalidates API key list on success.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with create function
 */
export function useCreateApiKey(
  options?: UseMutationOptions<ApiKey, ApiError, CreateApiKeyRequest>
) {
  const queryClient = useQueryClient()

  return useMutation<ApiKey, ApiError, CreateApiKeyRequest>({
    mutationFn: async (request) => {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to create API key', statusCode: response.status }
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists() })
    },
    ...options,
  })
}

/**
 * Mutation hook for updating an API key.
 * Invalidates API key list on success.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with update function
 */
export function useUpdateApiKey(
  options?: UseMutationOptions<ApiKey, ApiError, { keyId: string; data: UpdateApiKeyRequest }>
) {
  const queryClient = useQueryClient()

  return useMutation<ApiKey, ApiError, { keyId: string; data: UpdateApiKeyRequest }>({
    mutationFn: async ({ keyId, data }) => {
      const response = await fetch(`/api/api-keys/${keyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to update API key', statusCode: response.status }
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists() })
    },
    ...options,
  })
}

/**
 * Mutation hook for deleting an API key.
 * Invalidates API key list on success.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with delete function
 */
export function useDeleteApiKey(
  options?: UseMutationOptions<void, ApiError, string>
) {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: async (keyId) => {
      const response = await fetch(`/api/api-keys/${keyId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw { message: error.message || 'Failed to delete API key', statusCode: response.status }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists() })
    },
    ...options,
  })
}
