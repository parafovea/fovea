/**
 * The anchor registry: a per-app store mapping each tour `AnchorId` to the live
 * DOM element a component currently holds for it.
 *
 * A component publishes its element with `useTourAnchor(id)`, spreading the
 * returned ref onto the node. The element registers in the same commit it
 * mounts and unregisters when it unmounts, so a consumer always sees the element
 * exactly while it is on screen. The engine reads a step's anchor with
 * `useAnchorElement(id)`, which re-renders when that anchor's element appears,
 * disappears, or swaps. The anchor inspector reads `snapshot()` to list what is
 * currently registered.
 */
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import type { AnchorId } from './anchorCatalog'

type RegistryListener = (id: AnchorId) => void

/** Holds the element for each registered anchor and notifies subscribers on change. */
export class AnchorRegistry {
  private readonly elements = new Map<AnchorId, HTMLElement>()
  private readonly listeners = new Set<RegistryListener>()

  /** Publish `element` as the live node for `id`. */
  register(id: AnchorId, element: HTMLElement): void {
    this.elements.set(id, element)
    this.notify(id)
  }

  /** Remove the element for `id`. */
  unregister(id: AnchorId): void {
    if (this.elements.delete(id)) this.notify(id)
  }

  /** The element currently registered for `id`, or null. */
  get(id: AnchorId): HTMLElement | null {
    return this.elements.get(id) ?? null
  }

  /** Subscribe to registrations; the listener receives the changed id. Returns an unsubscribe. */
  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** A copy of the currently registered anchors, for the inspector and tests. */
  snapshot(): Map<AnchorId, HTMLElement> {
    return new Map(this.elements)
  }

  private notify(id: AnchorId): void {
    for (const listener of this.listeners) listener(id)
  }
}

const AnchorRegistryContext = createContext<AnchorRegistry | null>(null)

/** Provides one `AnchorRegistry` to the subtree; the engine and every anchored component share it. */
export function AnchorRegistryProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => new AnchorRegistry(), [])
  return <AnchorRegistryContext.Provider value={registry}>{children}</AnchorRegistryContext.Provider>
}

/** The registry for the current subtree. Throws when used outside an `AnchorRegistryProvider`. */
export function useAnchorRegistry(): AnchorRegistry {
  const registry = useContext(AnchorRegistryContext)
  if (!registry) throw new Error('Tour anchors require an <AnchorRegistryProvider> ancestor.')
  return registry
}

/**
 * Register the calling component's element as the anchor `id`. Spread the
 * returned ref onto the node the engine should spotlight; it registers on mount
 * and unregisters on unmount. The element also carries a `data-tour-anchor`
 * attribute holding the id, so the anchor inspector and tests can locate it.
 *
 * The provider is optional here: a component anchored for tours renders fine
 * outside an `AnchorRegistryProvider` (an isolated unit test, or any tree with
 * no tours mounted), where the ref tags the element but registers nothing.
 */
export function useTourAnchor(id: AnchorId): (element: HTMLElement | null) => void {
  const registry = useContext(AnchorRegistryContext)
  return useCallback(
    (element: HTMLElement | null) => {
      if (element) {
        element.setAttribute('data-tour-anchor', id)
        registry?.register(id, element)
      } else {
        registry?.unregister(id)
      }
    },
    [registry, id],
  )
}

/**
 * The element registered for `id`, re-rendering the caller whenever it changes.
 * Resolves to null outside an `AnchorRegistryProvider`.
 */
export function useAnchorElement(id: AnchorId): HTMLElement | null {
  const registry = useContext(AnchorRegistryContext)
  return useSyncExternalStore(
    useCallback(
      (notify: () => void) => {
        if (!registry) return () => {}
        return registry.subscribe((changedId) => {
          if (changedId === id) notify()
        })
      },
      [registry, id],
    ),
    () => registry?.get(id) ?? null,
  )
}
