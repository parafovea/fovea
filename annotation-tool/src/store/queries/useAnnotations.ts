/**
 * TanStack Query hooks for annotation operations.
 * Provides declarative data fetching with automatic caching and refetching.
 *
 * Annotations are video-specific bounding box annotations with semantic links
 * to personas, entities, events, and other world objects.
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import { Annotation, BoundingBox, InterpolationType, InterpolationSegment } from '@models/types'
import { api, transformFrontendToBackend } from '@services/api'
import { generateId } from '@utils/uuid'
import { BoundingBoxInterpolator } from '@utils/interpolation'

// Shared interpolator instance
const interpolator = new BoundingBoxInterpolator()

/**
 * Surface an annotation write failure to the user via a toast.
 *
 * Extracts the backend-provided message from an axios error when present,
 * falling back to the error's own message and finally a generic string.
 */
function notifyAnnotationWriteError(error: unknown): void {
  const message = axios.isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? error.message)
    : error instanceof Error
      ? error.message
      : 'Failed to save annotation'
  toast.error(message)
}

/** Query keys for annotations */
export const annotationKeys = {
  all: ['annotations'] as const,
  video: (videoId: string) => [...annotationKeys.all, videoId] as const,
}

// Baselines live as long as their query. Cache eviction or logout releases the
// query and its snapshots without retaining another user's annotation content.
const persistedSnapshots = new WeakMap<object, Map<string, string>>()

/** Returns the last acknowledged wire values for this video's cached query. */
function snapshotsFor(client: QueryClient, videoId: string): Map<string, string> | undefined {
  const query = client.getQueryCache().find({ queryKey: annotationKeys.video(videoId), exact: true })
  if (!query) return undefined
  let snapshots = persistedSnapshots.get(query)
  if (!snapshots) {
    snapshots = new Map()
    persistedSnapshots.set(query, snapshots)
  }
  return snapshots
}

/** Compares only fields that the annotation API persists. */
function wireSnapshot(annotation: Annotation): string {
  return JSON.stringify(transformFrontendToBackend(annotation))
}

/**
 * Fetch annotations for a video from the API.
 */
async function fetchAnnotations(client: QueryClient, videoId: string): Promise<Annotation[]> {
  const annotations = await api.getAnnotations(videoId)
  const snapshots = snapshotsFor(client, videoId)
  snapshots?.clear()
  for (const annotation of annotations) snapshots?.set(annotation.id, wireSnapshot(annotation))
  return annotations
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
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: annotationKeys.video(videoId ?? ''),
    queryFn: () => fetchAnnotations(queryClient, videoId!),
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
      snapshotsFor(queryClient, videoId)?.set(savedAnnotation.id, wireSnapshot(savedAnnotation))
    },
    onError: notifyAnnotationWriteError,
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
      snapshotsFor(queryClient, videoId)?.set(annotation.id, wireSnapshot(annotation))
    },
    onError: notifyAnnotationWriteError,
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
      snapshotsFor(queryClient, videoId)?.delete(annotationId)
    },
    onError: notifyAnnotationWriteError,
  })
}

