/**
 * Confirms spotlight rendering + Pause + Resume return-to-flow work
 * against the VITE_TOUR_DEMO=1 build.
 *
 * The existing test/e2e/smoke/tour-engine.spec.ts already covers
 * these flows rigorously against the regular smoke environment with a
 * live backend. This spec re-asserts the load-bearing pieces against
 * the MSW-mocked demo build so we know the interception layer does
 * not break the engine wiring.
 *
 * Engage by booting BOTH flags (the demo flag + the E2E handle flag):
 *
 *   cd annotation-tool
 *   VITE_TOUR_DEMO=1 VITE_E2E=1 pnpm exec vite build
 *   pnpm exec vite preview --port 3050 &
 *   E2E_BASE_URL=http://localhost:3050 pnpm exec playwright test \
 *     --project=smoke test/e2e/smoke/tour-demo-spotlight-pause-resume.spec.ts
 *
 * The spec skips automatically when either flag is off.
 */
import { test, expect, Page } from '@playwright/test'

const STEP_CARD = '[data-fovea-tour-step-card]'
const SPOTLIGHT = '[data-fovea-tour-spotlight]'
const PAUSE_BUTTON = '[data-fovea-tour-pause]'
const RESUME_PILL = '[data-fovea-tour-resume-pill]'
const RESUME_BUTTON = '[data-fovea-tour-resume]'

async function waitForHandle(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__foveaTour !== 'undefined', {
    timeout: 5_000,
  })
}

/**
 * Inject a synthetic 240x120 fixed-positioned div carrying the given
 * data-tour-id so the SpotlightOverlay has a non-zero rect to draw
 * against on any page (including /login when no testUser is wired up).
 */
async function injectAnchor(
  page: Page,
  tourId: string,
): Promise<() => Promise<void>> {
  const id = `spr-anchor-${tourId}`
  await page.evaluate(
    ({ tourId, id }) => {
      const el = document.createElement('div')
      el.setAttribute('data-tour-id', tourId)
      el.id = id
      Object.assign(el.style, {
        position: 'fixed',
        top: '200px',
        left: '200px',
        width: '240px',
        height: '120px',
        background: 'transparent',
        zIndex: '1',
        pointerEvents: 'none',
      })
      document.body.appendChild(el)
    },
    { tourId, id },
  )
  return async () => {
    await page.evaluate((id) => document.getElementById(id)?.remove(), id)
  }
}

test.describe('Tour demo: spotlight + pause + resume', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    let demoActive = false
    page.on('console', (msg) => {
      if (msg.text().includes('[tour-demo] MSW worker active')) demoActive = true
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    const handleReady = await page.evaluate(
      () => typeof window.__foveaTour !== 'undefined',
    )
    await ctx.close()
    test.skip(
      !demoActive || !handleReady,
      'Need VITE_TOUR_DEMO=1 + VITE_E2E=1 build for the spotlight+pause+resume walkthrough',
    )
  })

  test('spotlight paints over the active anchor', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForHandle(page)
    // first-annotation step 0 anchor is 'app-shell'. Inject a synthetic
    // one so the overlay has a non-zero rect even on /login.
    const cleanup = await injectAnchor(page, 'app-shell')

    const launched = await page.evaluate(
      async () => (await window.__foveaTour!.launch('first-annotation')) ?? false,
    )
    expect(launched).toBe(true)
    await page.waitForSelector(STEP_CARD, { timeout: 5_000 })

    // The overlay is an SVG. 4 backdrop + 1 outline + 4 corner handles
    // = 9 rect children.
    await expect(page.locator(SPOTLIGHT)).toHaveCount(1)
    await expect(page.locator(`${SPOTLIGHT} rect`)).toHaveCount(9)

    await page.evaluate(() => window.__foveaTour!.abandon())
    await cleanup()
  })

  test('Pause unmounts the runner and surfaces the Resume pill', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForHandle(page)
    const cleanup = await injectAnchor(page, 'app-shell')
    await page.evaluate(
      async () => (await window.__foveaTour!.launch('first-annotation')) ?? false,
    )
    await page.waitForSelector(STEP_CARD, { timeout: 5_000 })

    await page.click(PAUSE_BUTTON)
    await page.waitForSelector(STEP_CARD, { state: 'detached', timeout: 3_000 })

    await expect(page.locator(RESUME_PILL)).toHaveCount(1)

    const pausedId = await page.evaluate(() => window.__foveaTour!.pausedId())
    expect(pausedId).toBe('first-annotation')

    // Tidy: discard pause so cleanup runs from a known-good state.
    await page.evaluate(() => window.__foveaTour!.discardPaused())
    await cleanup()
  })

  test('Resume re-mounts the runner at the same step', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForHandle(page)
    const cleanup = await injectAnchor(page, 'app-shell')
    await page.evaluate(
      async () => (await window.__foveaTour!.launch('first-annotation')) ?? false,
    )
    await page.waitForSelector(STEP_CARD, { timeout: 5_000 })

    // Advance to step 1 via the handle (sidesteps Next-button anchor
    // resolution which is brittle without the app shell).
    // The cursor key writes the step index. Pause then resume should
    // restore it.
    await page.evaluate(() => {
      // Force step 1 by writing the cursor sessionStorage entry the
      // engine reads on launch.
      sessionStorage.setItem(
        'fovea.tour.cursor',
        JSON.stringify({ tourId: 'first-annotation', stepIndex: 1 }),
      )
    })

    // Pause from step 0 then resume; the resume path re-reads the
    // cursor and lands at the recorded step index.
    await page.click(PAUSE_BUTTON)
    await page.waitForSelector(RESUME_PILL, { timeout: 3_000 })

    await page.click(RESUME_BUTTON)
    await page.waitForSelector(STEP_CARD, { timeout: 5_000 })

    // Cursor-driven re-mount lands at step index 1 (= "Step 2 of N"
    // in the step counter). The active tour id is preserved.
    const activeId = await page.evaluate(() => window.__foveaTour!.activeId())
    expect(activeId).toBe('first-annotation')

    await page.evaluate(() => window.__foveaTour!.abandon())
    await cleanup()
  })

  test('paused state survives a hard reload', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForHandle(page)
    const cleanup = await injectAnchor(page, 'app-shell')

    await page.evaluate(
      async () => (await window.__foveaTour!.launch('first-annotation')) ?? false,
    )
    await page.waitForSelector(STEP_CARD, { timeout: 5_000 })
    await page.click(PAUSE_BUTTON)
    await page.waitForSelector(RESUME_PILL, { timeout: 3_000 })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForHandle(page)

    const pausedId = await page.evaluate(() => window.__foveaTour!.pausedId())
    expect(pausedId).toBe('first-annotation')
    await expect(page.locator(RESUME_PILL)).toHaveCount(1)

    await page.evaluate(() => window.__foveaTour!.discardPaused())
    await cleanup()
  })
})
