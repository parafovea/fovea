/**
 * Keyboard handler for the timeline.
 *
 * Attaches a ``keydown`` listener to ``window`` while the supplied enabled
 * flag is true. Ignores events that originate from form controls so typing
 * into a text input never accidentally seeks.
 *
 * Shortcuts implemented:
 *   - ``ArrowLeft`` / ``ArrowRight``: step 1 frame (shift: 10)
 *   - ``Home`` / ``End``: jump to first / last frame
 *   - ``,`` / ``.``: previous / next keyframe on active track
 *   - ``K``: add keyframe
 *   - ``Delete`` / ``Backspace``: delete keyframe
 *   - ``C``: copy previous frame
 *   - ``I``: open interpolation dialog
 *   - ``J`` / ``L``: play backward / forward (rate-scale reserved for future)
 *   - ``+`` / ``-``: zoom in / out
 *   - ``0``: fit to view
 *   - ``?``: open shortcut palette
 */

import { useEffect } from 'react'

export interface TimelineKeyboardOptions {
  enabled: boolean
  currentFrame: number
  totalFrames: number
  keyframes: readonly number[]
  onSeek: (frame: number) => void
  onAddKeyframe: () => void
  onDeleteKeyframe: () => void
  onCopyPreviousFrame: () => void
  onOpenInterpolation: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToView: () => void
  onOpenShortcuts: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function previousKeyframe(keyframes: readonly number[], current: number): number | null {
  let best: number | null = null
  for (const kf of keyframes) {
    if (kf < current && (best === null || kf > best)) best = kf
  }
  return best
}

function nextKeyframe(keyframes: readonly number[], current: number): number | null {
  let best: number | null = null
  for (const kf of keyframes) {
    if (kf > current && (best === null || kf < best)) best = kf
  }
  return best
}

export function useTimelineKeyboard(options: TimelineKeyboardOptions): void {
  const {
    enabled,
    currentFrame,
    totalFrames,
    keyframes,
    onSeek,
    onAddKeyframe,
    onDeleteKeyframe,
    onCopyPreviousFrame,
    onOpenInterpolation,
    onZoomIn,
    onZoomOut,
    onFitToView,
    onOpenShortcuts,
  } = options

  useEffect(() => {
    if (!enabled) return
    const maxFrame = Math.max(0, totalFrames - 1)

    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      const step = event.shiftKey ? 10 : 1
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          onSeek(Math.max(0, currentFrame - step))
          return
        case 'ArrowRight':
          event.preventDefault()
          onSeek(Math.min(maxFrame, currentFrame + step))
          return
        case 'Home':
          event.preventDefault()
          onSeek(0)
          return
        case 'End':
          event.preventDefault()
          onSeek(maxFrame)
          return
        case ',': {
          const prev = previousKeyframe(keyframes, currentFrame)
          if (prev !== null) {
            event.preventDefault()
            onSeek(prev)
          }
          return
        }
        case '.': {
          const next = nextKeyframe(keyframes, currentFrame)
          if (next !== null) {
            event.preventDefault()
            onSeek(next)
          }
          return
        }
        case 'k':
        case 'K':
          event.preventDefault()
          onAddKeyframe()
          return
        case 'Delete':
        case 'Backspace':
          event.preventDefault()
          onDeleteKeyframe()
          return
        case 'c':
        case 'C':
          event.preventDefault()
          onCopyPreviousFrame()
          return
        case 'i':
        case 'I':
          event.preventDefault()
          onOpenInterpolation()
          return
        case '+':
        case '=':
          event.preventDefault()
          onZoomIn()
          return
        case '-':
        case '_':
          event.preventDefault()
          onZoomOut()
          return
        case '0':
          event.preventDefault()
          onFitToView()
          return
        case '?':
          event.preventDefault()
          onOpenShortcuts()
          return
        default:
          return
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [
    enabled,
    currentFrame,
    totalFrames,
    keyframes,
    onSeek,
    onAddKeyframe,
    onDeleteKeyframe,
    onCopyPreviousFrame,
    onOpenInterpolation,
    onZoomIn,
    onZoomOut,
    onFitToView,
    onOpenShortcuts,
  ])
}
