/**
 * DemoShell — the deployment-mode wrapper for demo.fovea.video.
 *
 * Stock builds never render this. main.tsx mounts <App /> directly.
 * Demo builds (VITE_FOVEA_DEMO_MODE=true) mount <DemoShell /> which
 * carves out the demo's own routes (/, /done/:id) before falling
 * through to <App /> for any workspace route under /workspace/:sessId.
 *
 * The shell mounts TourProvider at the top of the demo route group
 * with onBeforeLaunch wired to the fixture seeder, so every tour the
 * landing-page menu launches gets a freshly-seeded workspace before
 * step 1 paints.
 */

import { Route, Routes } from 'react-router-dom'
import { TourProvider } from '@/tours'
import { DemoLandingPage } from './pages/DemoLandingPage'
import { PostTourPage } from './pages/PostTourPage'
import { AttributionPage } from './pages/AttributionPage'
import { seedFixture } from './api'
import { useDemoSession } from './session'
import { isPresenterMode } from './mode-flags'
import { AttributionBanner } from './AttributionBanner'

export function DemoShell() {
  const { session } = useDemoSession()

  return (
    <TourProvider
      onBeforeLaunch={async (tour) => {
        if (!session || !tour.fixtureBundle) return
        // Demo-mode tours run in fixture mode (plan §6.6): seed the
        // workspace state for this tour before painting step 1.
        await seedFixture({
          tourId: tour.fixtureBundle,
          sessionUserId: session.userId,
        })
      }}
      onTelemetry={(e) => {
        // Presenter mode (?presenter=1) routes to a no-op so screen-
        // capture / projector sessions don't pollute the booth's
        // real abandon-rate analytics (plan §9 risk 8).
        if (isPresenterMode()) return
        // Demo telemetry hits the regular /api/telemetry endpoint with
        // a demo.* event prefix; the backend's existing telemetry
        // router accepts arbitrary event names.
        void fetch('/api/telemetry', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: `demo.tour.${e.kind}`, payload: e }),
        }).catch(() => {
          // Telemetry must never break the tour flow.
        })
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
