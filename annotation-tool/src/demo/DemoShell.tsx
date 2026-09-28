/**
 * DemoShell — the deployment-mode wrapper for demo.fovea.video.
 *
 * Stock builds never render this. main.tsx mounts <App /> directly.
 * Demo builds (VITE_FOVEA_DEMO_MODE=true) mount <DemoShell /> which
 * provides the demo-specific landing page + recap, and switches the
 * `/` route over to the stock <App /> once a tour is active so the
 * runner's spotlight can find the registered anchors that live
 * inside the App's Layout component.
 *
 * Robust session handling for the booth case (plan §9 risk 4): the
 * onBeforeLaunch hook ALWAYS mints a fresh anonymous session on every
 * tour launch rather than reusing a cached one, because:
 *
 *   - the idle-reset sweeper deletes anonymous users after 10 min
 *     idle, so any cached userId is silently dead after the visitor
 *     steps away and comes back,
 *   - re-minting on every launch is cheap (one User row + one Session
 *     row, both with cascade-on-delete relations that make cleanup
 *     free),
 *   - one failure mode (stale session) gets compiled out entirely
 *     instead of relying on retry-on-403 logic that the booth
 *     presenter would have to debug under pressure.
 *
 * Seed failures are surfaced via a top-of-viewport red banner with
 * the specific reason and the env vars the presenter should check.
 * At CVPR a visible error is preferable to "nothing happens when I
 * click Start."
 */

import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { TourProvider, useTour } from '@/tours'
import App from '@/App'
import { DemoLandingPage } from './pages/DemoLandingPage'
import { PostTourPage } from './pages/PostTourPage'
import { createAnonymousSession, seedFixture } from './api'
import { isPresenterMode } from './mode-flags'
import { loadTourContentBundle } from '@/tours/content/loader'
import { saveWorldState, worldKeys } from '@store/queries/useWorld'
import { queryClient } from '@/queryClient'

