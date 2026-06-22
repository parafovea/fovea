import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import axios from 'axios'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
import { config } from '@/config'
import { DemoShell } from './demo/DemoShell'
import { isDemoModeEnabled } from './demo/config'
import { TourProvider } from './tours'
import { loadTourContentBundle } from './tours/content/loader'
import type { TourContentBundle } from './tours/content/types'
import './index.css'

// Initialize command registry before React renders (must be before component mount effects)
import { initializeCommands, initializeGlobalContext } from '@lib/commands/init-commands'

// Initialize telemetry before React renders
import { initTracing } from '@telemetry/tracing'
import { initErrorLogging } from '@services/errorLogging'

// Initialize tracing first - must be before any other code that might make network requests
initTracing({
  enabled: config.env.isProd,
  sampleRate: config.env.isProd ? 0.2 : 1.0, // 20% in prod, 100% in dev
})

// Initialize error logging with backend reporting
initErrorLogging({
  enabled: config.env.isProd,
  sampleRate: config.env.isProd ? 0.2 : 1.0, // 20% in prod, 100% in dev
  consoleLogging: config.env.isDev,
})

// Initialize commands synchronously so they're available when component effects run
initializeCommands()
initializeGlobalContext()

/**
 * Probe the backend for an existing real (non-anonymous-demo) session.
 *
 * Returns true when GET /api/auth/me returns 200 AND the resolved
 * username does NOT start with `demo-anonymous-`. That signals a
 * real signed-in user (admin or otherwise) and means MSW MUST NOT
 * start: every backend route the real session can answer (auth,
 * personas, world, videos, admin, jobs) should go to the live
 * backend rather than the mock worker's passthrough() helper, which
 * has been observed to reject with "TypeError: Failed to fetch"
 * inside the service worker context and break admin navigation.
 *
 * Returns false when the session is anonymous (username starts with
 * `demo-anonymous-`), the response is 401, the probe fails outright,
 * or the probe times out at 2000ms. In every false case we still
 * want MSW up so the public tour-demo flow keeps mocking model-
 * service routes for the booth visitor.
 *
 * Cookies: the probe sends `credentials: 'include'` so the
 * HttpOnly+SameSite=Lax session cookie set by the backend (and
 * served behind nginx on demo.fovea.video as same-origin) is
 * forwarded with the request.
 */
async function isRealSignedInUser(): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 2000)
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (res.status !== 200) return false
    const body = (await res.json().catch(() => null)) as
      | { user?: { username?: string } }
      | null
    const username = body?.user?.username
    if (typeof username !== 'string') return false
    return !username.startsWith('demo-anonymous-')
  } catch {
    // Network error, timeout, or malformed body: prefer starting MSW
    // (safer default for the demo flow).
    return false
  } finally {
    window.clearTimeout(timeoutId)
  }
}

/**
 * Start the MSW tour-demo worker BEFORE React mounts so the first
 * model-service-bound request fired by any tour intro screen is
 * already intercepted. Production builds without VITE_TOUR_DEMO=1
 * tree-shake the entire `src/mocks/tourDemo` subtree out of the
 * bundle because the dynamic import below sits behind a statically-
 * analysable env-var guard.
 *
 * Skips MSW entirely when /api/auth/me resolves to a real (non
 * anonymous-demo) user. Without this gate the worker intercepts
 * routes the real backend serves correctly (auth, personas, world,
 * videos, admin) and the worker's own passthrough() helper rejects
 * with "TypeError: Failed to fetch" inside the service worker
 * context, breaking admin navigation on demo.fovea.video.
 */
