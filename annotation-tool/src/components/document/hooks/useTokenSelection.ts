/**
 * Delegated pointer handlers that turn token clicks and drags into a committed
 * selection, then open the label picker.
 *
 * Three gestures are supported: a plain drag selects a contiguous run; a
 * shift-click (or shift-drag) extends a range onto the existing selection; a
 * ctrl/cmd-click toggles a single disjoint token into the accumulating
 * selection (the discontiguous gap-closer). The drag path is throttled to one
 * update per animation frame, and only the committed endpoints are written to
 * the store. On pointer release the selection is grouped into segments via
 * `selectionToSegments` and the label picker is opened at the selection's box.
 *
 * @module
 */

import { useCallback, useEffect, useRef } from 'react'

import { selectionToSegments, tokenKey, type Rect, type TokenSelection } from '@/lib/spans'

import { useSpanAnnotatorStoreApi } from '../spanAnnotatorStoreContext'

/** The container-level pointer handlers returned by {@link useTokenSelection}. */
export interface TokenSelectionHandlers {
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: (event: React.PointerEvent) => void
}

/** The kind of selection gesture in progress. */
type GestureMode = 'plain' | 'range' | 'toggle'

/** A committed per-element index set. */
type Selection = Record<string, number[]>

/** Resolves the token a DOM node belongs to, or `null` when it is outside any token. */
export function tokenFromNode(node: Element | null): TokenSelection | null {
  const tokenEl = node?.closest?.('[data-token]') ?? null
  if (!tokenEl) return null
  const elementName = tokenEl.getAttribute('data-el')
  const indexAttr = tokenEl.getAttribute('data-idx')
  if (elementName == null || indexAttr == null) return null
  const tokenIndex = Number(indexAttr)
  if (!Number.isInteger(tokenIndex)) return null
  return { elementName, tokenIndex }
}

/** Builds the inclusive integer run between two indexes. */
function runBetween(a: number, b: number): number[] {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const out: number[] = []
  for (let i = lo; i <= hi; i += 1) out.push(i)
  return out
}

/** Unions a run of indexes into an element's slot of a selection, returning a new selection. */
function unionRun(baseline: Selection, elementName: string, run: number[]): Selection {
  const merged: Selection = { ...baseline }
  const set = new Set(merged[elementName] ?? [])
  for (const index of run) set.add(index)
  merged[elementName] = [...set].sort((a, b) => a - b)
  return merged
}

/** Flattens a per-element selection into flat token picks. */
function flatten(selection: Selection): TokenSelection[] {
  const out: TokenSelection[] = []
  for (const [elementName, indexes] of Object.entries(selection)) {
    for (const tokenIndex of indexes) out.push({ elementName, tokenIndex })
  }
  return out
}

/** Whether a selection holds at least one token. */
function hasTokens(selection: Selection): boolean {
  return Object.values(selection).some((indexes) => indexes.length > 0)
}

/** Computes a selection's bounding box in the coordinate space of `container`. */
function selectionBBox(container: HTMLElement, selection: Selection): Rect | null {
  const containerRect = container.getBoundingClientRect()
  let minLeft = Number.POSITIVE_INFINITY
  let minTop = Number.POSITIVE_INFINITY
  let maxRight = Number.NEGATIVE_INFINITY
  let maxBottom = Number.NEGATIVE_INFINITY

  for (const { elementName, tokenIndex } of flatten(selection)) {
    const node = container.querySelector<HTMLElement>(
      `[data-token][data-key="${tokenKey(elementName, tokenIndex)}"]`,
    )
    if (!node) continue
    const rect = node.getBoundingClientRect()
    minLeft = Math.min(minLeft, rect.left - containerRect.left)
    minTop = Math.min(minTop, rect.top - containerRect.top)
    maxRight = Math.max(maxRight, rect.right - containerRect.left)
    maxBottom = Math.max(maxBottom, rect.bottom - containerRect.top)
  }

  if (minLeft === Number.POSITIVE_INFINITY) return null
  return { x: minLeft, y: minTop, width: maxRight - minLeft, height: maxBottom - minTop }
}

