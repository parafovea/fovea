/**
 * @module useAnnotationKeyboardShortcuts
 * @description Custom hook for annotation keyboard shortcuts.
 * Handles keyframe operations and bounding box manipulation.
 */

import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '../store/store.js'
import {
  addKeyframe,
  removeKeyframe,
  selectAnnotation,
  toggleVisibilityAtFrame,
  setVisibilityRange,
} from '../store/annotationSlice.js'
import { Annotation } from '../models/types.js'

/**
 * @function useAnnotationKeyboardShortcuts
 * @description Hook for handling annotation keyboard shortcuts.
 *
 * Supported shortcuts:
 * - K: Add keyframe at current frame
 * - Delete: Remove keyframe at current frame
 * - Ctrl+C: Copy previous frame's box
 * - V: Toggle visibility at current frame
 * - [: Set in-point for visibility range
 * - ]: Set out-point for visibility range
 * - Esc: Deselect annotation
 *
 * @param selectedAnnotation - Currently selected annotation
 * @param currentFrame - Current frame number
 * @param isKeyframe - Whether current frame is a keyframe
 * @param onCopyPreviousFrame - Callback to copy previous frame's box
 */
export function useAnnotationKeyboardShortcuts(
  selectedAnnotation: Annotation | null,
  currentFrame: number,
  isKeyframe: boolean,
  onCopyPreviousFrame?: () => void
): void {
  const dispatch = useDispatch<AppDispatch>()

  // Track in-point for visibility range
  const [inPoint, setInPoint] = useState<number | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedAnnotation) return

      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      switch (e.key.toLowerCase()) {
        case 'k':
          // Add keyframe at current frame
          if (!isKeyframe) {
            e.preventDefault()
            dispatch(
              addKeyframe({
                videoId: selectedAnnotation.videoId,
                annotationId: selectedAnnotation.id,
                frameNumber: currentFrame,
              })
            )
          }
          break

        case 'delete':
        case 'backspace':
          // Remove keyframe at current frame
          if (isKeyframe) {
            e.preventDefault()
            const keyframes = selectedAnnotation.boundingBoxSequence.boxes.filter(
              b => b.isKeyframe || b.isKeyframe === undefined
            )

            // Cannot delete first or last keyframe
            const isFirstOrLast =
              keyframes.length <= 2 ||
              currentFrame === keyframes[0].frameNumber ||
              currentFrame === keyframes[keyframes.length - 1].frameNumber

            if (!isFirstOrLast) {
              dispatch(
                removeKeyframe({
                  videoId: selectedAnnotation.videoId,
                  annotationId: selectedAnnotation.id,
                  frameNumber: currentFrame,
                })
              )
            }
          }
          break

        case 'c':
          // Copy previous frame's box (Ctrl+C)
          if ((e.ctrlKey || e.metaKey) && currentFrame > 0 && onCopyPreviousFrame) {
            e.preventDefault()
            onCopyPreviousFrame()
          }
          break

        case 'v':
          // Toggle visibility at current frame
          e.preventDefault()
          dispatch(
            toggleVisibilityAtFrame({
              videoId: selectedAnnotation.videoId,
              annotationId: selectedAnnotation.id,
              frameNumber: currentFrame,
            })
          )
          break

        case '[':
          // Set in-point for visibility range
          e.preventDefault()
          setInPoint(currentFrame)
          break

        case ']':
          // Set out-point for visibility range (requires in-point to be set)
          if (inPoint !== null) {
            e.preventDefault()
            const startFrame = Math.min(inPoint, currentFrame)
            const endFrame = Math.max(inPoint, currentFrame)
            dispatch(
              setVisibilityRange({
                videoId: selectedAnnotation.videoId,
                annotationId: selectedAnnotation.id,
                startFrame,
                endFrame,
                visible: true,
              })
            )
            setInPoint(null) // Reset in-point
          }
          break

        case 'escape':
          // Deselect annotation or clear in-point
          e.preventDefault()
          if (inPoint !== null) {
            setInPoint(null) // Clear in-point first
          } else {
            dispatch(selectAnnotation(null))
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedAnnotation, currentFrame, isKeyframe, onCopyPreviousFrame, inPoint, dispatch])
}
