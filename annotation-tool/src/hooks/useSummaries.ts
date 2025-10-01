/**
 * TanStack Query hooks for video summary operations.
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
  VideoSummary,
  GenerateSummaryRequest,
  GenerateSummaryResponse,
  ApiError,
} from '../api/client'

/**
 * Query key factory for video summaries.
 * Provides consistent cache keys across the application.
 */
export const summaryKeys = {
  all: ['summaries'] as const,
  videos: () => [...summaryKeys.all, 'videos'] as const,
  video: (videoId: string) => [...summaryKeys.videos(), videoId] as const,
  summary: (videoId: string, personaId: string) =>
    [...summaryKeys.video(videoId), personaId] as const,
}

/**
 * Fetch all summaries for a video.
 * Data is cached and automatically refetched when stale.
 *
 * @param videoId - Video identifier
 * @param options - TanStack Query options
 * @returns Query result with summaries data
 */
export function useVideoSummaries(
  videoId: string,
  options?: Omit<
    UseQueryOptions<VideoSummary[], ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<VideoSummary[], ApiError>({
    queryKey: summaryKeys.video(videoId),
    queryFn: () => apiClient.getVideoSummaries(videoId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Fetch a specific summary for a video and persona.
 * Returns null if the summary does not exist.
 *
 * @param videoId - Video identifier
 * @param personaId - Persona identifier
 * @param options - TanStack Query options
 * @returns Query result with summary data or null
 */
export function useVideoSummary(
  videoId: string,
  personaId: string,
  options?: Omit<
    UseQueryOptions<VideoSummary | null, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<VideoSummary | null, ApiError>({
    queryKey: summaryKeys.summary(videoId, personaId),
    queryFn: () => apiClient.getVideoSummary(videoId, personaId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Mutation hook for generating a video summary.
 * Queues a background job and invalidates relevant queries on success.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with generate function
 */
export function useGenerateSummary(
  options?: UseMutationOptions<
    GenerateSummaryResponse,
    ApiError,
    GenerateSummaryRequest
  >
) {
  const queryClient = useQueryClient()

  return useMutation<GenerateSummaryResponse, ApiError, GenerateSummaryRequest>({
    mutationFn: (request) => apiClient.generateSummary(request),
    onSuccess: (data, variables) => {
      // Invalidate the specific summary query so it refetches when job completes
      queryClient.invalidateQueries({
        queryKey: summaryKeys.summary(variables.videoId, variables.personaId),
      })
      // Also invalidate the video summaries list
      queryClient.invalidateQueries({
        queryKey: summaryKeys.video(variables.videoId),
      })
    },
    ...options,
  })
}

/**
 * Mutation hook for saving a summary directly.
 * Optimistically updates the cache before server confirmation.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with save function
 */
export function useSaveSummary(
  options?: UseMutationOptions<
    VideoSummary,
    ApiError,
    Omit<VideoSummary, 'id' | 'createdAt' | 'updatedAt'>
  >
) {
  const queryClient = useQueryClient()

  return useMutation<
    VideoSummary,
    ApiError,
    Omit<VideoSummary, 'id' | 'createdAt' | 'updatedAt'>
  >({
    mutationFn: (summary) => apiClient.saveSummary(summary),
    onSuccess: (data) => {
      // Update the specific summary in cache
      queryClient.setQueryData(
        summaryKeys.summary(data.videoId, data.personaId),
        data
      )
      // Invalidate the video summaries list to refetch
      queryClient.invalidateQueries({
        queryKey: summaryKeys.video(data.videoId),
      })
    },
    ...options,
  })
}

/**
 * Mutation hook for deleting a summary.
 * Removes the summary from cache on success.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with delete function
 */
export function useDeleteSummary(
  options?: UseMutationOptions<
    void,
    ApiError,
    { videoId: string; personaId: string }
  >
) {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, { videoId: string; personaId: string }>({
    mutationFn: ({ videoId, personaId }) =>
      apiClient.deleteSummary(videoId, personaId),
    onSuccess: (_, variables) => {
      // Remove the specific summary from cache
      queryClient.removeQueries({
        queryKey: summaryKeys.summary(variables.videoId, variables.personaId),
      })
      // Invalidate the video summaries list to refetch
      queryClient.invalidateQueries({
        queryKey: summaryKeys.video(variables.videoId),
      })
    },
    ...options,
  })
}