/**
 * Wires token selection onto a container element.
 *
 * The returned handlers must be spread onto the same element that renders the
 * tokens (each token carrying `data-token`, `data-el`, `data-idx`, and
 * `data-key`). The container itself is used for pointer capture and for
 * measuring the selection box, so it should be the positioned content wrapper.
 *
 * @param containerRef - ref to the token content wrapper
 * @returns pointer handlers to spread onto the container
 */
export function useTokenSelection(
  containerRef: React.RefObject<HTMLElement>,
): TokenSelectionHandlers {
  const storeApi = useSpanAnnotatorStoreApi()

  const modeRef = useRef<GestureMode>('plain')
  const baselineRef = useRef<Selection>({})
  const rafRef = useRef<number | null>(null)
  const pointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const token = tokenFromNode(event.target as Element)
      if (!token) return
      event.preventDefault()

      const container = containerRef.current
      const store = storeApi.getState()
      const baseline = store.committedSelection
      baselineRef.current = baseline

      try {
        container?.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is best-effort; measurement still works without it.
      }

      if (event.shiftKey) {
        modeRef.current = 'range'
        const anchor =
          store.gestureAnchor ?? { elementName: token.elementName, tokenIndex: token.tokenIndex }
        const run = runBetween(anchor.tokenIndex, token.tokenIndex)
        store.setSelection(unionRun(baseline, token.elementName, run))
        store.setGesture(true, anchor)
        return
      }

      if (event.metaKey || event.ctrlKey) {
        modeRef.current = 'toggle'
        const set = new Set(baseline[token.elementName] ?? [])
        if (set.has(token.tokenIndex)) set.delete(token.tokenIndex)
        else set.add(token.tokenIndex)
        const merged: Selection = { ...baseline }
        if (set.size > 0) merged[token.elementName] = [...set].sort((a, b) => a - b)
        else delete merged[token.elementName]
        store.setSelection(merged)
        store.setGesture(true, token)
        return
      }

      modeRef.current = 'plain'
      store.setSelection({ [token.elementName]: [token.tokenIndex] })
      store.setGesture(true, token)
    },
    [containerRef, storeApi],
  )

  const processMove = useCallback(() => {
    rafRef.current = null
    const point = pointRef.current
    if (!point) return
    const store = storeApi.getState()
    if (!store.gestureInProgress) return
    const mode = modeRef.current
    if (mode === 'toggle') return

    const token = tokenFromNode(document.elementFromPoint(point.x, point.y))
    const anchor = store.gestureAnchor
    if (!token || !anchor || token.elementName !== anchor.elementName) return

    const run = runBetween(anchor.tokenIndex, token.tokenIndex)
    if (mode === 'plain') {
      store.setSelection({ [anchor.elementName]: run })
    } else {
      store.setSelection(unionRun(baselineRef.current, anchor.elementName, run))
    }
  }, [storeApi])

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!storeApi.getState().gestureInProgress) return
      if (modeRef.current === 'toggle') return
      pointRef.current = { x: event.clientX, y: event.clientY }
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(processMove)
      }
    },
    [processMove, storeApi],
  )

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const store = storeApi.getState()
      if (!store.gestureInProgress) return

      const container = containerRef.current
      try {
        container?.releasePointerCapture(event.pointerId)
      } catch {
        // Ignore: capture may have been dropped already.
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      store.setGesture(false)

      const selection = store.committedSelection
      if (!hasTokens(selection)) {
        store.closeLabelDraft()
        return
      }

      const segments = selectionToSegments(flatten(selection))
      const bbox = container ? selectionBBox(container, selection) : null
      store.openLabelDraft({ segments, bbox })
    },
    [containerRef, storeApi],
  )

  return { onPointerDown, onPointerMove, onPointerUp }
}
