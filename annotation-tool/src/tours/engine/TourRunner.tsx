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
 *   - Keyboard navigation: ←/→ to move between steps, Esc to exit. We
 *     wire these at the window level (capture phase) so they work even
 *     when focus is somewhere in the underlying workspace — at a CVPR
 *     booth, attendees click on the highlighted UI mid-step and Esc
 *     should still bail them out.
 *   - Step-card focus management: focus lands on the card when a step
 *     enters so screen readers announce it and keyboard users can tab
 *     to Next without clicking. We capture the previously-focused element
 *     and restore it when the tour exits.
 *   - Auto-advance on `expectAction='click'`: when the highlighted target
 *     receives a real click, we move to the next step automatically. This
 *     is what makes tours feel guided instead of read-and-press-Next.
 *
 * Designed so the engine itself is policy-free — anchored vs fixture
 * mode is decided by the caller (TourMenu / demo-mode landing), and the
 * runner just executes the script it was handed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
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
  /**
   * Element to restore focus to on tour exit. Captured by the caller
   * (TourProvider.launch) BEFORE the runner mounts, so a re-render
   * between the user's click and the runner's first render can't poison
   * the target with whatever stole focus in the gap.
   */
  restoreFocusTo?: HTMLElement | null
  /**
   * Pause request. The provider captures (tour, stepIndex, route) so the
   * visitor can wander off-tour and resume via a floating pill. Unlike
   * onClose, pausing keeps the cursor alive in sessionStorage and the
   * tour's place in the script.
   */
  onPause?: (stepIndex: number) => void
}

const STORAGE_KEY = 'fovea.tour.cursor'

export function TourRunner({
  tour,
  onClose,
  onTelemetry,
  defaultModal = true,
  restoreFocusTo,
  onPause,
}: TourRunnerProps) {
  const [stepIndex, setStepIndex] = useState(() => {
    const restored = readCursor(tour.id)
    if (restored == null) return 0
    // Clamp restored cursor to the tour length in case the script shrank
    // between sessions (rare, but defensive).
    return Math.max(0, Math.min(restored, tour.steps.length - 1))
  })
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [resolving, setResolving] = useState(true)
  const tourStartedAtRef = useRef(performance.now())
  const stepEnteredAtRef = useRef(performance.now())
  // Prefer the caller's pre-captured target (TourProvider.launch grabs
  // it synchronously at the click site). Fall back to the render-phase
  // activeElement so direct callers that don't pass the prop still get
  // a reasonable best-effort restore.
  const previouslyFocusedRef = useRef<HTMLElement | null>(
    restoreFocusTo ??
      (typeof document === 'undefined'
        ? null
        : (document.activeElement as HTMLElement | null)),
  )
  // Idempotency guard for the started-telemetry event — React 18
  // StrictMode dev mode runs effects twice, so without this guard the
  // event would emit twice per launch in dev (and the tests asserting
  // "fires once" would fail). The guard is harmless in production.
  const startedFiredRef = useRef(false)

  const step = tour.steps[stepIndex]
  const modal = step?.modal ?? defaultModal
  const totalSteps = tour.steps.length

  // Emit started once per tour-runner lifetime, guarded against
  // StrictMode's intentional double-effect in dev. Focus restoration
  // happens in the cleanup leg here — the *capture* of which element to
  // restore to lives in the useRef initializer above, so children's
  // autofocus effects don't clobber it.
  useEffect(() => {
    if (!startedFiredRef.current) {
      startedFiredRef.current = true
      onTelemetry?.({ kind: 'started', tourId: tour.id })
    }
    return () => {
      const prev = previouslyFocusedRef.current
      if (prev && document.contains(prev)) {
        try {
          prev.focus({ preventScroll: true })
        } catch {
          // Some elements can throw on focus when they've been moved
          // mid-route — ignore, the visitor isn't worse off than before.
        }
      }
    }
    // Effect intentionally runs once per tour lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resolve anchor whenever step changes; cancel on the next change. Reset
  // the dwell stopwatch on the same beat so per-step telemetry stays
  // accurate across navigation.
  useEffect(() => {
    if (!step) return undefined
    stepEnteredAtRef.current = performance.now()
    const ac = new AbortController()
    setAnchor(null)
    setResolving(true)
    waitForAnchor(step.anchor, ac.signal).then((el) => {
      if (ac.signal.aborted) return
      setAnchor(el)
      setResolving(false)
    })
    return () => ac.abort()
  }, [step])

  // Persist cursor whenever it changes.
  useEffect(() => {
    writeCursor(tour.id, stepIndex)
  }, [tour.id, stepIndex])

  const finish = useCallback(
    (reason: 'completed' | 'abandoned') => {
      clearCursor(tour.id)
      // Emit final step_viewed so dwell on the closing step isn't lost.
      onTelemetry?.({
        kind: 'step_viewed',
        tourId: tour.id,
        stepIndex,
        dwellMs: performance.now() - stepEnteredAtRef.current,
      })
      if (reason === 'completed') {
        onTelemetry?.({
          kind: 'completed',
          tourId: tour.id,
          totalMs: performance.now() - tourStartedAtRef.current,
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
    [onClose, onTelemetry, stepIndex, tour.id],
  )

  const move = useCallback(
    (delta: number) => {
      if (!step) return
      const next = stepIndex + delta
      if (next < 0) return
      if (next >= totalSteps) {
        // finish() emits step_viewed for the closing step itself; don't
        // double-emit by also firing one here.
        finish('completed')
        return
      }
      onTelemetry?.({
        kind: 'step_viewed',
        tourId: tour.id,
        stepIndex,
        dwellMs: performance.now() - stepEnteredAtRef.current,
      })
      setStepIndex(next)
    },
    [finish, onTelemetry, step, stepIndex, totalSteps, tour.id],
  )

  // Keyboard navigation. We listen at the window level with `capture` so
  // the tour responds even when focus is inside an input inside the
  // highlighted control. Esc always exits; arrows move only when no text
  // input has focus (so typing in an input box doesn't jump steps).
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if ((el as HTMLElement).isContentEditable) return true
      return false
    }
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish('abandoned')
        return
      }
      if (isEditableTarget(event.target)) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault()
        move(+1)
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        move(-1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [finish, move])

  // Auto-advance on real user clicks against the spotlighted target when
  // the step declares expectAction='click'. We listen on the anchor with
  // capture so we observe the click before any of the underlying app
  // handlers cancel it — but we don't preventDefault, the click still
  // does whatever the underlying control does. We bind via a one-shot
  // listener so accidental double-clicks don't skip two steps.
  useEffect(() => {
    if (!anchor || step?.expectAction !== 'click') return undefined
    let fired = false
    function onClick() {
      if (fired) return
      fired = true
      // Defer one tick so the underlying click handler's work (open a
      // popover, etc.) lands before the tour swaps the spotlight to the
      // next anchor — otherwise the next anchor may not be mounted yet.
      window.setTimeout(() => move(+1), 0)
    }
    anchor.addEventListener('click', onClick, { capture: true, once: true })
    return () => anchor.removeEventListener('click', onClick, { capture: true } as EventListenerOptions)
  }, [anchor, step, move])

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
        onRestart={() => setStepIndex(0)}
        onPause={onPause ? () => onPause(stepIndex) : undefined}
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
