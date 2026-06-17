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
import { useLocation, useNavigate } from 'react-router-dom'
import { SpotlightOverlay } from './SpotlightOverlay'
import { StepCard } from './StepCard'
import { waitForAnchor } from './waitForAnchor'
import { simulateAction } from './simulateAction'
import type { TourScript, TourStep } from './types'
import { config } from '@/config'

/**
 * Resolve a route template like `/app/annotate/:videoId` against a
 * routeParams object like `{ videoId: 'abc123' }` into a concrete
 * path the React Router navigate function accepts. Throws if the
 * template contains a `:param` without a matching key — tours must
 * declare their parameters to keep navigation deterministic. Returns
 * null when the step declares no route (engine stays put).
 */
function resolveStepRoute(step: TourStep | undefined): string | null {
  if (!step?.route) return null
  const params = step.routeParams ?? {}
  return step.route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    const value = params[name]
    if (value === undefined) {
      throw new Error(
        `[tour] step anchor=${step.anchor} declared route ${step.route} but routeParams.${name} is undefined`,
      )
    }
    return encodeURIComponent(value)
  })
}

export type TourTelemetryEvent =
  | { kind: 'started'; tourId: string }
  | { kind: 'step_viewed'; tourId: string; stepIndex: number; dwellMs: number }
  | { kind: 'completed'; tourId: string; totalMs: number }
  | {
      kind: 'abandoned'
      tourId: string
      lastStepIndex: number
      reason: 'manual_exit' | 'idle' | 'error' | 'pause'
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

  // Per-step navigation. When the current step declares a route that
  // differs from the visitor's location, push it onto React Router
  // BEFORE we begin polling for the anchor. This is the gold-standard
  // fix for the demo-public regression where every tour anchor that
  // lived inside a workspace the visitor hadn't entered failed to
  // resolve and the engine showed "Couldn't find this UI element."
  // The dependency captures `stepIndex` (not `step`) so a same-route
  // step transition doesn't re-trigger navigation — only an actual
  // route change does.
  const navigate = useNavigate()
  const location = useLocation()
  const resolvedRoute = step ? resolveStepRoute(step) : null
  useEffect(() => {
    if (resolvedRoute && resolvedRoute !== location.pathname) {
      navigate(resolvedRoute)
    }
    // navigate + location.pathname intentionally omitted from the deps:
    // (a) navigate is stable across React Router renders, (b) reading
    // location.pathname here would re-fire the effect on EVERY route
    // change anywhere in the app and stomp the visitor back to the
    // step's route mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedRoute, stepIndex])

  // Resolve anchor whenever step changes; cancel on the next change. Reset
  // the dwell stopwatch on the same beat so per-step telemetry stays
  // accurate across navigation. The waitForAnchor budget covers the
  // post-navigation React commit + lazy-route mount window — anchors
  // that live behind a route change are still found inside its 3 s
  // ceiling.
  //
  // When the step declares `revealBy` (a data-tour-id of an element
  // whose click reveals the real anchor — typically a button that
  // opens a dialog/popover the anchor lives inside), synthesize that
  // click first and let the engine's normal waitForAnchor flow find
  // the resulting anchor. The reveal click is best-effort: if the
  // opener element isn't in the DOM (already-open dialog, route
  // pre-state, etc.) we skip it silently and proceed to the anchor
  // poll — that way a step CAN declare revealBy hopefully without
  // forcing the opener to exist on every entry path.
  useEffect(() => {
    if (!step) return undefined
    stepEnteredAtRef.current = performance.now()
    const ac = new AbortController()
    setAnchor(null)
    setResolving(true)
    // revealBy: a step whose anchor lives inside a lazy-mounted
    // dialog / popover declares the data-tour-id of its opener. The
    // engine polls for the opener inside a 1.5 s window (covers the
    // post-route-change React commit + lazy-route mount + the
    // engine's own microtask boundary), clicks it once, and falls
    // through to the normal waitForAnchor flow. The poll is bounded
    // so a missing opener (the dialog is already open, the script
    // declared the wrong opener, etc.) does not delay the step
    // indefinitely — waitForAnchor's own 3 s ceiling still applies.
    // Two important invariants live in this block:
    //
    //   1) Sequential, not parallel — the chain MUST finish before
    //      we start waitForAnchor. Previously both ran together, so
    //      waitForAnchor's 3 s ceiling started ticking while the
    //      chain was still clicking; a chain with a tab switch +
    //      dialog open + Radix animation consumed most of the
    //      anchor budget before the dialog had even mounted, and
    //      the "Couldn't find this UI element" banner appeared
    //      across the wikidata, model-in-the-loop, and
    //      import-export tours. With the await in place each phase
    //      gets its full budget.
    //
    //   2) Idempotent — re-clicking a FAB or tab trigger whose
    //      target is ALREADY open closes it. So before running the
    //      chain we short-circuit if the anchor is already present.
    //      And before clicking each link we check whether that
    //      specific link's downstream effect is already achieved by
    //      polling the anchor between clicks. If at any point the
    //      anchor appears, the rest of the chain is skipped. This
    //      is what makes stepping forward inside an already-open
    //      dialog (Tour 3 advancing from manual-mode to wikidata-
    //      mode without toggling the dialog closed) just work.
    const PER_LINK_TIMEOUT = 3_000
    // base-ui's Dialog enter animation is ~150 ms; allow a comfortable
    // settle so the second click in a chain lands inside the dialog
    // that just opened rather than racing the mount.
    const PER_LINK_SETTLE = 400
    const anchorSelector = `[data-tour-id="${CSS.escape(step.anchor)}"]`
    const anchorAlreadyMounted = () =>
      document.querySelector(anchorSelector) instanceof HTMLElement
    const clickChain = async () => {
      if (!step.revealBy) return
      if (anchorAlreadyMounted()) return
      const openers = Array.isArray(step.revealBy)
        ? step.revealBy
        : [step.revealBy]
      for (const id of openers) {
        if (ac.signal.aborted) return
        if (anchorAlreadyMounted()) return
        const selector = `[data-tour-id="${CSS.escape(id)}"]`
        const start = performance.now()
        let opener: HTMLElement | null = null
        while (performance.now() - start < PER_LINK_TIMEOUT) {
          if (ac.signal.aborted) return
          opener = document.querySelector(selector) as HTMLElement | null
          if (opener) break
          await new Promise<void>((r) => window.setTimeout(r, 60))
        }
        if (!opener) {
          console.warn(`[tour] revealBy opener not found: ${id}`)
          continue
        }
        opener.click()
        await new Promise<void>((r) => window.setTimeout(r, PER_LINK_SETTLE))
      }
    }
    // Demo deployments drive the workspace themselves — the engine
    // simulates the step's expectAction (draw a bbox, click a
    // button, scrub the playhead, type into a field) so the
    // visitor never has to know HOW to perform the action; they
    // just watch and press Next. The real workspace handlers
    // process the synthetic events exactly as they would a human's,
    // so the resulting state (the annotation row, the typed
    // value) is real and the NEXT step's anchor mounts against
    // it. Stock builds skip simulation entirely — production
    // tours preserve the visitor-performs-the-action shape.
    const demoPublic = config.deploymentMode.publicBooth
    // Resolve the anchor with up to one retry of the revealBy chain.
    // The first pass clicks the openers and waits for the target
    // anchor; if waitForAnchor times out (deep-stacked dialogs,
    // contended animations, slow /api round-trip), the engine clicks
    // the chain a second time and waits again. The retry handles the
    // race where a dialog's open click fires but its mount commit
    // misses the first observer window; without it a transient miss
    // would surface the missing-anchor banner even though the anchor
    // would have mounted on the next React commit.
    const resolveAnchor = async (): Promise<HTMLElement | null> => {
      await clickChain()
      if (ac.signal.aborted) return null
      const first = await waitForAnchor(step.anchor, ac.signal)
      if (first || ac.signal.aborted || !step.revealBy) return first
      await clickChain()
      if (ac.signal.aborted) return null
      return waitForAnchor(step.anchor, ac.signal)
    }
    void resolveAnchor()
      .then(async (el) => {
        if (ac.signal.aborted) return
        setAnchor(el ?? null)
        setResolving(false)
        if (el && demoPublic && step.expectAction && step.expectAction !== 'none') {
          // Let the spotlight paint + StepCard animate before we
          // start firing pointer events — feels less jumpy than
          // simulating immediately on mount.
          await new Promise<void>((r) => window.setTimeout(r, 350))
          if (ac.signal.aborted) return
          await simulateAction(step.expectAction, el, ac.signal, step)
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setResolving(false)
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