async function maybeStartTourDemoMocking(): Promise<void> {
  // Kept INLINE (not routed through config): Rollup statically folds this
  // literal comparison to tree-shake the entire `src/mocks/tourDemo` subtree
  // (and its tour content) out of normal production builds. Replacing it with
  // a cross-module config property access would defeat that analysis and ship
  // the mocks in every bundle. See src/config.ts for the rationale.
  // eslint-disable-next-line no-restricted-syntax
  if (import.meta.env.VITE_TOUR_DEMO !== '1') return
  // VITE_DEMO_PUBLIC builds run against a REAL backend that already
  // serves /api/auth/me, /api/personas, /api/videos, /api/world etc.,
  // so the MSW worker's role is reduced to mocking just the
  // model-service routes (ontology augment, detection, summarization).
  // The downside is the worker's passthrough() helper throws
  // TypeError on cross-origin requests (wikidata.org for Tour 3, and
  // on some routes that aren't matched by handlers), breaking flows
  // the demo NEEDS. Skip MSW entirely on the public demo build —
  // model-service routes will return 503 on Tour 6, which we handle
  // with a graceful UI banner, and every other flow (Wikidata search,
  // ontology augment via real backend, admin tour) keeps working
  // without the worker getting in the way. Stock VITE_TOUR_DEMO=1
  // builds without DEMO_PUBLIC (E2E / dev) still install the worker
  // because those flows need the mocks.
  if (config.deploymentMode.publicBooth) {
    console.info(
      '[tour-demo] DEMO_PUBLIC build talks to a real backend; MSW worker NOT started.',
    )
    return
  }
  if (await isRealSignedInUser()) {
    console.info(
      '[tour-demo] real signed-in user detected; MSW worker NOT started.',
    )
    return
  }
  const { startTourDemoWorker } = await import('./mocks/tourDemo/browser')
  await startTourDemoWorker()
}

/**
 * Booth bootstrap — when the bundle was built for the public catalogue
 * deployment (VITE_DEMO_PUBLIC=1, demo.fovea.video), every visitor is
 * anonymous and needs a backend session before any data endpoint will
 * answer. POST /api/demo/anonymous-session mints a short-lived
 * demo-anonymous-{hex} user and sets the session_token cookie
 * httpOnly. Without this:
 *   - GET /api/auth/me returns 401 on first paint, useSession leaves
 *     isAuthenticated=false, and every protected data route the
 *     Layout idles against returns 401
 *   - the VideoBrowser renders "No videos found" because /api/videos
 *     401s, so every tour targeting a video card or the annotation
 *     workspace shows the missing-anchor banner on its first
 *     non-app-shell step
 *
 * Combined with FOVEA_DEMO_MODE=true on the backend, where
 * VideoAccessService returns 'all' for non-admin callers, anonymous
 * visitors see the same curated demo corpus the tours were
 * authored against.
 *
 * Idempotent: the endpoint reuses an existing demo-anonymous-* cookie
 * if one is present, so a hard reload or a return visit within the
 * TTL doesn't churn through anonymous user rows.
 *
 * Stock and tour-demo (non-public) builds skip this entirely — the
 * conditional sits behind a statically-analysable env-var guard so
 * Rollup tree-shakes the request out of those bundles.
 */