/**
 * Hook to save multiple annotations at once (batch save).
 * Handles distinguishing between create and update operations.
 *
 * Persists the snapshot already held by the editor. Retries never write that
 * snapshot back into the cache, which may contain newer local edits.
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
    mutationFn: async ({ videoId, annotations }: {
      videoId: string
      annotations: Annotation[]
    }) => {
      // Cache reads are local to this invocation, including overlapping saves.
      const cached = queryClient.getQueryData<Annotation[]>(annotationKeys.video(videoId))
      const existingIds = new Set((cached ?? []).map(annotation => annotation.id))
      const snapshots = snapshotsFor(queryClient, videoId)

      const results: { created: number; updated: number; errors: string[] } = {
        created: 0,
        updated: 0,
        errors: [],
      }

      for (const annotation of annotations) {
        try {
          const snapshot = wireSnapshot(annotation)
          // A readable project annotation need not be writable. Persist only
          // local edits, preserving other annotators' unchanged rows.
          if (snapshots?.get(annotation.id) === snapshot) continue
          const isNew = !existingIds.has(annotation.id)

          if (isNew) {
            await api.saveAnnotation(annotation)
            results.created++
          } else {
            await api.updateAnnotation(annotation)
            results.updated++
          }
          snapshots?.set(annotation.id, snapshot)
        } catch (error) {
          results.errors.push(
            `Failed to save annotation ${annotation.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
      }

      if (results.errors.length > 0) throw new Error(results.errors.join('; '))
      return { videoId, annotations, results }
    },
    onMutate: async ({ videoId }) => {
      await queryClient.cancelQueries({ queryKey: annotationKeys.video(videoId) })
    },
    // Keep local edits while saves settle. A refetch or rollback here can erase
    // changes made during the request; auto-save retries the retained snapshot.
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

// ============= Keyframe Manipulation Hooks =============

/**
 * Hook for adding a keyframe to an annotation.
 * Updates the cache optimistically (no server call).
 *
 * @returns Function that adds the keyframe and returns the updated annotations
 *   array (the same value written to the cache). Callers persist that array
 *   directly so the save does not depend on the cache update propagating
 *   through a render first.
 */
export function useAddKeyframe() {
  const queryClient = useQueryClient()

  return useCallback((params: {
    videoId: string
    annotationId: string
    frameNumber: number
    box: BoundingBox
    fps?: number
  }): Annotation[] => {
    const { videoId, annotationId, frameNumber, box } = params

    const updated = (queryClient.getQueryData<Annotation[]>(annotationKeys.video(videoId)) ?? []).map(annotation => {
      if (annotation.id !== annotationId) return annotation

      const updatedSequence = interpolator.addKeyframe(
        annotation.boundingBoxSequence,
        frameNumber
      )

      // Update the new keyframe with provided box data
      const keyframeIndex = updatedSequence.boxes.findIndex(b => b.frameNumber === frameNumber)
      if (keyframeIndex !== -1) {
        updatedSequence.boxes[keyframeIndex] = {
          ...updatedSequence.boxes[keyframeIndex],
          ...box,
          frameNumber,
          isKeyframe: true,
        }
      }

      return { ...annotation, boundingBoxSequence: updatedSequence }
    })

    queryClient.setQueryData<Annotation[]>(annotationKeys.video(videoId), updated)
    return updated
  }, [queryClient])
}

/**
 * Hook for removing a keyframe from an annotation.
 * Updates the cache optimistically (no server call).
 *
 * @returns Function that removes the keyframe and returns the updated
 *   annotations array (the same value written to the cache).
 */
export function useRemoveKeyframe() {
  const queryClient = useQueryClient()

  return useCallback((params: {
    videoId: string
    annotationId: string
    frameNumber: number
    fps?: number
  }): Annotation[] => {
    const { videoId, annotationId, frameNumber } = params

    const updated = (queryClient.getQueryData<Annotation[]>(annotationKeys.video(videoId)) ?? []).map(annotation => {
      if (annotation.id !== annotationId) return annotation

      const updatedSequence = interpolator.removeKeyframe(
        annotation.boundingBoxSequence,
        frameNumber
      )

      return { ...annotation, boundingBoxSequence: updatedSequence }
    })

    queryClient.setQueryData<Annotation[]>(annotationKeys.video(videoId), updated)
    return updated
  }, [queryClient])
}

/**
 * Hook for updating a keyframe's bounding box.
 * Updates the cache optimistically (no server call).
 *
 * @returns Function that updates the keyframe and returns the updated
 *   annotations array (the same value written to the cache).
 */
export function useUpdateKeyframe() {
  const queryClient = useQueryClient()

  return useCallback((params: {
    videoId: string
    annotationId: string
    frameNumber: number
    box: Partial<BoundingBox>
  }): Annotation[] => {
    const { videoId, annotationId, frameNumber, box } = params

    const updated = (queryClient.getQueryData<Annotation[]>(annotationKeys.video(videoId)) ?? []).map(annotation => {
      if (annotation.id !== annotationId) return annotation

      const updatedSequence = interpolator.updateKeyframe(
        annotation.boundingBoxSequence,
        frameNumber,
        box
      )

      return { ...annotation, boundingBoxSequence: updatedSequence }
    })

    queryClient.setQueryData<Annotation[]>(annotationKeys.video(videoId), updated)
    return updated
  }, [queryClient])
}

