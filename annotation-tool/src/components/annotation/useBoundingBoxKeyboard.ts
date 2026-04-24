/**
 * Keyboard nudging for a selected bounding box.
 *
 * While ``enabled`` is true, arrow keys translate the box in pixel-space
 * units. Shift multiplies the step to 10 pixels per press, matching the
 * convention used in illustrator/figma-family editors.
 *
 * The hook installs one ``keydown`` listener on ``window`` and unbinds on
 * cleanup. Events whose target is an editable element (input, textarea,
 * contentEditable) are ignored so typing never nudges the selection.
 */

import { useEffect } from 'react'
import type { BoundingBox } from '@models/types'

export interface UseBoundingBoxKeyboardOptions {
  enabled: boolean
  box: BoundingBox | null
  videoWidth: number
  videoHeight: number
  onNudge: (updated: Partial<BoundingBox>) => void
  onCommit?: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true
  if (target.tagName === 'SELECT') return true
  return target.isContentEditable
}

export function useBoundingBoxKeyboard({
  enabled,
  box,
  videoWidth,
  videoHeight,
  onNudge,
  onCommit,
}: UseBoundingBoxKeyboardOptions): void {
  useEffect(() => {
    if (!enabled || !box) return

    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      const step = event.shiftKey ? 10 : 1
      let dx = 0
      let dy = 0
      switch (event.key) {
        case 'ArrowLeft':
          dx = -step
          break
        case 'ArrowRight':
          dx = step
          break
        case 'ArrowUp':
          dy = -step
          break
        case 'ArrowDown':
          dy = step
          break
        default:
          return
      }
      event.preventDefault()
      const nextX = Math.max(0, Math.min(videoWidth - box.width, box.x + dx))
      const nextY = Math.max(0, Math.min(videoHeight - box.height, box.y + dy))
      if (nextX === box.x && nextY === box.y) return
      onNudge({ x: nextX, y: nextY })
      onCommit?.()
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [enabled, box, videoWidth, videoHeight, onNudge, onCommit])
}
