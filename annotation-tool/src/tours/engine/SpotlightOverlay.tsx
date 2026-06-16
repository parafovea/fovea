/**
 * SpotlightOverlay — full-viewport SVG overlay that draws a dashed
 * bounding-box outline + four corner handles around the current tour
 * anchor, visually echoing Fovea's `InteractiveBoundingBox`.
 *
 * Robustness contract:
 *   - When `modal=true`, click-through is blocked OUTSIDE the spotlight
 *     region but allowed INSIDE — the user can still interact with the
 *     highlighted control. We achieve this with four backdrop rectangles
 *     (top / right / bottom / left of the spotlight) that absorb clicks,
 *     leaving the spotlight rect itself as a hole the user clicks through.
 *     A single SVG with a mask cutout would still receive pointer events
 *     on the cut-out region, which is why we don't use that approach.
 *   - Re-measures on resize / scroll / target ResizeObserver. We do NOT
 *     install a document-wide MutationObserver — it fires on every style
 *     or class change anywhere in the app and tanks performance during
 *     animations. Instead, we re-measure via requestAnimationFrame ticks
 *     while the spotlight is mounted; this catches anchor moves caused
 *     by Popover/Dialog animations without the global observer cost.
 *   - Detects anchor detachment (`!document.contains(target)`) and fades
 *     the spotlight to null rather than stranding it on a stale rect.
 *   - Smoothly animates position transitions between steps via CSS
 *     transitions on the inner <g> transform, unless the user prefers
 *     reduced motion.
 *   - Scrolls the anchor into view if it's outside the viewport when the
 *     overlay mounts — otherwise the visitor sees backdrop and nothing else.
 */

import { useEffect, useRef, useState } from 'react'

type Rect = { x: number; y: number; width: number; height: number }

const HANDLE_SIZE = 8
const STROKE_WIDTH = 2
const STROKE_DASH = '6 4'
const PADDING = 4

interface SpotlightOverlayProps {
  target: HTMLElement | null
  /** When true, click-through is blocked outside the spotlight. */
  modal?: boolean
  /** Tinted backdrop (rgba). Defaults to a subtle dim. */
  backdropColor?: string
}

function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function SpotlightOverlay({
  target,
  modal = true,
  backdropColor = 'rgba(0, 0, 0, 0.55)',
}: SpotlightOverlayProps) {
  const [rect, setRect] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }))
  const rectRef = useRef<Rect | null>(null)
  rectRef.current = rect

  useEffect(() => {
    if (!target) {
      setRect(null)
      return undefined
    }

    let rafId = 0
    let cancelled = false

    function measure() {
      if (cancelled) return
      // Anchor was removed from the DOM (Dialog closed, etc.) — clear
      // rather than stranding on a stale rect.
      if (!target || !document.contains(target)) {
        if (rectRef.current !== null) setRect(null)
        return
      }
      const r = target.getBoundingClientRect()
      // Skip zero-size measurements — anchor is mid-animation. We'll catch
      // the next rAF tick once the layout settles.
      if (r.width === 0 && r.height === 0) return
      const next: Rect = {
        x: r.left - PADDING,
        y: r.top - PADDING,
        width: r.width + PADDING * 2,
        height: r.height + PADDING * 2,
      }
      if (!rectsEqual(rectRef.current, next)) setRect(next)
    }

    function tick() {
      if (cancelled) return
      measure()
      rafId = window.requestAnimationFrame(tick)
    }

    // Scroll the anchor into view if it's off-screen at mount. Use
    // 'nearest' so we don't yank the page around for anchors that are
    // already visible.
    try {
      const r = target.getBoundingClientRect()
      const offscreen =
        r.bottom < 0 ||
        r.top > window.innerHeight ||
        r.right < 0 ||
        r.left > window.innerWidth
      if (offscreen) {
        target.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest',
        })
      }
    } catch {
      // scrollIntoView can throw in detached-document edge cases; ignore.
    }

    measure()
    tick()

    const ro = new ResizeObserver(measure)
    ro.observe(target)

    function onViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      measure()
    }
    window.addEventListener('resize', onViewport)
    window.addEventListener('scroll', onViewport, true)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('resize', onViewport)
      window.removeEventListener('scroll', onViewport, true)
    }
  }, [target])

  // Full-screen backdrop when there is no specific anchor to spotlight
  // OR the spotlight would cover most of the viewport (anchors like
  // 'app-shell' are page-level; spotlighting them is the same as
  // spotlighting nothing because there's no visible contrast between
  // the cutout and the surround). Render a single dimming layer over
  // the whole page so the step card has the visitor's focus.
  const FULL_BACKDROP_COVERAGE_THRESHOLD = 0.7
  const useFullBackdrop =
    !rect ||
    rect.width * rect.height >
      viewport.width * viewport.height * FULL_BACKDROP_COVERAGE_THRESHOLD
  if (useFullBackdrop) {
    return (
      <svg
        data-fovea-tour-spotlight=""
        width={viewport.width}
        height={viewport.height}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <rect
          x={0}
          y={0}
          width={viewport.width}
          height={viewport.height}
          fill={backdropColor}
          style={{ pointerEvents: modal ? 'auto' : 'none' }}
        />
      </svg>
    )
  }

  // Backdrop is built from four rectangles that surround the spotlight
  // hole. The spotlight rect itself has NO backdrop fill above it, so
  // clicks on the highlighted control pass through to the underlying UI.
  const bdAbove: Rect = { x: 0, y: 0, width: viewport.width, height: Math.max(0, rect.y) }
  const bdBelow: Rect = {
    x: 0,
    y: rect.y + rect.height,
    width: viewport.width,
    height: Math.max(0, viewport.height - (rect.y + rect.height)),
  }
  const bdLeft: Rect = {
    x: 0,
    y: rect.y,
    width: Math.max(0, rect.x),
    height: rect.height,
  }
  const bdRight: Rect = {
    x: rect.x + rect.width,
    y: rect.y,
    width: Math.max(0, viewport.width - (rect.x + rect.width)),
    height: rect.height,
  }

  const transition = prefersReducedMotion()
    ? undefined
    : 'x 180ms ease-out, y 180ms ease-out, width 180ms ease-out, height 180ms ease-out'

  return (
    <svg
      data-fovea-tour-spotlight=""
      width={viewport.width}
      height={viewport.height}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        // The svg itself never blocks pointer events — only the backdrop
        // rectangles do, which we toggle per-shape via pointerEvents.
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {[bdAbove, bdBelow, bdLeft, bdRight].map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          fill={backdropColor}
          style={{
            pointerEvents: modal ? 'auto' : 'none',
            transition,
          }}
        />
      ))}
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
        style={{ pointerEvents: 'none', transition }}
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
          style={{ pointerEvents: 'none', transition }}
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
