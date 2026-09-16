/**
 * The event stream a running tour emits. `TourRunner` calls the caller's
 * `onEvent` with one of these for every meaningful transition, so a host can
 * drive telemetry, analytics, or test assertions without reaching into the
 * runner's internals.
 */

import type { AnchorId } from './anchorCatalog'

/** Why a tour stopped: the visitor reached the end, or left before it. */
export type TourCloseReason = 'completed' | 'abandoned'

/** One thing that happened while a tour ran. */
export type TourEvent =
  | { type: 'started'; tourId: string }
  | { type: 'step_entered'; index: number; total: number; anchorId: AnchorId; route?: string }
  | { type: 'anchor_resolved'; anchorId: AnchorId }
  | { type: 'anchor_missing'; anchorId: AnchorId }
  | { type: 'driver_started'; capability: string }
  | { type: 'driver_done'; capability: string }
  | { type: 'driver_error'; capability: string; message: string }
  | { type: 'action_simulated'; action: string }
  | { type: 'step_advanced'; from: number; to: number; via: 'click' | 'next' | 'back' | 'skip' }
  | { type: 'finished'; reason: TourCloseReason }
