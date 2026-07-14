/**
 * The tour runner: a state machine over a tour's steps that drives the
 * spotlight and step card through a single tour.
 *
 * For each step the runner, in order:
 *   1. navigates to the step's route when it declares one;
 *   2. runs the step's `driver` capability when it declares one, so the
 *      workspace reaches the state the step needs;
 *   3. resolves the anchor by clicking the catalog `reachedBy` openers (each
 *      read live from the anchor registry) and then awaiting the anchor's
 *      element through the registry's subscription;
 *   4. simulates the step's `expectAction` once the anchor is present.
 *
 * Anchor resolution wakes on the registry's change notification, so an anchor
 * that mounts behind a navigation or a dialog open is found the instant it
 * registers, with a bounded wait that surfaces a skip affordance if it never
 * appears. Resolution reads no DOM on a timer and sets no fixed settle
 * ceilings.
 *
 * The runner auto-advances when the visitor really clicks a `expectAction:
 * 'click'` anchor, so a guided tour feels like a walkthrough rather than a
 * read-and-press-Next sequence. Arrow keys move between steps and Escape
 * abandons the tour, wired at the window level so they respond even while focus
 * sits in the spotlighted control. The runner emits a `TourEvent` for every
 * transition and is policy-free: the host decides which tour to run and what to
 * do on close.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { anchorCatalog, isAnchorId } from './anchorCatalog'
import type { AnchorId, AnchorMeta } from './anchorCatalog'
import { useAnchorRegistry } from './anchorRegistry'
import { getCapability } from './capabilities'
import type { TourCloseReason, TourEvent } from './events'
import { resolveStepRoute, waitForRegisteredAnchor } from './ports'
import { simulateAction } from './simulateAction'
import { SpotlightOverlay } from './SpotlightOverlay'
import { StepCard } from './StepCard'
import type { Tour } from './tourSchema'

/**
 * How long to wait for a step's anchor to register before showing the
 * skip affordance. The wait resolves immediately when the anchor registers, so
 * this is only the deadline for surfacing the missing-anchor state, not a poll
 * interval.
 */
const ANCHOR_WAIT_MS = 8000
/** Settle between clicking a `reachedBy` opener and resolving the next link. */
const OPENER_SETTLE_MS = 400

interface TourRunnerProps {
  tour: Tour
  startIndex?: number
  onEvent?: (event: TourEvent) => void
  onClose: (reason: TourCloseReason) => void
  /** Pause the tour: snapshot the step and unmount the runner so it can resume. */
  onPause?: () => void
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

/** The live element a component tagged with `data-tour-anchor`, outside the registry. */
function queryAnchorElement(anchor: AnchorId): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>(`[data-tour-anchor="${anchor}"]`)
}

