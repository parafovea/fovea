/**
 * Tests for the token-selection pointer handlers.
 *
 * A fast drag schedules its selection updates on animation frames. When the
 * pointer is released while a frame is still pending, the release must still be
 * applied so the final token of the drag lands in the committed selection rather
 * than being dropped with the canceled frame.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode, type RefObject } from 'react'

import {
  createSpanAnnotatorStore,
  type SpanAnnotatorStore,
} from '@store/zustand/createSpanAnnotatorStore'

import { SpanAnnotatorStoreContext } from '../spanAnnotatorStoreContext'
import { useTokenSelection } from './useTokenSelection'

const ELEMENT_NAME = 'text'
const TOKEN_COUNT = 6

let tokenEls: HTMLElement[] = []
let capturedFrame: FrameRequestCallback | null = null
let originalElementFromPoint: typeof document.elementFromPoint

/** Builds a synthetic React pointer event carrying only the fields the handlers read. */
function pointerEvent(
  target: Element | null,
  clientX: number,
  overrides: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {},
) {
  return {
    target,
    pointerId: 1,
    clientX,
    clientY: 0,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault: () => {},
    ...overrides,
  } as unknown as React.PointerEvent
}

beforeEach(() => {
  // One token per integer x-coordinate, so document.elementFromPoint(x) resolves
  // the token whose index equals x.
  tokenEls = []
  for (let i = 0; i < TOKEN_COUNT; i += 1) {
    const el = document.createElement('span')
    el.setAttribute('data-token', '')
    el.setAttribute('data-el', ELEMENT_NAME)
    el.setAttribute('data-idx', String(i))
    el.setAttribute('data-key', `${ELEMENT_NAME}:${i}`)
    document.body.appendChild(el)
    tokenEls.push(el)
  }

  originalElementFromPoint = document.elementFromPoint
  document.elementFromPoint = ((x: number) => tokenEls[Math.round(x)] ?? null) as typeof document.elementFromPoint

  // Capture (but do not run) the scheduled frame, so a drag's update can be left
  // pending when the pointer is released.
  capturedFrame = null
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      capturedFrame = cb
      return 1
    }),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  for (const el of tokenEls) el.remove()
  tokenEls = []
  document.elementFromPoint = originalElementFromPoint
  vi.unstubAllGlobals()
})

/** Renders the hook against a fresh store and returns the handlers, store, and container ref. */
function renderTokenSelection() {
  const store: SpanAnnotatorStore = createSpanAnnotatorStore()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const containerRef: RefObject<HTMLElement> = { current: container }

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(SpanAnnotatorStoreContext.Provider, { value: store }, children)

  const { result } = renderHook(() => useTokenSelection(containerRef), { wrapper })
  return { handlers: result.current, store, container }
}

describe('useTokenSelection', () => {
  it('commits the release token of a fast drag whose final frame is still pending', () => {
    const { handlers, store } = renderTokenSelection()

    act(() => {
      handlers.onPointerDown(pointerEvent(tokenEls[0], 0))
    })
    // Down begins the plain-drag gesture on the first token.
    expect(store.getState().committedSelection).toEqual({ [ELEMENT_NAME]: [0] })

    act(() => {
      handlers.onPointerMove(pointerEvent(null, TOKEN_COUNT - 1))
    })
    // The move only schedules a frame; the run has not been committed yet.
    expect(capturedFrame).not.toBeNull()
    expect(store.getState().committedSelection).toEqual({ [ELEMENT_NAME]: [0] })

    act(() => {
      handlers.onPointerUp(pointerEvent(null, TOKEN_COUNT - 1))
    })

    // Release applies the pending position synchronously, so the whole drag range
    // — including the release token (index 5) — is committed.
    expect(store.getState().committedSelection).toEqual({
      [ELEMENT_NAME]: [0, 1, 2, 3, 4, 5],
    })
    // The committed selection opens the label picker rather than being discarded.
    expect(store.getState().pendingLabelSpanDraft).not.toBeNull()
    expect(store.getState().gestureInProgress).toBe(false)
  })

  it('commits a single-token click with no intervening move', () => {
    const { handlers, store } = renderTokenSelection()

    act(() => {
      handlers.onPointerDown(pointerEvent(tokenEls[2], 2))
    })
    act(() => {
      handlers.onPointerUp(pointerEvent(null, 2))
    })

    expect(store.getState().committedSelection).toEqual({ [ELEMENT_NAME]: [2] })
    expect(store.getState().pendingLabelSpanDraft).not.toBeNull()
  })
})
