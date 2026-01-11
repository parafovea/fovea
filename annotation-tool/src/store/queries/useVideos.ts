/**
 * TanStack Query hooks for video operations.
 * Provides declarative data fetching with automatic caching and refetching.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { VideoMetadata } from '@models/types'

/** Query key factory for videos */
export const videoKeys = {
  all: ['videos'] as const,
  lists: () => [...videoKeys.all, 'list'] as const,
  list: (filters: { searchTerm?: string; tags?: string[] }) =>
    [...videoKeys.lists(), filters] as const,
  details: () => [...videoKeys.all, 'detail'] as const,
  detail: (videoId: string) => [...videoKeys.details(), videoId] as const,
}

/**
 * Fetch all videos from the backend.
 */
async function fetchVideos(): Promise<VideoMetadata[]> {
  const response = await fetch('/api/videos')
  if (!response.ok) {
    throw new Error('Failed to fetch videos')
  }
  return response.json()
}

/**
 * Fetch a single video by ID.
 */
async function fetchVideo(videoId: string): Promise<VideoMetadata> {
  const response = await fetch(`/api/videos/${videoId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch video')
  }
  return response.json()
}

/**
 * Delete a video by ID.
 */
async function deleteVideo(videoId: string): Promise<void> {
  const response = await fetch(`/api/videos/${videoId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete video')
  }
}

// ============= Hooks =============

/**
 * Hook to fetch all videos.
 * Returns cached data while revalidating in the background.
 *
 * @example
 * ```typescript
 * const { data: videos, isLoading, error } = useVideos()
 * ```
 */
export function useVideos() {
  return useQuery({
    queryKey: videoKeys.lists(),
    queryFn: fetchVideos,
    staleTime: 30000, // 30 seconds
  })
}

/**
 * Hook to fetch a single video by ID.
 * Useful for detail views or when loading a video for annotation.
 *
 * @param videoId - The ID of the video to fetch
 * @param options - Additional query options
 *
 * @example
 * ```typescript
 * const { data: video, isLoading } = useVideo(videoId)
 * ```
 */
export function useVideo(videoId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: videoKeys.detail(videoId || ''),
    queryFn: () => fetchVideo(videoId!),
    enabled: !!videoId && (options?.enabled ?? true),
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to delete a video.
 * Invalidates the videos list cache on success.
 *
 * @example
 * ```typescript
 * const { mutate: deleteVideo, isPending } = useDeleteVideo()
 * deleteVideo(videoId, {
 *   onSuccess: () => console.log('Deleted'),
 * })
 * ```
 */
export function useDeleteVideo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteVideo,
    onSuccess: (_, videoId) => {
      // Remove the specific video from cache
      queryClient.removeQueries({ queryKey: videoKeys.detail(videoId) })
      // Invalidate the list to refetch
      queryClient.invalidateQueries({ queryKey: videoKeys.lists() })
    },
  })
}

/**
 * Hook to prefetch a video into the cache.
 * Useful for hovering over video cards to preload data.
 *
 * @example
 * ```typescript
 * const prefetch = usePrefetchVideo()
 * onMouseEnter={() => prefetch(video.id)}
 * ```
 */
export function usePrefetchVideo() {
  const queryClient = useQueryClient()

  return (videoId: string) => {
    queryClient.prefetchQuery({
      queryKey: videoKeys.detail(videoId),
      queryFn: () => fetchVideo(videoId),
      staleTime: 60000,
    })
  }
}
