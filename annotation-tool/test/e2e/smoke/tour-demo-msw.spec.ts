/**
 * Smoke spec for the tour-demo MSW worker.
 *
 * Verifies that a frontend built with VITE_TOUR_DEMO=1 registers the
 * MSW browser worker before React mounts, intercepts every model-
 * service-bound route the tours touch, and returns the precomputed
 * fixtures from the deployment's TourContentBundle. Skipped when the
 * worker is not detected (running against a non-demo build), so this
 * spec is safe to include in the smoke project's catalogue without
 * forcing the rest of the suite to opt into the demo flag.
 *
 * Engage by booting the demo build:
 *
 *   docker compose \
 *     -f docker-compose.yml \
 *     -f docker-compose.tour-demo.yml \
 *     up -d --build frontend
 *   pnpm exec playwright test --project=smoke \
 *     test/e2e/smoke/tour-demo-msw.spec.ts
 *
 * Or against a local vite preview:
 *
 *   cd annotation-tool && VITE_TOUR_DEMO=1 pnpm exec vite build \
 *     && pnpm exec vite preview --port 3000 &
 *   pnpm exec playwright test --project=smoke \
 *     test/e2e/smoke/tour-demo-msw.spec.ts
 */
import { test, expect } from '@playwright/test'

/**
 * Returns true once the MSW worker has registered and reported it is
 * intercepting requests, false on the side of the build where the
 * VITE_TOUR_DEMO=1 flag was not threaded through.
 */
async function isTourDemoActive(page: import('@playwright/test').Page): Promise<boolean> {
  // Capture the [tour-demo] console.info the bootstrap emits when the
  // worker successfully starts. A short timeout is enough because the
  // bootstrap fires before React mounts.
  let saw = false
  const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.type() === 'info' && msg.text().includes('[tour-demo]')) {
      saw = true
    }
  }
  page.on('console', onConsole)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  // Give the dynamic import + service-worker registration a moment.
  await page.waitForTimeout(500)
  page.off('console', onConsole)
  return saw
}

test.describe('Tour demo MSW worker', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const active = await isTourDemoActive(page)
    await ctx.close()
    test.skip(
      !active,
      'tour-demo build flag (VITE_TOUR_DEMO=1) is off in this run; nothing to assert',
    )
  })

  test('intercepts the six model-service routes the tours touch', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // Wait for the worker registration log so the next fetch is
    // guaranteed to route through MSW.
    await page.waitForEvent('console', {
      predicate: (msg) => msg.text().includes('[tour-demo] MSW worker active'),
      timeout: 5_000,
    })

    // Hit each route in the browser so the Service Worker
    // interception layer is in play. page.request would BYPASS the
    // service worker because Playwright's request fixture is its own
    // HTTP client.
    const responses = await page.evaluate(async () => {
      const routes = [
        '/api/ontology/augment',
        '/api/videos/__demo__/detect',
        '/api/videos/__demo__/track',
        '/api/videos/__demo__/transcribe',
        '/api/videos/__demo__/summarize',
        '/api/claims/extract',
      ] as const
      const results: { route: string; status: number; body: unknown }[] = []
      for (const route of routes) {
        const r = await fetch(route, { method: 'POST', body: '{}' })
        const body = (await r.json()) as unknown
        results.push({ route, status: r.status, body })
      }
      return results
    })

    // Every route should have responded 200 with a non-empty body.
    for (const r of responses) {
      expect(r.status, `${r.route} status`).toBe(200)
      expect(r.body, `${r.route} body`).toBeTruthy()
    }

    // Sanity-check the shape of each route's fixture against the
    // microvent bundle defaults.
    const augment = responses.find((r) => r.route === '/api/ontology/augment')!
      .body as { suggestions: Array<{ name: string }>; reasoning: string }
    expect(augment.suggestions.length).toBeGreaterThanOrEqual(4)
    expect(augment.reasoning).toBeTruthy()

    const detect = responses.find((r) => r.route.endsWith('/detect'))!.body as {
      query: string
      frames: Array<{ detections: Array<{ label: string }> }>
    }
    expect(detect.query).toBe('container')
    expect(detect.frames[0].detections.length).toBe(4)

    const transcribe = responses.find((r) => r.route.endsWith('/transcribe'))!.body as {
      segments: Array<{ start: number; end: number; speaker: string }>
      speakers: string[]
    }
    expect(transcribe.segments.length).toBe(4)
    expect(transcribe.speakers).toContain('SPEAKER_00')
    expect(transcribe.speakers).toContain('SPEAKER_01')

    const claims = responses.find((r) => r.route === '/api/claims/extract')!.body as {
      claims: Array<{ needsSplit: boolean; splitTargets: string[] }>
    }
    expect(claims.claims).toHaveLength(1)
    expect(claims.claims[0].needsSplit).toBe(true)
    expect(claims.claims[0].splitTargets).toHaveLength(3)
  })

  test('latency feels like real inference (between 600 and 2400 ms per call)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForEvent('console', {
      predicate: (msg) => msg.text().includes('[tour-demo] MSW worker active'),
      timeout: 5_000,
    })
    const elapsed = await page.evaluate(async () => {
      const t0 = performance.now()
      await fetch('/api/ontology/augment', { method: 'POST', body: '{}' })
      return performance.now() - t0
    })
    // Handler sleeps for 800-1800 ms; allow generous bounds for
    // Playwright's overhead and CI clock noise.
    expect(elapsed).toBeGreaterThan(600)
    expect(elapsed).toBeLessThan(2400)
  })
})
