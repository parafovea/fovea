/**
 * TourProvider — top-level provider that mounts the active tour's
 * `TourRunner` and exposes a hook the rest of the app can use to open
 * the menu / launch a specific tour.
 *
 * One provider lives near the app root (under the auth context, above
 * the router). Tours run regardless of which route the user is on.
 *
 * Caller wires up `mode` and `onLaunch` once at mount time. The default
 * implementation runs in anchored mode against the current workspace
 * state; the demo-mode landing page injects a different `onLaunch` that
 * POSTs to the fixture seeder before showing the runner.
 *
 * In E2E builds (VITE_E2E=1) the provider also installs `window.__foveaTour`
 * — a thin test handle that lets Playwright drive launch/abandon directly
 * and tap the telemetry stream. The handle is NOT present in production
 * bundles; the gate is build-time so it's dead-code-eliminated.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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

declare global {
  interface Window {
    __foveaTour?: {
      launch: (tourId: string) => Promise<boolean>
      abandon: () => void
      openMenu: () => void
      closeMenu: () => void
      activeId: () => string | null
      telemetry: TourTelemetryEvent[]
      clearTelemetry: () => void
    }
  }
}

export function TourProvider({
  children,
  onBeforeLaunch,
  onTelemetry,
}: TourProviderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState<TourScript | null>(null)
  const telemetryBufferRef = useRef<TourTelemetryEvent[]>([])

  const captureTelemetry = useCallback(
    (e: TourTelemetryEvent) => {
      telemetryBufferRef.current.push(e)
      onTelemetry?.(e)
    },
    [onTelemetry],
  )

  const launch = useCallback(
    async (tour: TourScript) => {
      try {
        await onBeforeLaunch?.(tour)
      } catch (err) {
        // Fixture seeding failed; surface as a tour_abandoned with
        // reason=error and bail without mounting the runner. Telemetry
        // gives us a single emit point for this class of failure.
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
    [captureTelemetry, onBeforeLaunch],
  )

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

  // E2E test handle. Gated at build time so production bundles don't
  // ship it. Keeps the rest of the codebase untouched — Playwright
  // drives everything through window.__foveaTour.
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
      telemetry: telemetryBufferRef.current,
      clearTelemetry: () => {
        telemetryBufferRef.current.length = 0
      },
    }
    window.__foveaTour = handle
    return () => {
      if (window.__foveaTour === handle) delete window.__foveaTour
    }
  }, [active, launch])

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
          tour={active}
          onTelemetry={captureTelemetry}
          onClose={() => setActive(null)}
        />
      ) : null}
    </TourContext.Provider>
  )
}

// useTour and TourContext live in ./tour-context to satisfy the
// react-refresh rule that components-only modules export only
// components.
