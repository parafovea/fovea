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
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { TourMenu } from './TourMenu'
import { TourRunner, type TourTelemetryEvent } from '../engine'
import type { TourScript } from '../engine/types'

interface TourContextValue {
  openMenu: () => void
  closeMenu: () => void
  launch: (tour: TourScript) => void
  active: TourScript | null
}

const TourContext = createContext<TourContextValue | null>(null)

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

export function TourProvider({
  children,
  onBeforeLaunch,
  onTelemetry,
}: TourProviderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState<TourScript | null>(null)

  const launch = useCallback(
    async (tour: TourScript) => {
      try {
        await onBeforeLaunch?.(tour)
      } catch (err) {
        // Fixture seeding failed; surface as a tour_abandoned with
        // reason=error and bail without mounting the runner. Telemetry
        // gives us a single emit point for this class of failure.
        onTelemetry?.({
          kind: 'abandoned',
          tourId: tour.id,
          lastStepIndex: 0,
          reason: 'error',
        })
        console.warn('[tour] onBeforeLaunch failed', err)
        return
      }
      setActive(tour)
    },
    [onBeforeLaunch, onTelemetry],
  )

  const value = useMemo<TourContextValue>(
    () => ({
      openMenu: () => setMenuOpen(true),
      closeMenu: () => setMenuOpen(false),
      launch,
      active,
    }),
    [active, launch],
  )

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onLaunch={launch}
      />
      {active ? (
        <TourRunner
          tour={active}
          onTelemetry={onTelemetry}
          onClose={() => setActive(null)}
        />
      ) : null}
    </TourContext.Provider>
  )
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) {
    throw new Error('useTour must be used inside <TourProvider>')
  }
  return ctx
}
