/**
 * TanStack Query hooks for annotation operations.
 * Provides declarative data fetching with automatic caching and refetching.
 *
 * Annotations are video-specific bounding box annotations with semantic links
 * to personas, entities, events, and other world objects.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Annotation } from '../../models/types'
import { api } from '../../services/api'
import { generateId } from '../../utils/uuid'

/** Query keys for annotations */
export const annotationKeys = {
  all: ['annotations'] as const,
  video: (videoId: string) => [...annotationKeys.all, videoId] as const,
}

/**
 * Fetch annotations for a video from the API.
 */
async function fetchAnnotations(videoId: string): Promise<Annotation[]> {
  return api.getAnnotations(videoId)
}

/**
 * Hook to fetch annotations for a video.
 *
 * @param videoId - The video ID to fetch annotations for
 * @returns TanStack Query result with annotations array
 *
 * @example
 * ```tsx
 * const { data: annotations, isLoading } = useAnnotations(videoId)
 * ```
 */
export function useAnnotations(videoId: string | null | undefined) {
  return useQuery({
    queryKey: annotationKeys.video(videoId ?? ''),
    queryFn: () => fetchAnnotations(videoId!),
    enabled: !!videoId,
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
  })
}

/**
 * Hook to add a new annotation.
 *
 * @returns Mutation for adding annotation
 *
 * @example
 * ```tsx
 * const { mutate: addAnnotation } = useAddAnnotation()
 * addAnnotation(newAnnotation)
 * ```
 */
export function useAddAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    // Use partial types to allow both ObjectAnnotation and TypeAnnotation inputs
    mutationFn: async (annotationData: Partial<Annotation> & Pick<Annotation, 'videoId' | 'annotationType' | 'boundingBoxSequence'>) => {
      const annotation: Annotation = {
        ...annotationData,
        id: (annotationData as { id?: string }).id ?? generateId(),
      } as Annotation

      // Save to server
      const savedAnnotation = await api.saveAnnotation(annotation)
      return savedAnnotation
    },
    onSuccess: (savedAnnotation) => {
      const videoId = savedAnnotation.videoId
      // Update cache
      queryClient.setQueryData<Annotation[]>(
        annotationKeys.video(videoId),
        (old = []) => [...old, savedAnnotation]
      )
    },
  })
}

/**
 * Hook to update an existing annotation.
 *
 * @returns Mutation for updating annotation
 *
 * @example
 * ```tsx
 * const { mutate: updateAnnotation } = useUpdateAnnotation()
 * updateAnnotation(updatedAnnotation)
 * ```
 */
export function useUpdateAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (annotation: Annotation) => {
      await api.updateAnnotation(annotation)
      return annotation
    },
    onSuccess: (annotation) => {
      const videoId = annotation.videoId
      // Update cache
      queryClient.setQueryData<Annotation[]>(
        annotationKeys.video(videoId),
        (old = []) => old.map(a => a.id === annotation.id ? annotation : a)
      )
    },
  })
}

/**
 * Hook to delete an annotation.
 *
 * @returns Mutation for deleting annotation
 *
 * @example
 * ```tsx
 * const { mutate: deleteAnnotation } = useDeleteAnnotation()
 * deleteAnnotation({ videoId, annotationId })
 * ```
 */
export function useDeleteAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ videoId, annotationId }: { videoId: string; annotationId: string }) => {
      await api.deleteAnnotation(videoId, annotationId)
      return { videoId, annotationId }
    },
    onSuccess: ({ videoId, annotationId }) => {
      // Update cache
      queryClient.setQueryData<Annotation[]>(
        annotationKeys.video(videoId),
        (old = []) => old.filter(a => a.id !== annotationId)
      )
    },
  })
}

/**
 * Hook to save multiple annotations at once (batch save).
 * Handles distinguishing between create and update operations.
 *
 * @returns Mutation for batch saving annotations
 *
 * @example
 * ```tsx
 * const { mutate: saveAnnotations } = useSaveAnnotations()
 * saveAnnotations({ videoId, annotations })
 * ```
 */
export function useSaveAnnotations() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ videoId, annotations }: { videoId: string; annotations: Annotation[] }) => {
      // Get currently cached annotations to determine which are new vs existing
      const cached = queryClient.getQueryData<Annotation[]>(annotationKeys.video(videoId)) ?? []
      const cachedIds = new Set(cached.map(a => a.id))

      const results: { created: number; updated: number; errors: string[] } = {
        created: 0,
        updated: 0,
        errors: [],
      }

      for (const annotation of annotations) {
        try {
          const isNew = !cachedIds.has(annotation.id)

          if (isNew) {
            await api.saveAnnotation(annotation)
            results.created++
          } else {
            await api.updateAnnotation(annotation)
            results.updated++
          }
        } catch (error) {
          results.errors.push(
            `Failed to save annotation ${annotation.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
      }

      return { videoId, annotations, results }
    },
    onSuccess: ({ videoId, annotations }) => {
      // Update cache with saved annotations
      queryClient.setQueryData<Annotation[]>(annotationKeys.video(videoId), annotations)
    },
  })
}

/**
 * Hook to invalidate annotation cache, forcing refetch.
 *
 * @returns Function to invalidate annotations
 *
 * @example
 * ```tsx
 * const invalidate = useInvalidateAnnotations()
 * invalidate(videoId)
 * ```
 */
export function useInvalidateAnnotations() {
  const queryClient = useQueryClient()

  return (videoId?: string) => {
    if (videoId) {
      queryClient.invalidateQueries({ queryKey: annotationKeys.video(videoId) })
    } else {
      queryClient.invalidateQueries({ queryKey: annotationKeys.all })
    }
  }
}

/**
 * Hook to set annotations directly in cache (for optimistic updates).
 *
 * @returns Function to set annotations in cache
 *
 * @example
 * ```tsx
 * const setAnnotations = useSetAnnotations()
 * setAnnotations(videoId, annotations)
 * ```
 */
export function useSetAnnotations() {
  const queryClient = useQueryClient()

  return (videoId: string, annotations: Annotation[]) => {
    queryClient.setQueryData(annotationKeys.video(videoId), annotations)
  }
}