/**
 * Hook for moving a keyframe to a new frame number.
 * Updates the cache optimistically (no server call).
 *
 * @returns Function that moves the keyframe and returns the updated
 *   annotations array (the same value written to the cache).
 */
export function useMoveKeyframe() {
  const queryClient = useQueryClient()

  return useCallback((params: {
    videoId: string
    annotationId: string
    oldFrame: number
    newFrame: number
    fps?: number
  }): Annotation[] => {
    const { videoId, annotationId, oldFrame, newFrame } = params

    const updated = (queryClient.getQueryData<Annotation[]>(annotationKeys.video(videoId)) ?? []).map(annotation => {
      if (annotation.id !== annotationId) return annotation

      // Find the keyframe at oldFrame
      const keyframe = annotation.boundingBoxSequence.boxes.find(
        b => b.frameNumber === oldFrame && (b.isKeyframe || b.isKeyframe === undefined)
      )
      if (!keyframe) return annotation

      // Remove old keyframe
      const withoutOld = interpolator.removeKeyframe(
        annotation.boundingBoxSequence,
        oldFrame
      )

      // Add at new location
      const withNew = interpolator.addKeyframe(withoutOld, newFrame)

      // Update the new keyframe with old values
      const newKeyframeIndex = withNew.boxes.findIndex(b => b.frameNumber === newFrame)
      if (newKeyframeIndex !== -1) {
        withNew.boxes[newKeyframeIndex] = {
          ...keyframe,
          frameNumber: newFrame,
        }
      }

      return { ...annotation, boundingBoxSequence: withNew }
    })

    queryClient.setQueryData<Annotation[]>(annotationKeys.video(videoId), updated)
    return updated
  }, [queryClient])
}

/**
 * Hook for updating an interpolation segment's mode.
 * Updates the cache optimistically (no server call).
 *
 * @returns Function that updates the segment and returns the updated
 *   annotations array (the same value written to the cache).
 */
export function useUpdateInterpolationSegment() {
  const queryClient = useQueryClient()

  return useCallback((params: {
    videoId: string
    annotationId: string
    segmentIndex: number
    interpolationType: InterpolationType
    controlPoints?: InterpolationSegment['controlPoints']
  }): Annotation[] => {
    const { videoId, annotationId, segmentIndex, interpolationType, controlPoints } = params

    const updated = (queryClient.getQueryData<Annotation[]>(annotationKeys.video(videoId)) ?? []).map(annotation => {
      if (annotation.id !== annotationId) return annotation

      const segments = [...(annotation.boundingBoxSequence.interpolationSegments || [])]

      // Get keyframes to compute segment frame bounds
      const keyframes = annotation.boundingBoxSequence.boxes
        .filter(b => b.isKeyframe || b.isKeyframe === undefined)
        .sort((a, b) => a.frameNumber - b.frameNumber)

      // Ensure segments array is long enough by creating proper segments from keyframes
      while (segments.length <= segmentIndex && segments.length < keyframes.length - 1) {
        const startKeyframe = keyframes[segments.length]
        const endKeyframe = keyframes[segments.length + 1]
        if (startKeyframe && endKeyframe) {
          segments.push({
            type: 'linear',
            startFrame: startKeyframe.frameNumber,
            endFrame: endKeyframe.frameNumber,
          })
        }
      }

      // Only update if segment exists
      if (segmentIndex < segments.length) {
        segments[segmentIndex] = {
          ...segments[segmentIndex],
          type: interpolationType,
          ...(controlPoints && { controlPoints }),
        }
      }

      return {
        ...annotation,
        boundingBoxSequence: {
          ...annotation.boundingBoxSequence,
          interpolationSegments: segments,
        },
      }
    })

    queryClient.setQueryData<Annotation[]>(annotationKeys.video(videoId), updated)
    return updated
  }, [queryClient])
}
