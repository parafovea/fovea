/**
 * TourProvider — top-level provider that mounts the active tour's
 * `TourRunner` and exposes a hook the rest of the app can use to open
 * the menu / launch a specific tour.
 *
 * One provider lives near the app root (under the auth context, above
 * the router). Tours run regardless of which route the user is on.
 *
 * Pause / resume:
 *   The visitor can pause a tour mid-step (Pause button on StepCard).
 *   The provider snapshots `{tour, stepIndex, captured route + scroll}`
 *   into sessionStorage and unmounts the runner. A floating "Resume
 *   tour" pill appears in the corner. On resume, the provider soft-
 *   navigates back to the captured route (via history.pushState +
 *   popstate so React Router updates without a full document reload),
 *   restores scroll, writes the step cursor, then remounts the runner.
 *   The pause state survives a hard reload too — the persistence key
 *   is `fovea.tour.paused`.
 *
 * In E2E builds (VITE_E2E=1) the provider also installs `window.__foveaTour`
 * — a thin test handle that lets Playwright drive launch/abandon/pause/
 * resume directly and tap the telemetry stream. The handle is NOT
 * present in production bundles; the gate is build-time so it's
 * dead-code-eliminated.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@components/ui/button'
import { Play, X } from 'lucide-react'
import { TourMenu } from './TourMenu'
import { TourRunner, type TourTelemetryEvent } from '../engine'
import type { TourScript, TourStep } from '../engine/types'
import { getBuiltInTours } from '../scripts'
import { microventContent } from '../content/microvent'
import type { TourContentBundle } from '../content/types'
import { TourContext, type TourContextValue } from './tour-context'
import { config } from '@/config'

/**
 * Same resolution logic the TourRunner uses for per-step routes,
 * lifted to module scope so `launch()` can compute the initial
 * navigation target without a circular dependency on the runner. Tour
 * scripts that pin step 0 to a concrete workspace get launched there;
 * scripts that omit step 0's route fall through to `tour.startRoute`,
 * which falls through to `/app`.
 */
