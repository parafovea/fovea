/**
 * Core annotation and playback state for the annotation workspace.
 *
 * Owns the video/playback local state and player ref, the selected-annotation
 * subscription, the keyframe manipulation handlers (add, delete, copy-previous,
 * interpolation), the auto-save wiring, and the save/delete mutations. Keyframe
 * handlers persist the freshly-mutated array returned by each mutation directly
 * via {@link forceSave} so a keyframe is never dropped while the query cache is
 * still catching up for the current render.
 *
 * @module
 */

import { useCallback, useRef, useState } from 'react'

import {
  useSaveAnnotations,
  useDeleteAnnotation,
  useAddKeyframe,
  useRemoveKeyframe,
  useUpdateKeyframe,
  useUpdateInterpolationSegment,
} from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand'
import { useAutoSave } from '@hooks/data'
import type {
  Annotation,
  InterpolationType,
  InterpolationSegment,
  VideoMetadata,
} from '@models/types'

import type { VideoPlayerHandle } from '../VideoPlayer'

/**
 * Inputs for {@link useAnnotationState}.
 */
export interface UseAnnotationStateOptions {
  /** The current video ID from the route, or undefined */
  videoId: string | undefined
  /** The current video metadata, or null while loading */
  currentVideo: VideoMetadata | null
}

/**
 * Return shape of {@link useAnnotationState}.
 */
export interface UseAnnotationStateResult {
  /** Ref to the imperative video player handle */
  videoPlayerRef: React.RefObject<VideoPlayerHandle>
  /** The underlying <video> DOM node, tracked in state for overlay re-renders */
  videoElement: HTMLVideoElement | null
  /** Setter for the tracked <video> DOM node */
  setVideoElement: (element: HTMLVideoElement | null) => void
  /** Current playback time in seconds */
  currentTime: number
  /** Setter for the current playback time */
  setCurrentTime: (time: number) => void
  /** Current frame number */
  currentFrame: number
  /** Setter for the current frame number */
  setCurrentFrame: (frame: number) => void
  /** Total video duration in seconds */
  duration: number
  /** Setter for the total video duration */
  setDuration: (duration: number) => void
  /** The currently selected annotation, or null */
  selectedAnnotation: Annotation | null
  /** Save mutation for the annotations array */
  saveAnnotationsMutation: ReturnType<typeof useSaveAnnotations>['mutate']
  /** Delete mutation for a single annotation */
  deleteAnnotationMutation: ReturnType<typeof useDeleteAnnotation>['mutate']
  /** Current auto-save status */
  saveStatus: ReturnType<typeof useAutoSave<Annotation[]>>['saveStatus']
  /** Timestamp of the last successful save */
  lastSavedAt: ReturnType<typeof useAutoSave<Annotation[]>>['lastSavedAt']
  /** Auto-save error message, if any */
  errorMessage: ReturnType<typeof useAutoSave<Annotation[]>>['errorMessage']
  /** Number of auto-save retries attempted */
  retryCount: ReturnType<typeof useAutoSave<Annotation[]>>['retryCount']
  /** Forces an immediate save, optionally with an override array */
  forceSave: ReturnType<typeof useAutoSave<Annotation[]>>['forceSave']
  /** Adds a keyframe at the current frame and saves immediately */
  handleAddKeyframe: () => Promise<void>
  /** Deletes the keyframe at the current frame and saves immediately */
  handleDeleteKeyframe: () => Promise<void>
  /** Copies the previous keyframe to the current frame and saves immediately */
  handleCopyPreviousFrame: () => Promise<void>
  /** Updates an interpolation segment and saves immediately */
  handleUpdateInterpolationSegment: (
    segmentIndex: number,
    type: InterpolationType,
    controlPoints?: InterpolationSegment['controlPoints'],
  ) => Promise<void>
}

/**
 * Manages the core annotation and playback state for the annotation workspace.
 *
 * @param options - the current video ID and metadata
 * @param videoAnnotations - the unfiltered annotations array for the video, used as the auto-save source
 * @returns playback state, the player ref, keyframe handlers, save mutations, and auto-save status
 */
