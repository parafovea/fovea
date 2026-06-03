/**
 * MSW browser-worker bootstrap for the tour demo mode.
 *
 * Activated when `import.meta.env.VITE_TOUR_DEMO === '1'` (set at
 * Vite build time on the demo deployment). The worker passes through
 * every unhandled request (`onUnhandledRequest: 'bypass'`) so the
 * non-mocked surfaces of the app — auth, persona CRUD, video
 * streaming, the static assets the SPA serves — keep talking to the
 * real backend exactly as they would in production.
 *
 * The module-level guard `import.meta.env.VITE_TOUR_DEMO` is statically
 * analysable by Vite, which means the entire mocks subtree gets
 * tree-shaken out of a production build that does not set the flag.
 */

import { setupWorker } from 'msw/browser'
import { tourDemoHandlers } from './handlers'

export const tourDemoWorker = setupWorker(...tourDemoHandlers)

export async function startTourDemoWorker(): Promise<void> {
  if (import.meta.env.VITE_TOUR_DEMO !== '1') return
  await tourDemoWorker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
    },
  })
  // Log so the booth operator can tell at a glance that demo mode is
  // intercepting model-service traffic.
  // eslint-disable-next-line no-console
  console.info('[tour-demo] MSW worker active — model-service calls are mocked.')
}
