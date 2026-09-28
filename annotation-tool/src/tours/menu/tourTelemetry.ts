/**
 * The analytics view of a running tour: a compact event log a host exposes for
 * product analytics (the demo build's `/api/telemetry` sink) and for E2E.
 *
 * The runner emits low-level `TourEvent`s (started, step_entered, finished). This
 * adapter folds those into the four analytics events a consumer reasons over:
 *   - `started`     once per run, with the tour id.
 *   - `step_viewed` when a step is left, carrying that step's index and the dwell
 *                   time spent on it.
 *   - `completed`   when the visitor reaches the end, with the total run time.
 *   - `abandoned`   when the run ends early, with the reason (a manual exit or a
 *                   pause) and the index the visitor was on.
 *
 * A run closes exactly once: the first `completed`/`manual_exit`/`pause` wins, so
 * a double Escape or a double pause records a single terminal event.
 */

import type { TourEvent } from '../engine'

/** One analytics event about a tour run. */
export interface TourTelemetryEvent {
  kind: 'started' | 'step_viewed' | 'completed' | 'abandoned'
  tourId: string
  /** The step a `step_viewed` reports on. */
  stepIndex?: number
  /** The step the visitor was on when an `abandoned` run ended. */
  lastStepIndex?: number
  /** Why an `abandoned` run ended. */
  reason?: 'manual_exit' | 'pause'
  /** Milliseconds spent on the step a `step_viewed` reports. */
  dwellMs?: number
  /** Milliseconds from launch to a `completed` run. */
  totalMs?: number
}

/** How a run terminated, for `close`. */
export type TourCloseKind = 'completed' | 'manual_exit' | 'pause'

/**
 * Folds a tour's `TourEvent` stream into analytics events. One instance backs a
 * provider for the life of the page; `clear` resets it between E2E assertions.
 */
export class TourTelemetry {
  /** The analytics log, in emission order. */
  readonly events: TourTelemetryEvent[] = []

  private tourId = ''
  private startMs = 0
  private lastIndex: number | null = null
  private enterMs = 0
  private closed = false
  private readonly now: () => number

  /** `now` is injectable so tests can drive deterministic dwell and total times. */
  constructor(now: () => number = () => performance.now()) {
    this.now = now
  }

  /** Fold one runner event into the analytics log. */
  ingest(event: TourEvent): void {
    switch (event.type) {
      case 'started':
        this.tourId = event.tourId
        this.startMs = this.now()
        this.lastIndex = null
        this.closed = false
        this.events.push({ kind: 'started', tourId: this.tourId })
        return
      case 'step_entered': {
        if (this.lastIndex !== null && event.index !== this.lastIndex) {
          this.events.push({
            kind: 'step_viewed',
            tourId: this.tourId,
            stepIndex: this.lastIndex,
            dwellMs: Math.max(1, Math.round(this.now() - this.enterMs)),
          })
        }
        this.lastIndex = event.index
        this.enterMs = this.now()
        return
      }
      case 'finished':
        this.close(event.reason === 'completed' ? 'completed' : 'manual_exit')
        return
      default:
        return
    }
  }

  /**
   * Record how a run ended. Covers terminations that do not flow through a
   * `finished` event (a pause unmounts the runner directly). Idempotent: only the
   * first close of a run is recorded.
   */
  close(kind: TourCloseKind): void {
    if (this.closed) return
    this.closed = true
    if (kind === 'completed') {
      this.events.push({
        kind: 'completed',
        tourId: this.tourId,
        totalMs: Math.max(1, Math.round(this.now() - this.startMs)),
      })
      return
    }
    this.events.push({
      kind: 'abandoned',
      tourId: this.tourId,
      reason: kind,
      lastStepIndex: this.lastIndex ?? 0,
    })
  }

  /** Drop every recorded event and reset run state. */
  clear(): void {
    this.events.length = 0
    this.lastIndex = null
    this.closed = false
  }
}
