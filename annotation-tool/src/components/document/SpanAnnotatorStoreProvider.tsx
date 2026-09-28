/**
 * React context provider for the instance-scoped span annotator store.
 *
 * The provider mints one vanilla store per mount (see
 * `createSpanAnnotatorStore`) so the span annotator can appear twice on a page
 * without the two copies sharing selection or relation-builder state. Consumers
 * read slices with `useSpanAnnotatorStore(selector)` from
 * `./spanAnnotatorStoreContext`, which subscribes to the nearest provider's
 * store via zustand's `useStore`.
 *
 * @module
 */

import { useRef } from 'react'

import { createSpanAnnotatorStore, type SpanAnnotatorStore } from '@store/zustand/createSpanAnnotatorStore'

import { SpanAnnotatorStoreContext } from './spanAnnotatorStoreContext'

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
