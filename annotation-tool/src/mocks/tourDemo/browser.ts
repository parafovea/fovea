/**
 * MSW browser-worker bootstrap for the tour demo mode.
 *
 * Activated when `import.meta.env.VITE_TOUR_DEMO === '1'` (set at
 * Vite build time on the demo deployment). The worker loads the
 * deployment's `TourContentBundle` FIRST, then registers handlers
 * factory-bound to that bundle so the mocked model outputs travel
 * with whatever domain the admin themed their tours for. Swapping
 * the bundle (the same `/tour-content.json` an admin already edits
 * to retheme the narration content) reroutes the mocked model
 * outputs in lockstep.
 *
 * Unhandled requests pass through (`onUnhandledRequest: 'bypass'`)
 * so the non-mocked surfaces of the app; auth, persona CRUD, video
 * streaming, the static assets the SPA serves; keep talking to the
 * real backend exactly as they would in production. NOTE: a
 * registered service worker still intercepts every same-origin
 * fetch and routes unmatched ones through MSW's passthrough()
 * helper, which has been observed to reject with "TypeError: Failed
 * to fetch" for certain navigation requests inside the service
 * worker context. The boot-time auth probe in `main.tsx`
 * (`isRealSignedInUser`) is the real safety net: it skips MSW
 * registration entirely when a non-anonymous-demo user is signed in
 * so the worker is never installed for admin sessions and the
 * passthrough rejection cannot fire.
 *
 * The module-level guard `import.meta.env.VITE_TOUR_DEMO` is
 * statically analysable by Vite, which means the entire mocks
 * subtree gets tree-shaken out of a production build that does not
 * set the flag.
 */

import { setupWorker } from 'msw/browser'
import type { SetupWorker } from 'msw/browser'
import { createTourDemoHandlers } from './handlers'
import { loadTourContentBundle } from '@/tours/content/loader'

let activeWorker: SetupWorker | null = null

export async function startTourDemoWorker(): Promise<void> {
  if (import.meta.env.VITE_TOUR_DEMO !== '1') return
  // Load the bundle eagerly. If this fails we still want the tour
  // page to mount and emit a banner via the existing TourProvider
  // loader, so we swallow the load error here and let the
  // bundled-loader path handle it on the React side.
  let bundle
  try {
    bundle = await loadTourContentBundle()
  } catch (err) {
    console.warn(
      '[tour-demo] content bundle load failed; MSW not started:',
      err instanceof Error ? err.message : err,
    )
    return
  }
  const handlers = createTourDemoHandlers(bundle)
  activeWorker = setupWorker(...handlers)
  await activeWorker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
    },
  })
  console.info('[tour-demo] MSW worker active; model-service calls are mocked.')
}

/**
 * Test-only handle so unit tests can install a custom bundle and
 * inspect what got registered. Returns the worker instance, or null
 * if `startTourDemoWorker` has not been called or short-circuited.
 */
export function _getActiveWorkerForTesting(): SetupWorker | null {
  return activeWorker
}
