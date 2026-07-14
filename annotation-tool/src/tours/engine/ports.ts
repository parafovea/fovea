/**
 * The pure helpers the runner composes to resolve a step: turning a route
 * template into a concrete path, and awaiting an anchor element through the
 * registry's subscription rather than polling the DOM.
 *
 * `resolveStepRoute` substitutes a step's `routeParams` into its `route`.
 * `waitForRegisteredAnchor` resolves the moment the registry holds an element
 * for the anchor, or null once a bounded wait elapses without it appearing; it
 * wakes on the registry's change notification and never polls.
 */

import type { AnchorId } from './anchorCatalog'
import type { AnchorRegistry } from './anchorRegistry'
import type { TourStep } from './tourSchema'

/**
 * Substitute a step's `routeParams` into its `route` template, returning the
 * concrete path React Router navigates to, or null when the step declares no
 * route. Throws when the template names a `:param` the step did not supply, so
 * an under-specified route fails loudly instead of navigating somewhere wrong.
 */
export function resolveStepRoute(step: TourStep): string | null {
  if (!step.route) return null
  const params = step.routeParams ?? {}
  return step.route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    const value = params[name]
    if (value === undefined) {
      throw new Error(
        `Tour step anchored on ${step.anchor} declares route ${step.route} but routeParams.${name} is missing.`,
      )
    }
    return encodeURIComponent(value)
  })
}

/**
 * Resolve with the element the registry holds for `id`, waiting for it to
 * register if it is not yet present. Wakes on the registry's change
 * notification for that id, so the moment a component publishes the anchor the
 * wait resolves; it never reads the DOM on a timer. Resolves with null when
 * `timeoutMs` elapses first, or when `signal` aborts. The returned cleanup
 * tears down the subscription and timer for callers that cancel before either.
 */
export function waitForRegisteredAnchor(
  registry: AnchorRegistry,
  id: AnchorId,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  resolve: (element: HTMLElement | null) => void,
): () => void {
  const existing = registry.get(id)
  if (existing) {
    resolve(existing)
    return () => {}
  }
  if (signal?.aborted) {
    resolve(null)
    return () => {}
  }

  let settled = false
  const finish = (element: HTMLElement | null) => {
    if (settled) return
    settled = true
    cleanup()
    resolve(element)
  }

  const unsubscribe = registry.subscribe((changedId) => {
    if (changedId !== id) return
    const element = registry.get(id)
    if (element) finish(element)
  })

  const timer = window.setTimeout(() => finish(null), timeoutMs)

  const onAbort = () => finish(null)
  signal?.addEventListener('abort', onAbort)

  function cleanup() {
    unsubscribe()
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }

  // The element may have registered between the initial get and the
  // subscription; re-read once so that race resolves immediately.
  const late = registry.get(id)
  if (late) finish(late)

  return () => finish(null)
}
