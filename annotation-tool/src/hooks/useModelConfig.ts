/**
 * TanStack Query hooks for model configuration operations.
 * Provides declarative data fetching with automatic caching and refetching.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query'
import {
  apiClient,
  ModelConfig,
  SelectModelRequest,
  SelectModelResponse,
  MemoryValidation,
  ApiError,
} from '../api/client'

/**
 * Query key factory for model configuration.
 * Provides consistent cache keys across the application.
 */
export const modelConfigKeys = {
  all: ['modelConfig'] as const,
  config: () => [...modelConfigKeys.all, 'config'] as const,
  validation: () => [...modelConfigKeys.all, 'validation'] as const,
}

/**
 * Fetch current model configuration for all task types.
 * Data is cached and automatically refetched when stale.
 *
 * @param options - TanStack Query options
 * @returns Query result with model configuration data
 */
export function useModelConfig(
  options?: Omit<
    UseQueryOptions<ModelConfig, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<ModelConfig, ApiError>({
    queryKey: modelConfigKeys.config(),
    queryFn: () => apiClient.getModelConfig(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Mutation hook for selecting a model for a task type.
 * Invalidates model configuration query on success to trigger refetch.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with selectModel function
 *
 * @example
 * ```tsx
 * const selectMutation = useSelectModel({
 *   onSuccess: () => {
 *     console.log('Model selected successfully')
 *   }
 * })
 *
 * // Select a model
 * selectMutation.mutate({
 *   task_type: 'video_summarization',
 *   model_name: 'llama-4-maverick'
 * })
 * ```
 */
export function useSelectModel(
  options?: UseMutationOptions<
    SelectModelResponse,
    ApiError,
    SelectModelRequest
  >
) {
  const queryClient = useQueryClient()

  return useMutation<SelectModelResponse, ApiError, SelectModelRequest>({
    mutationFn: (request) => apiClient.selectModel(request),
    onSuccess: (data, variables, context) => {
      // Invalidate config to refetch with new selection
      queryClient.invalidateQueries({
        queryKey: modelConfigKeys.config(),
      })
      // Also invalidate validation since requirements may have changed
      queryClient.invalidateQueries({
        queryKey: modelConfigKeys.validation(),
      })
      // Call user-provided onSuccess if exists
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/**
 * Fetch memory validation for currently selected models.
 * Validates that all selected models fit within available VRAM budget.
 *
 * @param options - TanStack Query options
 * @returns Query result with memory validation data
 */
export function useMemoryValidation(
  options?: Omit<
    UseQueryOptions<MemoryValidation, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<MemoryValidation, ApiError>({
    queryKey: modelConfigKeys.validation(),
    queryFn: () => apiClient.validateMemoryBudget(),
    staleTime: 30 * 1000, // 30 seconds (more frequent since memory is dynamic)
    ...options,
  })
}
