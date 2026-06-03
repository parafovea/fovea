/**
 * Programmatic walkthrough of all ten built-in tours against the
 * VITE_TOUR_DEMO=1 build.
 *
 * Substitutes for the manual booth-walkthrough check (task #128) by
 * launching each tour via the engine's `window.__foveaTour.launch`
 * handle and asserting the launch returns true (tour script
 * resolved, telemetry fired, runner mounted) before abandoning it
 * and moving on to the next.
 *
 * Engage by booting BOTH the demo flag AND the E2E handle flag:
 *
 *   cd annotation-tool
 *   VITE_TOUR_DEMO=1 VITE_E2E=1 pnpm exec vite build
 *   pnpm exec vite preview --port 3050 &
 *   E2E_BASE_URL=http://localhost:3050 pnpm exec playwright test \
 *     --project=smoke test/e2e/smoke/tour-demo-launch-all.spec.ts
 *
 * The spec skips automatically when either flag is off.
 */
import { test, expect } from '@playwright/test'

const TOUR_IDS = [
  'first-annotation',
  'ontology-authoring',
  'wikidata-augmentation',
  'events-roles-claims',
  'world-layer',
  'model-in-the-loop',
  'summaries-and-claims',
  'collaboration',
  'admin',
  'import-export',
] as const

test.describe('Tour demo launch-all walkthrough', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    let demoActive = false
    page.on('console', (msg) => {
      if (msg.type() === 'info' && msg.text().includes('[tour-demo]')) {
        demoActive = true
      }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    const handleReady = await page.evaluate(
      () => typeof window.__foveaTour !== 'undefined',
    )
    await ctx.close()
    test.skip(
      !demoActive || !handleReady,
      'Need VITE_TOUR_DEMO=1 + VITE_E2E=1 build for the launch-all walkthrough',
    )
  })

  for (const tourId of TOUR_IDS) {
    test(`launches and abandons tour: ${tourId}`, async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      // Wait until the engine handle is installed (the provider
      // attaches it during its mount effect).
      await page.waitForFunction(() => typeof window.__foveaTour !== 'undefined', {
        timeout: 5_000,
      })

      const launched = await page.evaluate(async (id) => {
        return (await window.__foveaTour!.launch(id)) ?? false
      }, tourId)
      expect(launched, `${tourId} launch() should resolve true`).toBe(true)

      const activeId = await page.evaluate(() => window.__foveaTour!.activeId())
      expect(activeId, `${tourId} should be the active tour after launch`).toBe(tourId)

      // Abandon cleanly so the next iteration starts from a known
      // state.
      await page.evaluate(() => window.__foveaTour!.abandon())
      await page.waitForFunction(
        () => window.__foveaTour!.activeId() === null,
        { timeout: 3_000 },
      )
    })
  }
})
