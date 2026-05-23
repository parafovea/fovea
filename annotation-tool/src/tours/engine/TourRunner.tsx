/**
 * TourRunner — top-level component that orchestrates a single tour.
 *
 * Concerns:
 *   - Resolves the current step's anchor (with `waitForAnchor`'s 3 s
 *     ceiling so the UI never hangs).
 *   - Renders the `SpotlightOverlay` and the `StepCard`.
 *   - Persists the cursor in sessionStorage so a soft route navigation
 *     mid-tour doesn't drop the user (tours 8 and 9 cross routes).
 *   - Emits telemetry hooks the caller can wire up (tour_started,
 *     tour_step_viewed, tour_completed, tour_abandoned).
 *
 * Designed so the engine itself is policy-free — anchored vs fixture
 * mode is decided by the caller (TourMenu / demo-mode landing), and the
 * runner just executes the script it was handed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SpotlightOverlay } from './SpotlightOverlay'
import { StepCard } from './StepCard'
import { waitForAnchor } from './waitForAnchor'
import type { TourScript } from './types'

export type TourTelemetryEvent =
  | { kind: 'started'; tourId: string }
  | { kind: 'step_viewed'; tourId: string; stepIndex: number; dwellMs: number }
  | { kind: 'completed'; tourId: string; totalMs: number }
  | {
      kind: 'abandoned'
      tourId: string
      lastStepIndex: number
      reason: 'manual_exit' | 'idle' | 'error'
    }

export interface TourRunnerProps {
  tour: TourScript
  onClose: (reason: 'completed' | 'abandoned') => void
  onTelemetry?: (e: TourTelemetryEvent) => void
  /** Default modal behavior for steps that don't set `modal` themselves. */
  defaultModal?: boolean
}

const STORAGE_KEY = 'fovea.tour.cursor'

export function TourRunner({
  tour,
  onClose,
  onTelemetry,
  defaultModal = true,
}: TourRunnerProps) {
  const [stepIndex, setStepIndex] = useState(() => readCursor(tour.id) ?? 0)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [resolving, setResolving] = useState(true)
  const tourStartedAt = useMemo(() => performance.now(), [])
  const [stepEnteredAt, setStepEnteredAt] = useState(performance.now())

  const step = tour.steps[stepIndex]
  const modal = step?.modal ?? defaultModal

  // Resolve anchor whenever step changes; cancel on the next change.
  useEffect(() => {
    if (!step) return undefined
    const ac = new AbortController()
    setAnchor(null)
    setResolving(true)
    waitForAnchor(step.anchor, ac.signal).then((el) => {
      if (ac.signal.aborted) return
      setAnchor(el)
      setResolving(false)
    })
    return () => ac.abort()
  }, [step?.anchor, step])

  // Persist cursor + emit step_viewed telemetry.
  useEffect(() => {
    writeCursor(tour.id, stepIndex)
    setStepEnteredAt(performance.now())
    onTelemetry?.({ kind: 'started', tourId: tour.id })
    // step_viewed gets emitted on step *exit* below, with dwell.
    // The outer started event is idempotent enough that re-emitting on
    // resume from sessionStorage is acceptable telemetry noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = useCallback(
    (reason: 'completed' | 'abandoned') => {
      clearCursor(tour.id)
      if (reason === 'completed') {
        onTelemetry?.({
          kind: 'completed',
          tourId: tour.id,
          totalMs: performance.now() - tourStartedAt,
        })
      } else {
        onTelemetry?.({
          kind: 'abandoned',
          tourId: tour.id,
          lastStepIndex: stepIndex,
          reason: 'manual_exit',
        })
      }
      onClose(reason)
    },
    [onClose, onTelemetry, stepIndex, tour.id, tourStartedAt],
  )

  const move = useCallback(
    (delta: number) => {
      if (!step) return
      const dwellMs = performance.now() - stepEnteredAt
      onTelemetry?.({ kind: 'step_viewed', tourId: tour.id, stepIndex, dwellMs })
      const next = stepIndex + delta
      if (next < 0) return
      if (next >= tour.steps.length) {
        finish('completed')
        return
      }
      setStepIndex(next)
      writeCursor(tour.id, next)
    },
    [finish, onTelemetry, step, stepEnteredAt, stepIndex, tour.id, tour.steps.length],
  )

  if (!step) return null

  return (
    <>
      <SpotlightOverlay target={anchor} modal={modal} />
      <StepCard
        tour={tour}
        stepIndex={stepIndex}
        anchor={anchor}
        resolving={resolving}
        onBack={() => move(-1)}
        onNext={() => move(+1)}
        onSkipStep={() => move(+1)}
        onSkipTour={() => finish('abandoned')}
        onRestart={() => {
          setStepIndex(0)
          writeCursor(tour.id, 0)
        }}
      />
    </>
  )
}

function readCursor(tourId: string): number | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { tourId: string; stepIndex: number }
    return parsed.tourId === tourId ? parsed.stepIndex : null
  } catch {
    return null
  }
}

function writeCursor(tourId: string, stepIndex: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tourId, stepIndex }))
  } catch {
    // sessionStorage can throw in private mode; cursor persistence is
    // best-effort, not load-bearing.
  }
}

function clearCursor(tourId: string) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { tourId: string }
    if (parsed.tourId === tourId) sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // see writeCursor
  }
}
