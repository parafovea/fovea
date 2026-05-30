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
 *   The provider snapshots {tour, stepIndex, captured route + scroll}
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
import { Button } from '@components/ui/button'
import { Play, X } from 'lucide-react'
import { TourMenu } from './TourMenu'
import { TourRunner, type TourTelemetryEvent } from '../engine'
import type { TourScript } from '../engine/types'
import { findTour } from '../scripts'
import { TourContext, type TourContextValue } from './tour-context'

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
}: TourProviderProps) {
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
      // A new launch clears any prior pause — the visitor explicitly
      // started a different tour so the old one is no longer waiting.
      if (paused && paused.tourId !== tour.id) {
        clearPaused()
        setPaused(null)
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
      setActive(tour)
      return true
    },
    [captureTelemetry, onBeforeLaunch, paused],
  )

  // Pause: capture the runner's current step + the visitor's location
  // and scroll. The runner unmounts but the cursor survives so
  // resume() picks up exactly where they left off.
  const pause = useCallback(
    (stepIndex: number) => {
      if (!active) return false
      const route =
        typeof window === 'undefined'
          ? '/'
          : window.location.pathname + window.location.search
      const scrollY = typeof window === 'undefined' ? 0 : window.scrollY
      const next: PausedTour = { tourId: active.id, stepIndex, route, scrollY }
      writePaused(next)
      writeCursor(active.id, stepIndex)
      setPaused(next)
      setActive(null)
      return true
    },
    [active],
  )

  // Resume: navigate back to the captured route via history.pushState +
  // popstate (so React Router updates without a full document load),
  // restore scroll, then remount the runner. The TourRunner reads the
  // cursor from sessionStorage on mount and lands on the paused step.
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
    clearPaused()
    setPaused(null)
    // Mount the runner via the normal launch path so onBeforeLaunch
    // hooks (e.g. demo-mode fixture seeder) get a chance to run again
    // even on resume — important when the visitor reset state by
    // wandering between pause and resume.
    return launch(tour)
  }, [launch, paused])

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
    if (!import.meta.env.VITE_E2E) return undefined
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
  }, [active, discardPaused, launch, pause, paused, resume])

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
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
          onClose={() => setActive(null)}
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
        />
      ) : null}
    </TourContext.Provider>
  )
}

interface ResumePillProps {
  paused: PausedTour
  onResume: () => void
  onDiscard: () => void
}

function ResumePill({ paused, onResume, onDiscard }: ResumePillProps) {
  const tour = findTour(paused.tourId)
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
