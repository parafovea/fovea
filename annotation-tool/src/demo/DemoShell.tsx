/**
 * DemoShell — the deployment-mode wrapper for demo.fovea.video.
 *
 * Stock builds never render this. main.tsx mounts <App /> directly.
 * Demo builds (VITE_FOVEA_DEMO_MODE=true) mount <DemoShell /> which
 * carves out the demo's own routes (/, /done/:id) before falling
 * through to <App /> for any workspace route under /workspace/:sessId.
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
 * Seed failures are surfaced via the TourProvider's onTelemetry
 * abandoned event AND a window.alert so the booth presenter sees
 * a crash rather than a silent no-op. At CVPR a visible error +
 * tour-router fall-through is preferable to "nothing happens when I
 * click Start."
 */

import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { TourProvider } from '@/tours'
import { DemoLandingPage } from './pages/DemoLandingPage'
import { PostTourPage } from './pages/PostTourPage'
import { AttributionPage } from './pages/AttributionPage'
import { createAnonymousSession, seedFixture } from './api'
import { isPresenterMode } from './mode-flags'
import { AttributionBanner } from './AttributionBanner'

export function DemoShell() {
  const [error, setError] = useState<string | null>(null)

  return (
    <TourProvider
      onBeforeLaunch={async (tour) => {
        if (!tour.fixtureBundle) return

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
            tourId: tour.fixtureBundle,
            sessionUserId: userId,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(
            `Could not seed tour "${tour.title}": ${msg}. ` +
              `Tell the presenter — check that the backend is running ` +
              `with FOVEA_DEMO_MODE=true and that VITE_FOVEA_DEMO_SEED_TOKEN ` +
              `matches the backend's FOVEA_DEMO_SEED_TOKEN.`,
          )
          throw err
        }
      }}
      onTelemetry={(e) => {
        // Presenter mode (?presenter=1) routes to a no-op so screen-
        // capture / projector sessions don't pollute the booth's
        // real abandon-rate analytics (plan §9 risk 8).
        if (isPresenterMode()) return
        // Demo telemetry hits the regular /api/telemetry endpoint with
        // a demo.* event prefix; the backend's existing telemetry
        // router accepts arbitrary event names. Failures are silent
        // because telemetry must never block the tour flow.
        void fetch('/api/telemetry', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: `demo.tour.${e.kind}`, payload: e }),
        }).catch(() => undefined)
      }}
    >
      {/*
        Persistent CC-BY attribution banner — load-bearing for
        CC-BY-NC-SA 3.0 compliance. Sits above every demo route so
        anyone watching can see the source credit. Hidden under
        ?presenter=1 because clean recordings carry the credit via
        the per-clip ClipAttribution overlay instead.
      */}
      <AttributionBanner />
      {error ? (
        <div
          role="alert"
          className="fixed inset-x-0 top-12 mx-auto max-w-3xl z-[1100] bg-destructive text-destructive-foreground p-4 rounded shadow-lg cursor-pointer"
          onClick={() => setError(null)}
        >
          <p className="font-semibold mb-1">Demo error</p>
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-2 opacity-80">Click to dismiss.</p>
        </div>
      ) : null}
      <Routes>
        <Route path="/" element={<DemoLandingPage />} />
        <Route path="/done/:id" element={<PostTourPage />} />
        <Route path="/docs/demo-attribution" element={<AttributionPage />} />
        {/*
          Anything else falls through to the stock app. A real demo
          deployment would route those under /workspace/:sessId, but
          for the initial scaffold we just let the user reach the
          existing routes — the tour runner mounts globally and the
          fixture is already seeded into the anonymous-session
          workspace by the time we arrive.
        */}
        <Route path="/workspace/*" element={null} />
      </Routes>
    </TourProvider>
  )
}