async function maybeBootstrapDemoSession(): Promise<void> {
  if (!config.deploymentMode.publicBooth) return
  try {
    // Empty JSON body required — Fastify's defaultJsonParser rejects
    // a POST with Content-Type: application/json but no body
    // (FST_ERR_CTP_EMPTY_JSON_BODY -> 400 -> 500 via the error
    // handler), the cookie never gets set, and every /api/* GET that
    // follows 401s.
    await fetch('/api/demo/anonymous-session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
  } catch (err) {
    // The catalogue still renders even if the anonymous visitor
    // never gets a session; they just can't enter /app
    // meaningfully. Log so the deployment operator notices, but
    // don't block boot.
    console.warn('[demo] anonymous-session bootstrap failed', err)
  }
}

/**
 * TanStack Query client configuration.
 * Manages caching, refetching, and background updates for API requests.
 */
// Exported so DemoShell's onBeforeLaunch can invalidate cached queries
// after seeding the demo user's WorldState — without this the
// GlossEditor's useWorld() returns the stale empty cache for up to
// staleTime=5 min and the @-popup keeps reading "No objects found"
// even though the backend was just populated.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Do not retry client errors (4xx, including 429 rate limits); a retry
      // cannot fix a bad request and only amplifies request fan-out. For other
      // failures (network, 5xx) allow a single retry.
      retry: (failureCount, error) => {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined
        if (status && status >= 400 && status < 500) return false
        return failureCount < 1
      },
      // Refetching on window focus multiplies request volume across the app
      // and is not needed given staleTime + explicit invalidation on mutations.
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

// Boot-time fetch of the deployment's tour content bundle from
// /tour-content.json (the admin's editable config). NO silent
// fallback: if the file is missing or malformed, render a visible
// banner and mount the app WITHOUT TourProvider so the admin can fix
// the JSON without an opaque "tours just don't work" failure mode.
function Root() {
  type LoadState =
    | { kind: 'loading' }
    | { kind: 'ready'; bundle: TourContentBundle }
    | { kind: 'error'; message: string }
  const [state, setState] = React.useState<LoadState>({ kind: 'loading' })
  React.useEffect(() => {
    loadTourContentBundle()
      .then((bundle) => setState({ kind: 'ready', bundle }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[tours] content bundle load failed:', message)
        setState({ kind: 'error', message })
      })
  }, [])

  if (isDemoModeEnabled()) return <DemoShell />

  // Always wrap <App /> in <TourProvider>: the demo-public catalogue
  // (TourCataloguePage at /) calls useTour() to launch tours, and
  // dropping the provider in the loading or error branch made the
  // hook throw "useTour must be used inside <TourProvider>" the moment
  // a VITE_DEMO_PUBLIC=1 visitor hit /. TourProvider defaults
  // contentBundle to microventContent when none is supplied, so the
  // provider is happy with no real bundle while we wait for the
  // boot-time fetch; once the fetch resolves we swap in the real
  // bundle and TourProvider re-derives the catalogue.
  const bundle = state.kind === 'ready' ? state.bundle : undefined
  const errorBanner =
    state.kind === 'error' ? (
      <div
        role="alert"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: '#b91c1c',
          color: 'white',
          padding: '12px 16px',
          zIndex: 9999,
          fontSize: 13,
        }}
      >
        <strong>Tours disabled: content config error.</strong>{' '}
        {state.message} See <code>docs/tour-customization.md</code>.
      </div>
    ) : null
  return (
    <TourProvider contentBundle={bundle}>
      {errorBanner}
      <App />
    </TourProvider>
  )
}

// The MSW worker registration is fire-and-forget for the bundle to
// remain compatible with esbuild's default target (top-level await
// requires target esnext). React mounts immediately; any model-
// service request fired before the worker finishes registering will
// pass through to the real backend, which is acceptable for the
// tour-intro screen because no tour starts its model-service-bound
// step inside the first few hundred milliseconds of page load.
void maybeStartTourDemoMocking()

// The demo anon-session POST runs in parallel with the React mount.
// Awaiting it before render would block first paint behind a server
// round-trip — unacceptable for a landing page. Instead we mount
// immediately and, when the POST resolves, invalidate the React Query
// caches whose first GET fired before the session_token cookie
// landed. The invalidation triggers a refetch that now carries the
// cookie, so the "No videos found" / "No personas found" empty states
// the race used to leave on screen are gone before the visitor can
// click anything. Stock builds skip the bootstrap entirely (early
// return on !VITE_DEMO_PUBLIC) so no invalidation runs there.
void maybeBootstrapDemoSession().then(() => {
  queryClient.invalidateQueries({ queryKey: ['videos'] })
  queryClient.invalidateQueries({ queryKey: ['personas'] })
  queryClient.invalidateQueries({ queryKey: ['world'] })
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            {/*
              Demo deployments render <DemoShell />, which provides its
              own TourProvider with the seed-on-launch hook wrapped
              around App. Stock builds mount TourProvider here so the
              tour engine is available to <App /> directly (anchored
              mode against the user's real workspace). Either way the
              TourProvider is mounted EXACTLY ONCE. Nesting it would
              shadow the outer state and the runner would never paint.

              The tour content bundle comes from /tour-content.json
              (admin-editable JSON, loaded at boot via Root above).
              Edit that file to retheme the tour catalogue for your
              own domain. See docs/tour-customization.md.
            */}
            <Root />
            <Toaster position="bottom-right" />
          </TooltipProvider>
          {/*
            The TanStack Query devtools toggle button is fixed to the
            bottom-right corner with a large invisible hit area; the
            annotation-workspace and ontology-workspace FABs sit at the
            same corner and the devtools intercept their clicks. Skip in
            test/E2E (NODE_ENV=test or VITE_E2E=1) so Playwright can hit
            the FABs.
          */}
          {config.env.mode !== 'test' && !config.deploymentMode.e2e && (
            <ReactQueryDevtools initialIsOpen={false} />
          )}
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
