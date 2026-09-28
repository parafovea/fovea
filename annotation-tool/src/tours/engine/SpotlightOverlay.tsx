/**
 * The full-viewport overlay that draws a dashed bounding-box outline with four
 * corner handles around the current tour anchor, echoing the workspace's
 * interactive bounding box.
 *
 * Behavior:
 *   - When `modal`, click-through is blocked outside the spotlight but allowed
 *     inside, so the visitor can still operate the highlighted control. Four
 *     backdrop rectangles (above / below / left / right of the spotlight)
 *     absorb clicks, leaving the spotlight rect as a hole. A single masked rect
 *     would still receive pointer events on the cut-out region.
 *   - Re-measures on resize, scroll, and the target's ResizeObserver, and on
 *     each requestAnimationFrame tick while mounted, so the outline follows
 *     dialog and popover animations without a document-wide MutationObserver.
 *   - Clears to null when the anchor detaches, rather than stranding a stale
 *     rect.
 *   - Animates position transitions between steps via CSS transitions on the
 *     rect geometry, unless the visitor prefers reduced motion.
 *   - Scrolls the anchor into view when it mounts off-screen, so the visitor is
 *     not left looking at backdrop alone.
 */

import { useEffect, useRef, useState } from 'react'

type Rect = { x: number; y: number; width: number; height: number }

const HANDLE_SIZE = 8
const STROKE_WIDTH = 2
const STROKE_DASH = '6 4'
const PADDING = 4
/**
 * A spotlight covering most of the viewport reads the same as no spotlight at
 * all (a page-level anchor has no visible contrast against its surround), so
 * above this fraction the overlay dims the whole page instead.
 */
const FULL_BACKDROP_COVERAGE = 0.7

interface SpotlightOverlayProps {
  target: HTMLElement | null
  /** When true, click-through is blocked outside the spotlight. */
  modal?: boolean
  /** Tinted backdrop color. Defaults to a subtle dim. */
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
      if (cancelled || !target) return
      // The anchor left the DOM (a dialog closed, etc.): clear rather than
      // stranding on a stale rect.
      if (!document.contains(target)) {
        if (rectRef.current !== null) setRect(null)
        return
      }
      const r = target.getBoundingClientRect()
      // A zero-size measurement is ambiguous: the anchor is either hidden
      // (display:none, no layout boxes, clear the spotlight) or mid-animation
      // (skip this tick). `getClientRects().length === 0` is true only for the
      // former, so it distinguishes the two.
      if (r.width === 0 && r.height === 0) {
        if (target.getClientRects().length === 0 && rectRef.current !== null) setRect(null)
        return
      }
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

    // Scroll the anchor into view when it mounts off-screen. 'nearest' avoids
    // yanking the page around for anchors already visible.
    try {
      const r = target.getBoundingClientRect()
      const offscreen =
        r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth
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

  const useFullBackdrop =
    !rect ||
    rect.width * rect.height > viewport.width * viewport.height * FULL_BACKDROP_COVERAGE

  if (useFullBackdrop) {
    return (
      <svg
        data-fovea-tour-spotlight=""
        width={viewport.width}
        height={viewport.height}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: 'none' }}
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

  // Four rectangles surround the spotlight hole. The spotlight rect itself has
  // no backdrop fill above it, so clicks on the highlighted control pass
  // through to the underlying UI.
  const bdAbove: Rect = { x: 0, y: 0, width: viewport.width, height: Math.max(0, rect.y) }
  const bdBelow: Rect = {
    x: 0,
    y: rect.y + rect.height,
    width: viewport.width,
    height: Math.max(0, viewport.height - (rect.y + rect.height)),
  }
  const bdLeft: Rect = { x: 0, y: rect.y, width: Math.max(0, rect.x), height: rect.height }
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
      style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: 'none' }}
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
          style={{ pointerEvents: modal ? 'auto' : 'none', transition }}
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