function resolveStepRouteForLaunch(step: TourStep): string | null {
  if (!step.route) return null
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

interface TourProviderProps {
  children: ReactNode
  /**
   * Optional hook that fires before the runner mounts. Demo-mode passes
   * its fixture seeder here. Returns a promise so the runner waits for
   * seeding to complete before painting step 1.
   */
  onBeforeLaunch?: (tour: TourScript) => void | Promise<void>
  /** Telemetry sink. No-op in stock builds; demo build wires it to /api/telemetry. */
  onTelemetry?: (e: TourTelemetryEvent) => void
  /**
   * Per-deployment tour content. Default: the microvent news-incident
   * bundle that ships with Fovea (see ../content/microvent.ts). An
   * admin tailoring tours for their own users supplies a bundle of
   * the same shape — every tour's narration, suggested type names,
   * venue / location / claim text update across the catalogue
   * without touching the engine or the per-step anchors. The menu
   * and the runner both rebuild from the bundle on every render so
   * the bundle can be switched live.
   */
  contentBundle?: TourContentBundle
}

interface PausedTour {
  tourId: string
  stepIndex: number
  route: string
  scrollY: number
}

const PAUSE_KEY = 'fovea.tour.paused'
const CURSOR_KEY = 'fovea.tour.cursor'

declare global {
  interface Window {
    __foveaTour?: {
      launch: (tourId: string) => Promise<boolean>
      abandon: () => void
      openMenu: () => void
      closeMenu: () => void
      activeId: () => string | null
      pause: () => boolean
      resume: () => Promise<boolean>
      pausedId: () => string | null
      discardPaused: () => void
      telemetry: TourTelemetryEvent[]
      clearTelemetry: () => void
    }
  }
}

function readPaused(): PausedTour | null {
  try {
    const raw = sessionStorage.getItem(PAUSE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PausedTour
    if (
      !parsed ||
      typeof parsed.tourId !== 'string' ||
      typeof parsed.stepIndex !== 'number' ||
      typeof parsed.route !== 'string'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writePaused(p: PausedTour) {
  try {
    sessionStorage.setItem(PAUSE_KEY, JSON.stringify(p))
  } catch {
    // sessionStorage is best-effort; we still keep in-memory state.
  }
}

function clearPaused() {
  try {
    sessionStorage.removeItem(PAUSE_KEY)
  } catch {
    // see writePaused
  }
}

function writeCursor(tourId: string, stepIndex: number) {
  try {
    sessionStorage.setItem(CURSOR_KEY, JSON.stringify({ tourId, stepIndex }))
  } catch {
    // see writePaused
  }
}

export function TourProvider({
  children,
  onBeforeLaunch,
  onTelemetry,
  contentBundle = microventContent,
}: TourProviderProps) {
  // Resolve the per-deployment tour catalogue from the bundle. Memoise
  // on the bundle reference so swapping bundles rebuilds the list but
  // identity-stable bundles don't churn.
  const tours = useMemo(
    () => getBuiltInTours(contentBundle),
    [contentBundle],
  )
  const findTour = useCallback(
    (id: string) => tours.find((t) => t.id === id),
    [tours],
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState<TourScript | null>(null)
  // Paused state — rehydrate from sessionStorage on mount so a hard
  // reload mid-pause doesn't strand the visitor (the "Resume tour" pill
  // reappears with the same tourId/stepIndex/route).
  const [paused, setPaused] = useState<PausedTour | null>(() => {
    if (typeof window === 'undefined') return null
    return readPaused()
  })
  const telemetryBufferRef = useRef<TourTelemetryEvent[]>([])
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  // In-flight guard for pause() — two synchronous calls in the same
  // microtask both see `active` non-null (setActive(null) hasn't
  // committed yet) so without this they'd both fire telemetry and
  // double-write the pause storage entry.
  const pausingRef = useRef(false)

  // VITE_DEMO_PUBLIC builds present the catalogue at `/` (TourCataloguePage).
  // Every tour script is anchored to elements that live inside the
  // authenticated Layout under `/app/*` (sidebar, video browser,
  // workspaces). Launching a tour from the catalogue would paint the
  // engine's "Couldn't find this UI element" banner on every step
  // because none of those anchors exist on the public catalogue. The
  // launch() implementation below uses these to navigate the visitor
  // into `/app` BEFORE setting the active tour, so the runner mounts
  // against the real Layout and its anchors resolve. Stock builds skip
  // this (the catalogue isn't there and the user is already in /).
  const navigate = useNavigate()
  const location = useLocation()
  const isDemoPublic = config.deploymentMode.publicBooth

  const captureTelemetry = useCallback(
    (e: TourTelemetryEvent) => {
      telemetryBufferRef.current.push(e)
      onTelemetry?.(e)
    },
    [onTelemetry],
  )

  const launch = useCallback(
    async (tour: TourScript) => {
      restoreFocusRef.current =
        typeof document === 'undefined'
          ? null
          : (document.activeElement as HTMLElement | null)
      // Reset the pause in-flight guard so a future pause on this new
      // tour can fire (otherwise the guard would still be true from the
      // prior tour's pause).
      pausingRef.current = false
      // A new launch clears any prior pause — the visitor explicitly
      // started a different tour so the old one is no longer waiting.
      if (paused && paused.tourId !== tour.id) {
        clearPaused()
        setPaused(null)
      }
      // Reset every workspace slice so a fresh launch never inherits a
      // stale tab, persona, selection, detection panel, timeline
      // position, or link target from a prior tour. The store exposes a
      // single resetAllState() that returns every slice to its
      // canonical initialState (18 slices including selectedAnnotation,
      // ontologySelectedPersonaId, detectionResults, timelineExpanded,
      // linkTarget*, currentFrame) — anything less than a full reset
      // surfaces as cross-tour bleed (e.g. Tour 12 leaving the
      // timeline open, Tour 6 leaving detection candidates mounted,
      // Tour 4 leaving a link target set, Tour 3 leaving a persona
      // selected). The annotationMode default is 'type' which matches
      // every tour's expected starting mode.
      if (typeof window !== 'undefined') {
        try {
          const mod = await import('@/store/zustand/annotationUiStore')
          mod.useAnnotationUiStore.getState().resetAllState?.()
        } catch {
          // best-effort — the store may not be available in unit tests
        }
        // Dismiss any sticky Radix / base-ui dialog, popover, dropdown,
        // or tooltip the previous tour left open. The Zustand reset
        // above clears state, but a dialog whose open prop lives in a
        // workspace that hasn't unmounted yet (route change happens
        // later in this function) keeps painting until parent state
        // flips. Two paths cover the two failure modes:
        //   1. Escape keydown at the document. Both Radix and base-ui
        //      register a document-level Escape listener that calls
        //      onOpenChange(false, {reason:'escape-key'}). Our demo
        //      Dialog wrapper allows escape-key through (only outside-
        //      press / focus-out / trigger-press are intercepted), so
        //      this closes any dialog whose parent flips state on
        //      Escape.
        //   2. Programmatic click on every visible dialog's close
        //      button. Dialogs whose escape handler was suppressed by
        //      a competing modal layer, or whose parent ignores the
        //      Escape (no onEscapeKeyDown handler), still respond to
        //      a click on the X button — every Radix / base-ui dialog
        //      ships a CloseTrigger that flips its open state to
        //      false synchronously.
        try {
          for (let i = 0; i < 2; i++) {
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
            )
            await new Promise((resolve) => setTimeout(resolve, 16))
          }
          const closeTriggers = document.querySelectorAll<HTMLElement>(
            '[data-state="open"] [data-slot="dialog-close"], [data-state="open"] [aria-label="Close"]',
          )
          closeTriggers.forEach((btn) => btn.click())
        } catch {
          // ignore
        }
      }
      // Persona pre-switch: every tour that names its demonstrator
      // persona (via TourScript.personaName, sourced from the content
      // bundle's per-tour personaName field) sets the active
      // selectedPersonaId BEFORE the runner mounts so narrations like
      // "as the Tech-Curious Spectator" / "from the Ballpark Guest
      // Services Supervisor's perspective" match the persona dropdown
      // in the workspace toolbar instead of leaving whatever persona
      // happened to sort first selected. Best-effort: if the personas
      // query is in-flight we don't block — the per-step logic later
      // can still pick a persona, but narrating mismatched names is
      // the first-paint failure the demo probe caught at step 5 of
      // first-annotation ("Assign type 'Person'. The list comes from
      // this persona's ontology" while showing the wrong persona).
      if (tour.personaName && typeof window !== 'undefined') {
        try {
          const res = await fetch('/api/personas', {
            credentials: 'include',
          })
          if (res.ok) {
            const personas = (await res.json()) as Array<{ id: string; name: string }>
            const wanted = personas.find(
              (p) => p.name.toLowerCase() === tour.personaName!.toLowerCase(),
            )
            if (wanted) {
              const mod = await import('@/store/zustand/annotationUiStore')
              mod.useAnnotationUiStore.getState().setSelectedPersonaId?.(wanted.id)
            }
          }
        } catch (err) {
          console.warn('[tour] persona pre-switch failed', err)
        }
      }
      try {
        await onBeforeLaunch?.(tour)
      } catch (err) {
        captureTelemetry({
          kind: 'abandoned',
          tourId: tour.id,
          lastStepIndex: 0,
          reason: 'error',
        })
        console.warn('[tour] onBeforeLaunch failed', err)
        return false
      }
      // Decide the route to navigate to before mounting the runner.
      // Precedence:
      //   1. step 0's `route` (with routeParams substitution) — a
      //      tour that pins its very first step to a specific
      //      workspace effectively declares that workspace as its
      //      entry. We honour that without forcing the author to
      //      also set `startRoute`.
      //   2. tour.startRoute — explicit per-tour entry point.
      //   3. `/app` — the default authenticated landing.
      //
      // We always navigate when the visitor is on `/` (the public
      // catalogue) so the runner mounts against the real Layout.
      // For visitors already inside `/app/*`, only navigate if the
      // target differs from the current pathname — avoid stomping
      // a Sign-in-then-resume flow that already landed in the right
      // place.
      const step0Route =
        tour.steps[0] ? resolveStepRouteForLaunch(tour.steps[0]) : null
      const targetRoute = step0Route ?? tour.startRoute ?? '/app'
      const needsNavigation =
        isDemoPublic && targetRoute !== location.pathname
      if (needsNavigation) {
        navigate(targetRoute)
        // Defer setActive to a microtask so React commits the route
        // change before the runner mounts. waitForAnchor then handles
        // any further settle delay (lazy sub-routes, animations).
        await new Promise<void>((resolve) => queueMicrotask(resolve))
      }
      setActive(tour)
      return true
    },
    [
      captureTelemetry,
      isDemoPublic,
      location.pathname,
      navigate,
      onBeforeLaunch,
      paused,
    ],
  )

  // Pause: capture the runner's current step + the visitor's location
  // and scroll. The runner unmounts but the cursor survives so
  // resume() picks up exactly where they left off. We also emit an
  // abandoned event with reason='pause' so analytics has a single
  // emission point for "the visitor left this step" — without it the
  // dwell on the paused step would be silently lost.
  const pause = useCallback(
    (stepIndex: number) => {
      if (!active || pausingRef.current) return false
      pausingRef.current = true
      const route =
        typeof window === 'undefined'
          ? '/'
          : window.location.pathname + window.location.search
      const scrollY = typeof window === 'undefined' ? 0 : window.scrollY
      const next: PausedTour = { tourId: active.id, stepIndex, route, scrollY }
      writePaused(next)
      writeCursor(active.id, stepIndex)
      captureTelemetry({
        kind: 'abandoned',
        tourId: active.id,
        lastStepIndex: stepIndex,
        reason: 'pause',
      })
      setPaused(next)
      setActive(null)
      return true
    },
    [active, captureTelemetry],
  )

  // Resume: navigate back to the captured route via history.pushState +
  // popstate (so React Router updates without a full document load),
  // restore scroll, then remount the runner. The TourRunner reads the
  // cursor from sessionStorage on mount and lands on the paused step.
  //
  // We mount the runner via the normal launch path so onBeforeLaunch
  // hooks (e.g. demo-mode fixture seeder) get a chance to run again
  // on resume. If launch fails, KEEP the paused state — otherwise a
  // failed seeder would strand the visitor with no way to retry. Only
  // clear the pill once the runner is confirmed mounted.
  const resume = useCallback(async () => {
    const p = paused ?? readPaused()
    if (!p) return false
    const tour = findTour(p.tourId)
    if (!tour) {
      // Tour was removed (older script version cached); discard.
      clearPaused()
      setPaused(null)
      return false
    }
    if (typeof window !== 'undefined') {
      const currentRoute = window.location.pathname + window.location.search
      if (currentRoute !== p.route) {
        window.history.pushState({}, '', p.route)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
      // Defer scroll restore one rAF tick so React Router has a chance
      // to mount the destination route's layout — otherwise the page is
      // shorter than the captured scrollY and scrollTo is a no-op.
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: p.scrollY, left: 0, behavior: 'auto' })
      })
    }
    writeCursor(p.tourId, p.stepIndex)
    const ok = await launch(tour)
    if (!ok) {
      // onBeforeLaunch threw. Keep paused state so the visitor can
      // retry from the pill instead of losing their place.
      return false
    }
    clearPaused()
    setPaused(null)
    return true
  }, [findTour, launch, paused])

  const discardPaused = useCallback(() => {
    clearPaused()
    setPaused(null)
  }, [])

  const value = useMemo<TourContextValue>(
    () => ({
      openMenu: () => setMenuOpen(true),
      closeMenu: () => setMenuOpen(false),
      launch: (tour) => {
        void launch(tour)
      },
      active,
    }),
    [active, launch],
  )

  useEffect(() => {
    if (!config.deploymentMode.e2e) return undefined
    const handle = {
      launch: async (tourId: string) => {
        const tour = findTour(tourId)
        if (!tour) return false
        return launch(tour)
      },
      abandon: () => setActive(null),
      openMenu: () => setMenuOpen(true),
      closeMenu: () => setMenuOpen(false),
      activeId: () => active?.id ?? null,
      pause: () => {
        if (!active) return false
        // We need the runner's current stepIndex. The TourRunner writes
        // it to sessionStorage on every change, so read from there.
        let stepIndex = 0
        try {
          const raw = sessionStorage.getItem(CURSOR_KEY)
          if (raw) {
            const parsed = JSON.parse(raw) as {
              tourId: string
              stepIndex: number
            }
            if (parsed.tourId === active.id) stepIndex = parsed.stepIndex
          }
        } catch {
          stepIndex = 0
        }
        return pause(stepIndex)
      },
      resume: () => resume(),
      pausedId: () => paused?.tourId ?? null,
      discardPaused,
      telemetry: telemetryBufferRef.current,
      clearTelemetry: () => {
        telemetryBufferRef.current.length = 0
      },
    }
    window.__foveaTour = handle
    return () => {
      if (window.__foveaTour === handle) delete window.__foveaTour
    }
  }, [active, discardPaused, findTour, launch, pause, paused, resume])

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        tours={tours}
        onLaunch={(tour) => {
          void launch(tour)
        }}
      />
      {active ? (
        <TourRunner
          key={active.id}
          tour={active}
          onTelemetry={captureTelemetry}
          restoreFocusTo={restoreFocusRef.current}
          onClose={() => {
            setActive(null)
            // VITE_DEMO_PUBLIC: when a tour finishes (or is abandoned)
            // the booth visitor should land back on the public
            // catalogue at `/` so they can pick another tour without
            // hunting for the back button. Stock builds stay where
            // they are — the user's workspace state is the natural
            // post-tour destination.
            if (isDemoPublic) {
              navigate('/')
            }
          }}
          onPause={pause}
        />
      ) : null}
      {paused && !active ? (
        <ResumePill
          paused={paused}
          onResume={() => {
            void resume()
          }}
          onDiscard={discardPaused}
          lookupTour={findTour}
        />
      ) : null}
    </TourContext.Provider>
  )
}

interface ResumePillProps {
  paused: PausedTour
  onResume: () => void
  onDiscard: () => void
  lookupTour: (id: string) => TourScript | undefined
}

function ResumePill({ paused, onResume, onDiscard, lookupTour }: ResumePillProps) {
  const tour = lookupTour(paused.tourId)
  const title = tour?.title ?? paused.tourId
  return (
    <div
      data-fovea-tour-resume-pill=""
      className="fixed bottom-4 right-4 z-[1002] flex items-center gap-2 rounded-full border bg-background/95 backdrop-blur px-3 py-1.5 shadow-lg"
    >
      <span className="text-xs text-muted-foreground">
        Tour paused: <span className="font-medium text-foreground">{title}</span>
      </span>
      <Button
        size="sm"
        variant="default"
        data-fovea-tour-resume=""
        onClick={onResume}
      >
        <Play className="size-3.5 mr-1" /> Resume
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Discard paused tour"
        data-fovea-tour-discard-paused=""
        onClick={onDiscard}
        className="size-7"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

// useTour and TourContext live in ./tour-context to satisfy the
// react-refresh rule that components-only modules export only
// components.
