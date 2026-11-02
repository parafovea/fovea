/**
 * Verifies that `TourTelemetry` folds a runner's event stream into the analytics
 * events a consumer reads: one `started`, a `step_viewed` per step left carrying
 * that step's dwell, a `completed` with total time, or an `abandoned` with the
 * reason and last step. A run closes exactly once.
 */

import { describe, it, expect } from 'vitest'
import { TourTelemetry } from './tourTelemetry'
import type { TourEvent } from '../engine'

/** A `now` that advances 100 ms per read, so dwell and total times are deterministic. */
function steppingClock(): () => number {
  let t = 0
  return () => {
    t += 100
    return t
  }
}

const started: TourEvent = { type: 'started', tourId: 'first-annotation' }
const enter = (index: number): TourEvent => ({
  type: 'step_entered',
  index,
  total: 7,
  anchorId: 'app-shell',
})

describe('TourTelemetry', () => {
  it('records a single started event with the tour id', () => {
    const t = new TourTelemetry(steppingClock())
    t.ingest(started)
    expect(t.events).toEqual([{ kind: 'started', tourId: 'first-annotation' }])
  })

  it('emits a step_viewed for the prior step on each step change, with positive dwell', () => {
    const t = new TourTelemetry(steppingClock())
    t.ingest(started)
    t.ingest(enter(0))
    t.ingest(enter(1))
    t.ingest(enter(2))
    const viewed = t.events.filter((e) => e.kind === 'step_viewed')
    expect(viewed.map((e) => e.stepIndex)).toEqual([0, 1])
    expect(viewed.every((e) => (e.dwellMs ?? 0) > 0)).toBe(true)
  })

  it('records a completed event with positive total time on a finished-completed run', () => {
    const t = new TourTelemetry(steppingClock())
    t.ingest(started)
    t.ingest(enter(0))
    t.ingest({ type: 'finished', reason: 'completed' })
    const completed = t.events.find((e) => e.kind === 'completed')
    expect(completed?.tourId).toBe('first-annotation')
    expect(completed?.totalMs ?? 0).toBeGreaterThan(0)
  })

  it('records abandoned with reason=manual_exit and the last step on a finished-abandoned run', () => {
    const t = new TourTelemetry(steppingClock())
    t.ingest(started)
    t.ingest(enter(0))
    t.ingest(enter(1))
    t.ingest({ type: 'finished', reason: 'abandoned' })
    expect(t.events.find((e) => e.kind === 'abandoned')).toMatchObject({
      kind: 'abandoned',
      tourId: 'first-annotation',
      reason: 'manual_exit',
      lastStepIndex: 1,
    })
  })

  it('records abandoned with reason=pause when closed by a pause', () => {
    const t = new TourTelemetry(steppingClock())
    t.ingest(started)
    t.ingest(enter(0))
    t.ingest(enter(1))
    t.close('pause')
    expect(t.events.find((e) => e.kind === 'abandoned')).toMatchObject({
      reason: 'pause',
      lastStepIndex: 1,
    })
  })

  it('closes a run exactly once, so a double close records one terminal event', () => {
    const t = new TourTelemetry(steppingClock())
    t.ingest(started)
    t.ingest(enter(0))
    t.close('manual_exit')
    t.close('manual_exit')
    t.ingest({ type: 'finished', reason: 'completed' })
    expect(t.events.filter((e) => e.kind === 'abandoned' || e.kind === 'completed')).toHaveLength(1)
  })

  it('clear resets the log and run state', () => {
    const t = new TourTelemetry(steppingClock())
    t.ingest(started)
    t.ingest(enter(0))
    t.clear()
    expect(t.events).toEqual([])
    // A fresh run after clear records cleanly.
    t.ingest(started)
    expect(t.events).toEqual([{ kind: 'started', tourId: 'first-annotation' }])
  })
})
