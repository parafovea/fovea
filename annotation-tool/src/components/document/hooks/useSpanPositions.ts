/**
 * Measures each span's bounding rectangle in the content wrapper's coordinate
 * space, recomputing when layout changes.
 *
 * The renderer tags every token element with `data-key` (the `"element:index"`
 * key); this hook reads their measured rectangles relative to the positioned
 * content wrapper, then folds them into one rectangle per span via `spanBBox`.
 * Positions are recomputed on the wrapper's ResizeObserver, once fonts finish
 * loading, and on scroll, so the relation-arc overlay stays aligned with the
 * text as it reflows.
 *
 * @module
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { spanBBox, type Rect, type TextSpan, type TokenRectMap } from '@/lib/spans'

/** Serializes a positions map so redundant recomputes do not trigger re-renders. */
function signatureOf(positions: Map<string, Rect>): string {
  const parts: string[] = []
  for (const [id, rect] of positions) {
    parts.push(`${id}:${rect.x},${rect.y},${rect.width},${rect.height}`)
  }
  return parts.sort().join('|')
}

/**
 * Computes a map from span id to bounding rectangle.
 *
 * @param containerRef - ref to the positioned content wrapper holding the tokens
 * @param spans - the spans to position
 * @returns a map from span id to its enclosing rectangle in content space
 */
export function useSpanPositions(
  containerRef: React.RefObject<HTMLElement>,
  spans: TextSpan[],
): Map<string, Rect> {
  const [positions, setPositions] = useState<Map<string, Rect>>(() => new Map())
  const signatureRef = useRef('')

  const recompute = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const tokenRects: TokenRectMap = new Map()
    container.querySelectorAll<HTMLElement>('[data-token]').forEach((node) => {
      const key = node.getAttribute('data-key')
      if (!key) return
      const rect = node.getBoundingClientRect()
      tokenRects.set(key, {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
      })
    })

    const next = new Map<string, Rect>()
    for (const span of spans) {
      const bbox = spanBBox(span.id, spans, tokenRects)
      if (bbox) next.set(span.id, bbox)
    }

    const signature = signatureOf(next)
    if (signature === signatureRef.current) return
    signatureRef.current = signature
    setPositions(next)
  }, [containerRef, spans])

  useLayoutEffect(() => {
    recompute()
  }, [recompute])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => recompute())
    observer.observe(container)

    const onScroll = () => recompute()
    window.addEventListener('scroll', onScroll, true)

    let cancelled = false
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (fonts?.ready) {
      fonts.ready.then(() => {
        if (!cancelled) recompute()
      })
    }

    return () => {
      cancelled = true
      observer.disconnect()
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [containerRef, recompute])

  return positions
}
