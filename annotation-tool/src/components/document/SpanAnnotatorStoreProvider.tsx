/**
 * React context provider and selector hook for the instance-scoped span
 * annotator store.
 *
 * The provider mints one vanilla store per mount (see
 * `createSpanAnnotatorStore`) so the span annotator can appear twice on a page
 * without the two copies sharing selection or relation-builder state. Consumers
 * read slices with `useSpanAnnotatorStore(selector)`, which subscribes to the
 * nearest provider's store via zustand's `useStore`.
 *
 * @module
 */

import { createContext, useContext, useRef } from 'react'
import { useStore } from 'zustand'

import { createSpanAnnotatorStore, type SpanAnnotatorState, type SpanAnnotatorStore } from '@store/zustand/createSpanAnnotatorStore'

/** Context carrying the nearest annotator's vanilla store, or `null` outside a provider. */
const SpanAnnotatorStoreContext = createContext<SpanAnnotatorStore | null>(null)

/**
 * Props for {@link SpanAnnotatorStoreProvider}.
 */
export interface SpanAnnotatorStoreProviderProps {
  /** The subtree that reads the annotator store. */
  children: React.ReactNode
}

/**
 * Provides a fresh span annotator store to its subtree.
 *
 * The store is created once per mount and held in a ref, so it survives
 * re-renders but is not shared with sibling providers. Mount this once around
 * each `SpanAnnotator` instance.
 *
 * @param props - the subtree to provide the store to
 * @returns the provider element wrapping its children
 */
export function SpanAnnotatorStoreProvider({
  children,
}: SpanAnnotatorStoreProviderProps): JSX.Element {
  const storeRef = useRef<SpanAnnotatorStore>()
  if (!storeRef.current) {
    storeRef.current = createSpanAnnotatorStore()
  }
  return (
    <SpanAnnotatorStoreContext.Provider value={storeRef.current}>
      {children}
    </SpanAnnotatorStoreContext.Provider>
  )
}

/**
 * Reads a slice of the nearest annotator store.
 *
 * @param selector - projects the piece of state the caller needs
 * @returns the selected slice, re-rendering when it changes
 * @throws {Error} when called outside a {@link SpanAnnotatorStoreProvider}
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
 * @throws {Error} when called outside a {@link SpanAnnotatorStoreProvider}
 */
export function useSpanAnnotatorStoreApi(): SpanAnnotatorStore {
  const store = useContext(SpanAnnotatorStoreContext)
  if (!store) {
    throw new Error('useSpanAnnotatorStoreApi must be used within a SpanAnnotatorStoreProvider')
  }
  return store
}