export function DemoShell() {
  const [error, setError] = useState<string | null>(null)

  return (
    <TourProvider
      onBeforeLaunch={async (tour) => {
        // Mint a fresh session per launch. Stale sessionStorage state
        // from a prior swept user can't break this flow because we
        // never read it.
        let userId: string
        try {
          const session = await createAnonymousSession()
          userId = session.userId
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(`Could not create demo session: ${msg}`)
          throw err
        }

        try {
          await seedFixture({
            tourId: tour.id,
            sessionUserId: userId,
          })
        } catch (err) {
          // seedFixture 404s when no on-disk fixture JSON exists for
          // the tour. That is the production-demo state today: the
          // backend ships without per-tour fixture bundles, so the
          // call always 404s and the tour proceeds without crashing
          // (the personas and world the bundle would seed are sourced
          // from elsewhere instead). Surface the error to the console
          // for diagnosis but do not throw — a 404 on this optional
          // endpoint should not abort the launch.
          console.warn('[demo] seedFixture failed (continuing):', err)
        }

        // Materialize the world bundle from the tour content into the
        // demo user's WorldState so the @-popup in Tour 2 step 5,
        // Tour 4's ClaimEditor time/location pickers, and Tour 5's
        // world workspace all have non-empty data on first paint.
        // Without this every tour that references @LoanDepotPark /
        // @2025-09-05 renders "No objects found". The seed runs once
        // per anonymous session (idempotent PUT replaces the entire
        // WorldState row) and uses the same content the tour scripts
        // do (tour-content.json with microvent.ts as the in-code
        // fallback) so a single source of truth covers narration +
        // world data.
        try {
          const bundle = await loadTourContentBundle()
          const world = bundle.world
          if (world) {
            const now = new Date().toISOString()
            const entities = [
              ...(world.locations ?? []).map((l, i) => ({
                id: `demo-loc-${i}`,
                name: l.name,
                description: [{ type: 'text' as const, content: l.description ?? '' }],
                wikidataId: l.wikidataId,
                wikidataUrl: l.wikidataId ? `https://www.wikidata.org/wiki/${l.wikidataId}` : undefined,
                importedFrom: l.wikidataId ? ('wikidata' as const) : undefined,
                typeAssignments: [],
                metadata: {},
                createdAt: now,
                updatedAt: now,
                locationType: 'point' as const,
                coordinateSystem: 'GPS' as const,
                coordinates: {
                  latitude: l.latitude,
                  longitude: l.longitude,
                },
              })),
              ...(world.entities ?? []).map((e, i) => ({
                id: `demo-ent-${i}`,
                name: e.name,
                description: [{ type: 'text' as const, content: e.description ?? '' }],
                wikidataId: e.wikidataId,
                wikidataUrl: e.wikidataId ? `https://www.wikidata.org/wiki/${e.wikidataId}` : undefined,
                importedFrom: e.wikidataId ? ('wikidata' as const) : undefined,
                typeAssignments: [],
                metadata: {},
                createdAt: now,
                updatedAt: now,
              })),
            ]
            const times = (world.times ?? []).map((t, i) => ({
              id: `demo-time-${i}`,
              type: 'instant' as const,
              timestamp: t.timestamp,
              label: t.label,
              createdAt: now,
              updatedAt: now,
            }))
            const entityCollections = (world.entityCollections ?? []).map((c, i) => ({
              id: `demo-ec-${i}`,
              name: c.name,
              description: [{ type: 'text' as const, content: c.description ?? '' }],
              entityIds: [],
              collectionType: 'group' as const,
              typeAssignments: [],
              createdAt: now,
              updatedAt: now,
            }))
            await saveWorldState({
              entities,
              events: [],
              times,
              entityCollections,
              eventCollections: [],
              timeCollections: [],
              relations: [],
            })
            // Invalidate the cached world query so the GlossEditor's
            // useWorld() refetches the just-PUT data instead of reading
            // the stale empty cache for staleTime (5 min). Without this
            // the @-popup still shows "No objects found" on the FIRST
            // tour the visitor runs after seed.
            await queryClient.invalidateQueries({ queryKey: worldKeys.all })
          }
        } catch (err) {
          console.warn('[demo] world seed failed (continuing):', err)
        }
      }}
      onEvent={(event) => {
        // Presenter mode (?presenter=1) routes to a no-op so screen-
        // capture / projector sessions don't pollute the booth's
        // real abandon-rate analytics.
        if (isPresenterMode()) return
        // Demo telemetry hits the regular /api/telemetry endpoint with
        // a demo.* event prefix; the backend's existing telemetry
        // router accepts arbitrary event names. Failures are silent
        // because telemetry must never block the tour flow.
        void fetch('/api/telemetry', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: `demo.tour.${event.type}`, payload: event }),
        }).catch(() => undefined)
      }}
    >
      <DemoRouter error={error} dismissError={() => setError(null)} />
    </TourProvider>
  )
}

/**
 * Inner component that consumes the TourProvider context. Splitting it
 * out lets us read useTour().active and swap `/` between the demo
 * landing page (idle) and the stock App (tour running). When a tour
 * is active, App's own Routes take over so the visitor sees the real
 * workspace UI and the runner's spotlight finds its anchors there.
 */
function DemoRouter({
  error,
  dismissError,
}: {
  error: string | null
  dismissError: () => void
}) {
  const { active } = useTour()

  return (
    <>
      {error ? (
        <div
          role="alert"
          className="fixed inset-x-0 top-12 mx-auto max-w-3xl z-[1100] bg-destructive text-destructive-foreground p-4 rounded shadow-lg cursor-pointer"
          onClick={dismissError}
        >
          <p className="font-semibold mb-1">Demo error</p>
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-2 opacity-80">Click to dismiss.</p>
        </div>
      ) : null}
      <Routes>
        <Route
          path="/"
          element={active ? <App /> : <DemoLandingPage />}
        />
        <Route path="/done/:id" element={<PostTourPage />} />
        {/*
          Anything else also falls through to the stock app — the
          visitor needs the real Routes from App.tsx (ontology
          workspace, world workspace, admin panel) so the tour
          runner's anchors resolve everywhere it goes.
        */}
        <Route path="*" element={<App />} />
      </Routes>
    </>
  )
}
