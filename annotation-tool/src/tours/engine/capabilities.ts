/**
 * The capability registry: the named side-effects a tour step's `driver` can
 * invoke to put the workspace into the state a step needs (seed an annotation,
 * open a fixture, advance a model run). A capability is keyed by id and called
 * with a `TourCapabilityContext` plus the step's opaque `params`.
 *
 * A capability receives navigation, the live `AnchorRegistry`, an anchor lookup,
 * and a `sleep` it can await, so it can drive the app the same way the runner
 * does. Registration is module-level: a host registers its capabilities once,
 * and the runner resolves a step's `driver.capability` against this map.
 */

import type { AnchorId } from './anchorCatalog'
import type { AnchorRegistry } from './anchorRegistry'

/** What a capability is handed when it runs. */
export interface TourCapabilityContext {
  /** Navigate the app to a route path. */
  navigate: (path: string) => void
  /** The shared anchor registry for the running tour. */
  registry: AnchorRegistry
  /** The live element registered for an anchor, or null. */
  getAnchor: (id: AnchorId) => HTMLElement | null
  /** Resolve after `ms` milliseconds. */
  sleep: (ms: number) => Promise<void>
}

/** A named side-effect a step's `driver` runs before its anchor resolves. */
export type TourCapability = (
  ctx: TourCapabilityContext,
  params?: Record<string, unknown>,
) => Promise<void>

const capabilities = new Map<string, TourCapability>()

/** Register `fn` under `id`, replacing any capability already registered there. */
export function registerCapability(id: string, fn: TourCapability): void {
  capabilities.set(id, fn)
}

/** The capability registered for `id`, or undefined. */
export function getCapability(id: string): TourCapability | undefined {
  return capabilities.get(id)
}

/** Whether a capability is registered for `id`. */
export function hasCapability(id: string): boolean {
  return capabilities.has(id)
}
