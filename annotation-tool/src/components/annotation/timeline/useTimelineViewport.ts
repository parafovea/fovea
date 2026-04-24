/**
 * Hook that owns the timeline viewport state.
 *
 * Tracks container width via a ResizeObserver, holds the zoom value, and
 * derives a :class:`TimelineViewport` that primitives consume. Exposes
 * actions for zoom-in / zoom-out / zoom-at-cursor / fit-to-view so the
 * transport bar, wheel handler, and keyboard handler can all mutate the
 * same source of truth.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BASE_PIXELS_PER_FRAME,
  MAX_ZOOM,
  clampZoom,
  computeMinZoom,
  computeViewport,
  zoomTowardsFrame,
} from './viewport'
import type { TimelineViewport } from './types'

interface Options {
  currentFrame: number
  totalFrames: number
}

export interface TimelineViewportHandle {
  containerRef: React.RefObject<HTMLDivElement>
  viewport: TimelineViewport
  setZoom: (zoom: number) => void
  zoomAt: (delta: number, anchorFrame: number) => void
  zoomIn: () => void
  zoomOut: () => void
  fitToView: () => void
}

export function useTimelineViewport({
  currentFrame,
  totalFrames,
}: Options): TimelineViewportHandle {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const [zoom, setZoomState] = useState<number>(0.25)
  const hasInitialized = useRef(false)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])

  // Initialize to fit-to-view exactly once the container has been measured.
  useEffect(() => {
    if (hasInitialized.current) return
    if (containerWidth <= 0 || totalFrames <= 0) return
    setZoomState(computeMinZoom(totalFrames, containerWidth))
    hasInitialized.current = true
  }, [containerWidth, totalFrames])

  const viewport: TimelineViewport = computeViewport({
    currentFrame,
    totalFrames,
    containerWidth,
    zoom,
  })

  const setZoom = useCallback(
    (next: number) => {
      setZoomState(clampZoom(next, viewport.minZoom))
    },
    [viewport.minZoom],
  )

  const zoomAt = useCallback(
    (delta: number) => {
      // anchorFrame isn't currently used for re-centering because the
      // playhead already centers itself on ``currentFrame``; we accept
      // the param so future work can de-center the viewport.
      setZoomState((prev) =>
        zoomTowardsFrame({ currentZoom: prev, delta, minZoom: viewport.minZoom }),
      )
    },
    [viewport.minZoom],
  )

  const zoomIn = useCallback(() => {
    setZoomState((prev) => clampZoom(prev * 1.4, viewport.minZoom))
  }, [viewport.minZoom])

  const zoomOut = useCallback(() => {
    setZoomState((prev) => clampZoom(prev / 1.4, viewport.minZoom))
  }, [viewport.minZoom])

  const fitToView = useCallback(() => {
    setZoomState(viewport.minZoom)
  }, [viewport.minZoom])

  return {
    containerRef,
    viewport,
    setZoom,
    zoomAt,
    zoomIn,
    zoomOut,
    fitToView,
  }
}

/** Re-exported for callers building their own viewport-aware hooks. */
export { BASE_PIXELS_PER_FRAME, MAX_ZOOM }
