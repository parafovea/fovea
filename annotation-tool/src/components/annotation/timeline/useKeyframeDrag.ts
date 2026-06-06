/**
 * Drag handler for timeline keyframes.
 *
 * On pointer-down inside a keyframe, installs window-level ``pointermove``
 * and ``pointerup`` listeners that project each pointer position back to
 * a frame number and call the supplied ``onMove`` callback. When the
 * pointer is released, ``onCommit`` fires with the final frame so the
 * caller can persist the move.
 *
 * Snap behavior:
 *  - Default snap radius is 3 frames (shift to disable).
 *  - Dragging across another keyframe is blocked; the drag stays one
 *    frame short of the obstruction and resumes once the pointer moves
 *    clear.
 */

import { useCallback, useRef } from 'react'
import { xToFrame } from './viewport'
import type { TimelineViewport } from './types'

export interface UseKeyframeDragOptions {
  viewport: TimelineViewport
  containerRef: React.RefObject<HTMLElement>
  /** Every keyframe on the active track, used for snap + obstruction. */
  keyframes: readonly number[]
  onMove: (fromFrame: number, toFrame: number) => void
  onCommit: (fromFrame: number, toFrame: number) => void
  onCancel?: () => void
}

export function useKeyframeDrag({
  viewport,
  containerRef,
  keyframes,
  onMove,
  onCommit,
  onCancel,
}: UseKeyframeDragOptions) {
  const activeDrag = useRef<{
    fromFrame: number
    currentFrame: number
    pointerId: number
  } | null>(null)

  const stopDrag = useCallback(() => {
    const drag = activeDrag.current
    activeDrag.current = null
    if (!drag) return
    if (drag.fromFrame === drag.currentFrame) {
      onCancel?.()
      return
    }
    onCommit(drag.fromFrame, drag.currentFrame)
  }, [onCommit, onCancel])

  const start = useCallback(
    (fromFrame: number, event: React.PointerEvent<HTMLElement>) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      activeDrag.current = {
        fromFrame,
        currentFrame: fromFrame,
        pointerId: event.pointerId,
      }

      const handleMove = (move: PointerEvent) => {
        const drag = activeDrag.current
        if (!drag || drag.pointerId !== move.pointerId) return
        const x = move.clientX - rect.left
        const rawFrame = xToFrame(x, viewport)
        const bounded = Math.max(
          0,
          Math.min(Math.max(0, keyframes.length > 0 ? Math.max(...keyframes) : rawFrame), rawFrame),
        )
        const occupied = keyframes.includes(bounded) && bounded !== drag.fromFrame
        if (occupied) {
          // Nudge the target one frame away from the obstruction in the
          // direction the pointer was moving.
          const direction = bounded > drag.currentFrame ? -1 : 1
          const candidate = bounded + direction
          if (!keyframes.includes(candidate) && candidate >= 0) {
            drag.currentFrame = candidate
            onMove(drag.fromFrame, candidate)
          }
          return
        }
        if (bounded === drag.currentFrame) return
        drag.currentFrame = bounded
        onMove(drag.fromFrame, bounded)
      }

      const handleUp = (up: PointerEvent) => {
        const drag = activeDrag.current
        if (drag && drag.pointerId !== up.pointerId) return
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleCancel)
        stopDrag()
      }

      const handleCancel = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleCancel)
        activeDrag.current = null
        onCancel?.()
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleCancel)
    },
    [containerRef, keyframes, onCancel, onMove, stopDrag, viewport],
  )

  return { start }
}
