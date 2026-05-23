/**
 * SpotlightOverlay — full-viewport SVG overlay that draws a dashed
 * bounding-box outline + four corner handles around the current tour
 * anchor, visually echoing Fovea's `InteractiveBoundingBox`.
 *
 * Re-measures on resize / scroll / DOM mutation so the spotlight tracks
 * the anchor across layout shifts (Popovers opening, panels collapsing,
 * Dialogs animating in). When the anchor unmounts, the overlay smoothly
 * fades the spotlight to a neutral state rather than snapping to {0,0}.
 */

import { useEffect, useState } from 'react'

type Rect = { x: number; y: number; width: number; height: number }

const HANDLE_SIZE = 8
const STROKE_WIDTH = 2
const STROKE_DASH = '6 4'

interface SpotlightOverlayProps {
  target: HTMLElement | null
  /** When true, click-through is blocked outside the spotlight. */
  modal?: boolean
  /** Tinted backdrop (rgba). Defaults to a subtle dim. */
  backdropColor?: string
}

export function SpotlightOverlay({
  target,
  modal = true,
  backdropColor = 'rgba(0, 0, 0, 0.45)',
}: SpotlightOverlayProps) {
  const [rect, setRect] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  useEffect(() => {
    function measure() {
      if (!target) return setRect(null)
      const r = target.getBoundingClientRect()
      // Inflate by a few px so the dashed stroke sits outside the anchor
      // instead of clipping its border-radius.
      const pad = 4
      setRect({
        x: r.left - pad,
        y: r.top - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      })
    }

    measure()

    if (!target) return undefined

    const ro = new ResizeObserver(measure)
    ro.observe(target)

    const mo = new MutationObserver(measure)
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })

    function onWindow() {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      measure()
    }
    window.addEventListener('resize', onWindow)
    window.addEventListener('scroll', onWindow, true)

    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', onWindow)
      window.removeEventListener('scroll', onWindow, true)
    }
  }, [target])

  if (!rect) return null

  // Mask-based hole-punch: backdrop fills the viewport, a transparent
  // rect inside the spotlight cuts out the anchor so its pixels render
  // at full brightness.
  const maskId = 'fovea-tour-spotlight-mask'

  return (
    <svg
      data-fovea-tour-spotlight=""
      width={viewport.width}
      height={viewport.height}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        pointerEvents: modal ? 'auto' : 'none',
      }}
      aria-hidden="true"
    >
      <defs>
        <mask id={maskId}>
          <rect x={0} y={0} width={viewport.width} height={viewport.height} fill="white" />
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx={4}
            ry={4}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        x={0}
        y={0}
        width={viewport.width}
        height={viewport.height}
        fill={backdropColor}
        mask={`url(#${maskId})`}
      />
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={4}
        ry={4}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={STROKE_DASH}
        style={{ pointerEvents: 'none' }}
      />
      {cornerHandles(rect).map((c, i) => (
        <rect
          key={i}
          x={c.x - HANDLE_SIZE / 2}
          y={c.y - HANDLE_SIZE / 2}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          fill="white"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          style={{ pointerEvents: 'none' }}
        />
      ))}
    </svg>
  )
}

function cornerHandles(rect: Rect): Array<{ x: number; y: number }> {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
}
