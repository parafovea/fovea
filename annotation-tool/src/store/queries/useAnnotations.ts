/**
 * TanStack Query hooks for annotation operations.
 * Provides declarative data fetching with automatic caching and refetching.
 *
 * Annotations are video-specific bounding box annotations with semantic links
 * to personas, entities, events, and other world objects.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import { Annotation, BoundingBox, InterpolationType, InterpolationSegment } from '@models/types'
import { api } from '@services/api'
import { generateId } from '@utils/uuid'
import { BoundingBoxInterpolator } from '@utils/interpolation'

// Shared interpolator instance
const interpolator = new BoundingBoxInterpolator()

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
 * Uses optimistic updates for immediate UI feedback. If the save fails,
 * the cache is rolled back to the previous state. After success or failure,
 * the cache is invalidated to ensure consistency with the server.
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

  // Store cachedIds before optimistic update so mutationFn can access them.
  // MUST be useRef, not a plain { current: new Set() } literal: the literal
  // is reconstructed on every render, and onMutate's `queryClient.setQueryData`
  // call triggers a synchronous re-render that races with mutationFn (which
  // fires after onMutate awaits). With the plain-literal form, mutationFn's
  // closure resolved against the re-rendered (empty) cachedIdsRef, so every
  // annotation was treated as new and routed through api.saveAnnotation
  // (POST = create). The visible symptom was Add Keyframe duplicating every
  // existing annotation on the canvas — N annotations in, N new rows out.
  // useRef gives a stable ref object whose .current write survives the
  // intermediate re-render that onMutate kicks off.
  const cachedIdsRef = useRef<Set<string>>(new Set<string>())

  return useMutation({
    mutationFn: async ({ videoId, annotations }: {
      videoId: string
      annotations: Annotation[]
    }) => {
      // Use cachedIds captured before optimistic update
      const existingIds = cachedIdsRef.current

      const results: { created: number; updated: number; errors: string[] } = {
        created: 0,
        updated: 0,
        errors: [],
      }

      for (const annotation of annotations) {
        try {
          const isNew = !existingIds.has(annotation.id)

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
    onMutate: async ({ videoId, annotations }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: annotationKeys.video(videoId) })

      // Snapshot the previous value for rollback
      const previous = queryClient.getQueryData<Annotation[]>(annotationKeys.video(videoId))

      // Capture cachedIds before optimistic update so mutationFn can distinguish new vs existing
      cachedIdsRef.current = new Set((previous ?? []).map(a => a.id))

      // Optimistically update to the new value
      queryClient.setQueryData(annotationKeys.video(videoId), annotations)

      // Return context with previous value for rollback
      return { previous, videoId }
    },
    onError: (_err, _variables, context) => {
      // Rollback on failure
      if (context?.previous) {
        queryClient.setQueryData(annotationKeys.video(context.videoId), context.previous)
      }
    },
    onSettled: (_data, _error, { videoId }) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: annotationKeys.video(videoId) })
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
