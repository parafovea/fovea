/**
 * TanStack Query hooks for admin-only SystemConfig CRUD.
 *
 * Only usable by admins; the underlying REST endpoints enforce this with
 * ``requireAdmin`` middleware. Non-admin callers will get a 403 that the
 * query surfaces as an ApiError.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query'
import {
  apiClient,
  ApiError,
  SystemConfigListResponse,
  SystemConfigRow,
  SystemConfigRowStored,
} from '@api/client'

export const systemConfigKeys = {
  all: ['systemConfig'] as const,
  list: () => [...systemConfigKeys.all, 'list'] as const,
}

/**
 * Fetch the full SystemConfig row set. The response materializes defaults
 * for any key the DB hasn't stored yet so the UI never has to distinguish
 * "unset" from "default".
 */
export function useSystemConfig(
  options?: Omit<UseQueryOptions<SystemConfigListResponse, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<SystemConfigListResponse, ApiError>({
    queryKey: systemConfigKeys.list(),
    queryFn: () => apiClient.listSystemConfig(),
    staleTime: 60 * 1000,
    ...options,
  })
}

/**
 * Upsert a SystemConfig row. The server pushes the change to the
 * model-service before returning; the mutation optimistically updates the
 * cache and rolls back on error.
 */
export function useUpdateSystemConfig(
  options?: UseMutationOptions<SystemConfigRowStored, ApiError, SystemConfigRow>
) {
  const queryClient = useQueryClient()
  return useMutation<SystemConfigRowStored, ApiError, SystemConfigRow>({
    mutationFn: (row) => apiClient.updateSystemConfig(row),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: systemConfigKeys.list() })
    },
    ...options,
  })
}

/** Manual replay action for re-pushing every stored row to the model-service. */
export function useReplaySystemConfig(
  options?: UseMutationOptions<{ replayed: string[] }, ApiError, void>
) {
  return useMutation<{ replayed: string[] }, ApiError, void>({
    mutationFn: () => apiClient.replaySystemConfig(),
    ...options,
  })
}