export function useAnnotationState(
  { videoId, currentVideo }: UseAnnotationStateOptions,
  videoAnnotations: Annotation[],
): UseAnnotationStateResult {
  // TanStack Query hooks for keyframe manipulation
  const addKeyframe = useAddKeyframe()
  const removeKeyframe = useRemoveKeyframe()
  const updateKeyframe = useUpdateKeyframe()
  const updateInterpolationSegmentHook = useUpdateInterpolationSegment()

  const videoPlayerRef = useRef<VideoPlayerHandle>(null)
  // Track the underlying <video> DOM node in state so AnnotationOverlay
  // re-renders when it mounts (refs don't trigger re-renders, so a
  // condition like `videoPlayerRef.current?.videoRef.current && <Overlay/>`
  // would only flip in if some unrelated state update happened to fire
  // afterwards — which under headless Chromium it often doesn't).
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [duration, setDuration] = useState(0)

  const { mutate: saveAnnotationsMutation } = useSaveAnnotations()
  const { mutate: deleteAnnotationMutation } = useDeleteAnnotation()

  const selectedAnnotation = useAnnotationUiStore((state) => state.selectedAnnotation)

  // Memoize the auto-save callback to prevent cascading effect resets
  // that cause dropdown jitter when annotations exist
  const handleAutoSave = useCallback(async (annotations: Annotation[]) => {
    saveAnnotationsMutation({ videoId: videoId!, annotations })
  }, [saveAnnotationsMutation, videoId])

  // Auto-save annotations to database using useAutoSave hook.
  //
  // Change detection strips the server-managed timestamps from each
  // annotation before serializing. The editor never writes createdAt or
  // updatedAt; the server bumps updatedAt on every save and the post-save
  // refetch echoes the new value into the query cache. Comparing the raw
  // annotations would treat that echoed timestamp as a fresh edit and fire
  // another save, which bumps the timestamp again — an idle save loop. By
  // comparing only the fields the editor can actually change, an idle
  // workspace produces no saves while a real edit still produces exactly one.
  const { saveStatus, lastSavedAt, errorMessage, retryCount, forceSave } = useAutoSave({
    data: videoAnnotations,
    isEnabled: !!videoId && videoAnnotations.length > 0,
    onSave: handleAutoSave,
    entityType: 'annotation',
    entityId: videoId,
    getComparisonSnapshot: (annotations) =>
      annotations.map((annotation) => {
        const { createdAt, updatedAt, ...editableFields } = annotation
        void createdAt
        void updatedAt
        return editableFields
      }),
  })

  // Keyframe control callbacks
  const handleAddKeyframe = useCallback(async () => {
    if (!selectedAnnotation) return

    // Get current box from annotation sequence (interpolated or existing)
    const allBoxes = selectedAnnotation.boundingBoxSequence?.boxes || []
    let currentBox = allBoxes.find(b => b.frameNumber === currentFrame)

    // If no box exists at current frame, compute interpolated position
    if (!currentBox) {
      const keyframes = allBoxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)
      if (keyframes.length === 0) return

      // Find surrounding keyframes
      const prevKeyframes = keyframes.filter(k => k.frameNumber < currentFrame)
      const nextKeyframes = keyframes.filter(k => k.frameNumber > currentFrame)

      if (prevKeyframes.length === 0 && nextKeyframes.length === 0) return

      // Use nearest keyframe or interpolate
      if (prevKeyframes.length === 0) {
        currentBox = { ...nextKeyframes[0], frameNumber: currentFrame }
      } else if (nextKeyframes.length === 0) {
        currentBox = { ...prevKeyframes[prevKeyframes.length - 1], frameNumber: currentFrame }
      } else {
        // Linear interpolation
        const prev = prevKeyframes[prevKeyframes.length - 1]
        const next = nextKeyframes[0]
        const t = (currentFrame - prev.frameNumber) / (next.frameNumber - prev.frameNumber)
        currentBox = {
          x: prev.x + (next.x - prev.x) * t,
          y: prev.y + (next.y - prev.y) * t,
          width: prev.width + (next.width - prev.width) * t,
          height: prev.height + (next.height - prev.height) * t,
          frameNumber: currentFrame,
        }
      }
    }

    // The mutation returns the updated annotations array it wrote to the
    // cache. Persist that array directly via forceSave: the cache update has
    // not yet propagated back into `videoAnnotations` for this render, so a
    // bare forceSave would read the pre-keyframe data and silently drop the
    // new keyframe.
    const updated = addKeyframe({
      videoId: selectedAnnotation.videoId,
      annotationId: selectedAnnotation.id,
      frameNumber: currentFrame,
      box: currentBox,
      fps: currentVideo?.fps || 30,
    })
    // Save immediately after keyframe operation
    await forceSave(updated)
  }, [selectedAnnotation, currentFrame, currentVideo, addKeyframe, forceSave])

  const handleDeleteKeyframe = useCallback(async () => {
    if (!selectedAnnotation) return

    const updated = removeKeyframe({
      videoId: selectedAnnotation.videoId,
      annotationId: selectedAnnotation.id,
      frameNumber: currentFrame,
      fps: currentVideo?.fps || 30,
    })
    // Save immediately after keyframe operation
    await forceSave(updated)
  }, [selectedAnnotation, currentFrame, currentVideo, removeKeyframe, forceSave])

  const handleCopyPreviousFrame = useCallback(async () => {
    if (!selectedAnnotation) return

    const allBoxes = selectedAnnotation.boundingBoxSequence?.boxes || []
    const keyframes = allBoxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)

    // Find nearest previous keyframe
    const prevKeyframes = keyframes.filter(k => k.frameNumber < currentFrame)
    if (prevKeyframes.length === 0) {
      return
    }

    const prevBox = prevKeyframes[prevKeyframes.length - 1]

    const isCurrentKeyframe = keyframes.some(k => k.frameNumber === currentFrame)

    const updated = isCurrentKeyframe
      ? updateKeyframe({
          videoId: selectedAnnotation.videoId,
          annotationId: selectedAnnotation.id,
          frameNumber: currentFrame,
          box: { ...prevBox, frameNumber: currentFrame },
        })
      : addKeyframe({
          videoId: selectedAnnotation.videoId,
          annotationId: selectedAnnotation.id,
          frameNumber: currentFrame,
          box: { ...prevBox, frameNumber: currentFrame },
          fps: currentVideo?.fps || 30,
        })
    // Save immediately after keyframe operation
    await forceSave(updated)
  }, [selectedAnnotation, currentFrame, currentVideo, addKeyframe, updateKeyframe, forceSave])

  const handleUpdateInterpolationSegment = useCallback(
    async (segmentIndex: number, type: InterpolationType, controlPoints?: InterpolationSegment['controlPoints']) => {
      if (!selectedAnnotation) return

      const updated = updateInterpolationSegmentHook({
        videoId: selectedAnnotation.videoId,
        annotationId: selectedAnnotation.id,
        segmentIndex,
        interpolationType: type,
        controlPoints,
      })
      // Save immediately after interpolation change
      await forceSave(updated)
    },
    [selectedAnnotation, updateInterpolationSegmentHook, forceSave]
  )

  return {
    videoPlayerRef,
    videoElement,
    setVideoElement,
    currentTime,
    setCurrentTime,
    currentFrame,
    setCurrentFrame,
    duration,
    setDuration,
    selectedAnnotation,
    saveAnnotationsMutation,
    deleteAnnotationMutation,
    saveStatus,
    lastSavedAt,
    errorMessage,
    retryCount,
    forceSave,
    handleAddKeyframe,
    handleDeleteKeyframe,
    handleCopyPreviousFrame,
    handleUpdateInterpolationSegment,
  }
}
