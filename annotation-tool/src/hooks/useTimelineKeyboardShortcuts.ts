/**
 * @module useTimelineKeyboardShortcuts
 * @description Custom hook for timeline keyboard navigation shortcuts.
 */

import { useEffect } from 'react'
import { BoundingBox } from '../models/types.js'

/**
 * @hook useTimelineKeyboardShortcuts
 * @description Provides keyboard shortcuts for timeline navigation.
 *
 * Shortcuts:
 * - Arrow Left: Step 1 frame backward
 * - Arrow Right: Step 1 frame forward
 * - Shift + Arrow Left: Step 10 frames backward
 * - Shift + Arrow Right: Step 10 frames forward
 * - Ctrl + Arrow Left: Jump to previous keyframe
 * - Ctrl + Arrow Right: Jump to next keyframe
 * - Home: Jump to frame 0
 * - End: Jump to last frame
 *
 * @param currentFrame - Current frame number
 * @param totalFrames - Total number of frames
 * @param keyframes - Array of keyframe bounding boxes
 * @param onSeek - Callback to seek to a frame
 */
export function useTimelineKeyboardShortcuts(
  currentFrame: number,
  totalFrames: number,
  keyframes: BoundingBox[],
  onSeek: (frame: number) => void
): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      let handled = false
      let newFrame = currentFrame

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          handled = true

          if (e.ctrlKey || e.metaKey) {
            // Jump to previous keyframe
            const prevKeyframes = keyframes
              .filter(kf => kf.frameNumber < currentFrame)
              .sort((a, b) => b.frameNumber - a.frameNumber)

            if (prevKeyframes.length > 0) {
              newFrame = prevKeyframes[0].frameNumber
            } else {
              newFrame = 0
            }
          } else if (e.shiftKey) {
            // Step 10 frames backward
            newFrame = Math.max(0, currentFrame - 10)
          } else {
            // Step 1 frame backward
            newFrame = Math.max(0, currentFrame - 1)
          }
          break

        case 'ArrowRight':
          e.preventDefault()
          handled = true

          if (e.ctrlKey || e.metaKey) {
            // Jump to next keyframe
            const nextKeyframes = keyframes
              .filter(kf => kf.frameNumber > currentFrame)
              .sort((a, b) => a.frameNumber - b.frameNumber)

            if (nextKeyframes.length > 0) {
              newFrame = nextKeyframes[0].frameNumber
            } else {
              newFrame = totalFrames - 1
            }
          } else if (e.shiftKey) {
            // Step 10 frames forward
            newFrame = Math.min(totalFrames - 1, currentFrame + 10)
          } else {
            // Step 1 frame forward
            newFrame = Math.min(totalFrames - 1, currentFrame + 1)
          }
          break

        case 'Home':
          e.preventDefault()
          handled = true
          newFrame = 0
          break

        case 'End':
          e.preventDefault()
          handled = true
          newFrame = totalFrames - 1
          break

        default:
          break
      }

      if (handled && newFrame !== currentFrame) {
        onSeek(newFrame)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentFrame, totalFrames, keyframes, onSeek])
}
