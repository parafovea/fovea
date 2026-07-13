/**
 * React context and selector hooks for the instance-scoped span annotator
 * store.
 *
 * Split out from `SpanAnnotatorStoreProvider.tsx` so that file exports React
 * components only (otherwise the Vite react-refresh plugin warns and Fast
 * Refresh stops working in dev for that module). Consumers read slices with
 * `useSpanAnnotatorStore(selector)`, which subscribes to the nearest
 * provider's store via zustand's `useStore`.
 *
 * @module
 */

import { createContext, useContext } from 'react'
import { useStore } from 'zustand'

import type { SpanAnnotatorState, SpanAnnotatorStore } from '@store/zustand/createSpanAnnotatorStore'

/** Context carrying the nearest annotator's vanilla store, or `null` outside a provider. */
export const SpanAnnotatorStoreContext = createContext<SpanAnnotatorStore | null>(null)

/**
 * Reads a slice of the nearest annotator store.
 *
 * @param selector - projects the piece of state the caller needs
 * @returns the selected slice, re-rendering when it changes
 * @throws {Error} when called outside a `SpanAnnotatorStoreProvider`
 *
 * @example
 * ```typescript
 * const activeSpanId = useSpanAnnotatorStore((s) => s.activeSpanId)
 * ```
 */
export function useSpanAnnotatorStore<T>(selector: (state: SpanAnnotatorState) => T): T {
  const store = useContext(SpanAnnotatorStoreContext)
  if (!store) {
    throw new Error('useSpanAnnotatorStore must be used within a SpanAnnotatorStoreProvider')
  }
  return useStore(store, selector)
}

/**
 * Returns the nearest annotator store instance itself.
 *
 * Useful for reading state imperatively (via `store.getState()`) inside event
 * handlers that should not subscribe to updates.
 *
 * @returns the vanilla store api
 * @throws {Error} when called outside a `SpanAnnotatorStoreProvider`
 */
export function useSpanAnnotatorStoreApi(): SpanAnnotatorStore {
  const store = useContext(SpanAnnotatorStoreContext)
  if (!store) {
    throw new Error('useSpanAnnotatorStoreApi must be used within a SpanAnnotatorStoreProvider')
  }
  return store
}