export function TourRunner({ tour, startIndex = 0, onEvent, onClose, onPause }: TourRunnerProps) {
  const registry = useAnchorRegistry()
  const navigate = useNavigate()
  const location = useLocation()

  const clampedStart = Math.max(0, Math.min(startIndex, tour.steps.length - 1))
  const [index, setIndex] = useState(clampedStart)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [resolving, setResolving] = useState(true)

  const step = tour.steps[index]
  const total = tour.steps.length

  // Keep the latest callbacks in a ref so the per-step effect can read them
  // without listing them as dependencies (which would re-run the whole step
  // sequence whenever the host re-renders with a fresh closure).
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const emit = useCallback((event: TourEvent) => onEventRef.current?.(event), [])

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const locationRef = useRef(location.pathname)
  locationRef.current = location.pathname

  // Emit `started` once per runner lifetime.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    emit({ type: 'started', tourId: tour.id })
  }, [emit, tour.id])

  // A run closes once: a double Escape (or any repeated close) must not emit a
  // second finished event or a duplicate analytics terminal.
  const finishedRef = useRef(false)
  const finish = useCallback(
    (reason: TourCloseReason) => {
      if (finishedRef.current) return
      finishedRef.current = true
      emit({ type: 'finished', reason })
      onClose(reason)
    },
    [emit, onClose],
  )

  const advance = useCallback(
    (delta: number, via: 'click' | 'next' | 'back' | 'skip') => {
      const next = index + delta
      if (next < 0) return
      if (next >= total) {
        finish('completed')
        return
      }
      emit({ type: 'step_advanced', from: index, to: next, via })
      setIndex(next)
    },
    [emit, finish, index, total],
  )

  // Drive the current step: navigate, run the driver, resolve the anchor, then
  // simulate the action. Re-runs on each step change; cancels in-flight work on
  // the next change via the AbortController.
  useEffect(() => {
    const ac = new AbortController()
    const { signal } = ac
    setAnchorEl(null)
    setResolving(true)

    emit({
      type: 'step_entered',
      index,
      total,
      anchorId: step.anchor,
      route: step.route,
    })

    const run = async () => {
      // 1. Navigate to the step's route when it declares one and we are not
      //    already there.
      const route = resolveStepRoute(step)
      if (route && route !== locationRef.current) {
        navigateRef.current(route)
      }
      if (signal.aborted) return

      // 2. Run the step's driver capability when one is registered.
      if (step.driver) {
        const capability = getCapability(step.driver.capability)
        if (capability) {
          emit({ type: 'driver_started', capability: step.driver.capability })
          try {
            await capability(
              {
                navigate: (path) => navigateRef.current(path),
                registry,
                getAnchor: (id) => registry.get(id),
                sleep,
              },
              step.driver.params,
            )
            if (signal.aborted) return
            emit({ type: 'driver_done', capability: step.driver.capability })
          } catch (error) {
            if (signal.aborted) return
            emit({
              type: 'driver_error',
              capability: step.driver.capability,
              message: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }

      // 3. Click the catalog `reachedBy` openers in order, reading each from
      //    the registry, then await the anchor's element. If the anchor is
      //    already registered the openers are skipped.
      const element = await resolveAnchor(registry, step.anchor, signal)
      if (signal.aborted) return

      setAnchorEl(element)
      setResolving(false)
      if (element) {
        emit({ type: 'anchor_resolved', anchorId: step.anchor })
      } else {
        emit({ type: 'anchor_missing', anchorId: step.anchor })
        return
      }

      // 4. Simulate the step's expected action against the resolved anchor.
      if (step.expectAction && step.expectAction !== 'none' && step.expectAction !== 'click') {
        // Let the spotlight paint before driving synthetic input.
        await sleep(350)
        if (signal.aborted) return
        await simulateAction(step, step.expectAction, element, signal)
        if (signal.aborted) return
        emit({ type: 'action_simulated', action: step.expectAction })
      }
    }

    void run()
    return () => ac.abort()
    // The step object is identified by `index`; the registry and emit are
    // stable, so the sequence re-runs exactly once per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Keyboard navigation, wired at the window level with capture so the tour
  // responds even while focus sits inside the spotlighted control. Escape
  // abandons; arrows move only when no text input holds focus.
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      return el.isContentEditable
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
        advance(+1, 'next')
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        advance(-1, 'back')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [advance, finish])

  // Auto-advance on the visitor's real click of a `expectAction: 'click'`
  // anchor. The listener is one-shot and capture-phase so a double-click does
  // not skip two steps and the underlying handler's work is observed before the
  // spotlight swaps.
  useEffect(() => {
    if (!anchorEl || step.expectAction !== 'click') return undefined
    let fired = false
    function onClick() {
      if (fired) return
      fired = true
      // Defer one tick so the underlying click's effect (open a popover, etc.)
      // lands before the next anchor is resolved.
      window.setTimeout(() => advance(+1, 'click'), 0)
    }
    anchorEl.addEventListener('click', onClick, { capture: true, once: true })
    return () =>
      anchorEl.removeEventListener('click', onClick, { capture: true } as EventListenerOptions)
  }, [anchorEl, step.expectAction, advance])

  const modal = step.modal ?? true

  return (
    <>
      <SpotlightOverlay target={anchorEl} modal={modal} />
      <StepCard
        tour={tour}
        index={index}
        anchor={anchorEl}
        resolving={resolving}
        onBack={() => advance(-1, 'back')}
        onNext={() => advance(+1, 'next')}
        onSkipStep={() => advance(+1, 'skip')}
        onExit={() => finish('abandoned')}
        onRestart={() => setIndex(0)}
        onPause={onPause}
      />
    </>
  )
}

/**
 * Resolve the element for `anchor`: click each catalog `reachedBy` opener that
 * is registered, settling briefly between clicks, then await the anchor through
 * the registry. The openers are skipped when the anchor is already registered,
 * so stepping forward inside an already-open dialog does not toggle it closed.
 */
async function resolveAnchor(
  registry: ReturnType<typeof useAnchorRegistry>,
  anchor: AnchorId,
  signal: AbortSignal,
): Promise<HTMLElement | null> {
  // Prefer the registered element; fall back to any element a component tagged
  // with the matching `data-tour-anchor` but did not register through the hook.
  const already = registry.get(anchor) ?? queryAnchorElement(anchor)
  if (already) return already

  const meta: AnchorMeta = anchorCatalog[anchor]
  const reachedBy = meta.reachedBy ?? []
  for (const openerId of reachedBy) {
    if (signal.aborted) return null
    if (registry.get(anchor) ?? queryAnchorElement(anchor)) break
    if (!isAnchorId(openerId)) continue
    const opener = registry.get(openerId)
    if (!opener) continue
    opener.click()
    await sleep(OPENER_SETTLE_MS)
  }
  if (signal.aborted) return null

  return new Promise<HTMLElement | null>((resolve) => {
    waitForRegisteredAnchor(registry, anchor, ANCHOR_WAIT_MS, signal, (element) =>
      resolve(element ?? queryAnchorElement(anchor)),
    )
  })
}
