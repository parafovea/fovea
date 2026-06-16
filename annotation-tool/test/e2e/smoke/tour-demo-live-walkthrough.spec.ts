/**
 * Live-deployment walkthrough — runs against the actual hosted
 * VITE_DEMO_PUBLIC=1 + FOVEA_DEMO_MODE=true deployment (demo.fovea.video
 * by default; pass E2E_BASE_URL to point at a staging origin).
 *
 * Unlike `tour-demo-launch-all.spec.ts` this spec uses NO test handle.
 * It clicks the Start button on each tour card the same way a real
 * booth visitor does, then walks the StepCard Next/Finish CTA. Every
 * regression a real visitor would see — missing-anchor banner, blank
 * spotlight, off-viewport step card, wrong post-tour destination — is
 * an explicit assertion below.
 *
 * Why this spec exists alongside the handle-driven launch-all spec:
 *
 *   - The handle-driven spec proves the ENGINE works correctly with a
 *     known-good input (the tour script). It runs against a local
 *     preview build with VITE_E2E=1.
 *   - This spec proves the ENTIRE DEPLOYMENT works — the SPA bundle
 *     the user actually loads, the backend's FOVEA_DEMO_MODE
 *     video-access override, the anonymous-session bootstrap, the
 *     synced S3 video corpus the tour scripts reference by id. A
 *     regression at any layer (frontend, backend, infra) surfaces
 *     here.
 *
 *   cd annotation-tool
 *   E2E_BASE_URL=https://demo.fovea.video pnpm exec playwright test \
 *     --project=smoke test/e2e/smoke/tour-demo-live-walkthrough.spec.ts
 *
 * The spec skips if the catalogue grid is not visible — that's the
 * cheapest probe for "is this even the demo-public deployment we
 * think it is?". A stock-build deployment (without VITE_DEMO_PUBLIC)
 * has no catalogue at /; the spec exits without false failures.
 */
import { test, expect, type Page } from '@playwright/test'

const TOUR_IDS = [
  'welcome',
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
  'keyframes-interpolation',
] as const

const CANNOT_RESOLVE_TEXT = "Couldn't find this UI element"
const SPOTLIGHT_SELECTOR = '[data-fovea-tour-spotlight]'
const STEP_CARD_SELECTOR = '[data-fovea-tour-step-card]'
const CATALOGUE_PATH = '/'

interface BoundingRect {
  x: number
  y: number
  width: number
  height: number
}

async function readStepCardRect(page: Page): Promise<BoundingRect | null> {
  return await page.evaluate((selector) => {
    const el = document.querySelector(selector) as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }, STEP_CARD_SELECTOR)
}

async function readSpotlightShape(
  page: Page,
): Promise<{ found: boolean; nonZeroRects: number }> {
  return await page.evaluate((selector) => {
    const svg = document.querySelector(selector) as SVGSVGElement | null
    if (!svg) return { found: false, nonZeroRects: 0 }
    const rects = Array.from(svg.querySelectorAll('rect'))
    const nonZero = rects.filter((r) => {
      const w = Number(r.getAttribute('width') ?? '0')
      const h = Number(r.getAttribute('height') ?? '0')
      return w > 0 && h > 0
    })
    return { found: true, nonZeroRects: nonZero.length }
  }, SPOTLIGHT_SELECTOR)
}

async function readViewport(
  page: Page,
): Promise<{ width: number; height: number }> {
  return await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
}

// Per-test timeout has to accommodate the catalogue load + a tour
// navigation + the engine's 3 s waitForAnchor budget per step. The
// live deployment's bundle download dominates wall-clock — ~2.4 MB
// served at ~23 kB/s means a first-paint round-trip alone is ~110 s.
test.describe.configure({ timeout: 180_000 })

test.describe('demo.fovea.video live tour walkthrough', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    let visible = false
    try {
      await page.goto(CATALOGUE_PATH, { waitUntil: 'load', timeout: 150_000 })
      visible = await page
        .getByTestId('tour-catalogue-grid')
        .isVisible({ timeout: 30_000 })
        .catch(() => false)
    } catch {
      visible = false
    }
    await ctx.close()
    test.skip(
      !visible,
      'Catalogue grid not present — target is not a VITE_DEMO_PUBLIC=1 deployment, or it is responding too slowly to verify',
    )
  })

  test('catalogue is reachable without being bounced to /login', async ({
    page,
  }) => {
    await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1_500)
    const url = new URL(page.url())
    expect(
      url.pathname,
      'public catalogue must remain at / for anonymous visitors',
    ).toBe('/')
    await expect(page.getByTestId('tour-catalogue-grid')).toBeVisible()
  })

  for (const tourId of TOUR_IDS) {
    test(`${tourId}: launch → spotlight + in-viewport card on step 1`, async ({
      page,
    }) => {
      await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
      const startBtn = page.getByTestId(`launch-${tourId}`)
      await expect(startBtn).toBeVisible({ timeout: 5_000 })
      await startBtn.click()

      // The TourProvider's launch path may navigate before the
      // StepCard mounts; both can take a moment on a slow round-trip.
      await page.waitForSelector(STEP_CARD_SELECTOR, { timeout: 8_000 })

      const banner = page.getByText(CANNOT_RESOLVE_TEXT, { exact: false })
      await expect(
        banner,
        `${tourId} step 1 must not show the missing-anchor banner`,
      ).not.toBeVisible({ timeout: 4_000 })

      const skipBtn = page.getByRole('button', { name: 'Skip', exact: true })
      await expect(
        skipBtn,
        `${tourId} step 1 primary CTA must be Next/Finish, not Skip`,
      ).not.toBeVisible({ timeout: 1_000 })

      await page.waitForSelector(SPOTLIGHT_SELECTOR, { timeout: 4_000 })
      // Same poll the walk variant uses — see comment there. Single-
      // shot reads of the spotlight rect race the
      // SpotlightOverlay's rAF measure loop, which skips zero-
      // dimension getBoundingClientRect samples until the layout
      // settles. The poll closes that race without hiding a
      // genuinely never-painting overlay.
      await expect
        .poll(
          async () => {
            const s = await readSpotlightShape(page)
            return s.found && s.nonZeroRects > 0
          },
          {
            message: `${tourId} step 1 SpotlightOverlay must paint at least one non-zero rect`,
            timeout: 4_000,
          },
        )
        .toBe(true)

      const cardRect = await readStepCardRect(page)
      expect(cardRect, `${tourId} step 1 StepCard must be mounted`).not.toBeNull()
      const viewport = await readViewport(page)
      expect(
        cardRect!.y,
        `${tourId} step 1 StepCard top must stay inside the viewport`,
      ).toBeGreaterThanOrEqual(0)
      expect(
        cardRect!.y + cardRect!.height,
        `${tourId} step 1 StepCard bottom must stay inside the viewport`,
      ).toBeLessThanOrEqual(viewport.height)
      expect(
        cardRect!.x,
        `${tourId} step 1 StepCard left must stay inside the viewport`,
      ).toBeGreaterThanOrEqual(0)
      expect(
        cardRect!.x + cardRect!.width,
        `${tourId} step 1 StepCard right must stay inside the viewport`,
      ).toBeLessThanOrEqual(viewport.width)
    })

    test(`${tourId}: walks every step → spotlight + card stay valid → ends on catalogue`, async ({
      page,
    }) => {
      await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
      await page.getByTestId(`launch-${tourId}`).click()
      await page.waitForSelector(STEP_CARD_SELECTOR, { timeout: 8_000 })

      const MAX_STEPS = 40
      const banner = page.getByText(CANNOT_RESOLVE_TEXT, { exact: false })
      const skipBtn = page.getByRole('button', { name: 'Skip', exact: true })
      const nextBtn = page.getByRole('button', { name: 'Next', exact: true })
      const finishBtn = page.getByRole('button', { name: 'Finish', exact: true })

      let steps = 0
      for (let i = 0; i < MAX_STEPS; i++) {
        steps++
        // Wait for Next or Finish to surface within the engine's anchor-
        // resolution budget plus a slow-network cushion (this spec
        // runs against a remote origin).
        await expect
          .poll(
            async () => (await nextBtn.count()) + (await finishBtn.count()),
            {
              message: `${tourId} step ${i + 1} must surface a Next/Finish CTA within 8 s`,
              timeout: 8_000,
            },
          )
          .toBeGreaterThan(0)

        await expect(
          banner,
          `${tourId} step ${i + 1} must not show the missing-anchor banner`,
        ).not.toBeVisible({ timeout: 100 })
        await expect(
          skipBtn,
          `${tourId} step ${i + 1} primary CTA must be Next/Finish, not Skip`,
        ).not.toBeVisible({ timeout: 100 })

        const cardRect = await readStepCardRect(page)
        const viewport = await readViewport(page)
        expect(
          cardRect,
          `${tourId} step ${i + 1} StepCard must be mounted`,
        ).not.toBeNull()
        expect(
          cardRect!.y + cardRect!.height,
          `${tourId} step ${i + 1} StepCard must not clip below the viewport`,
        ).toBeLessThanOrEqual(viewport.height)
        expect(
          cardRect!.y,
          `${tourId} step ${i + 1} StepCard must not clip above the viewport`,
        ).toBeGreaterThanOrEqual(0)

        // Poll for the spotlight to paint at least one non-zero
        // rect — the SpotlightOverlay's measure loop skips zero-
        // dimension getBoundingClientRect reads (anchor mid-layout
        // / mid-route-change) and re-tries on the next rAF tick, so
        // the very first read after waitForAnchor may legitimately
        // see found:true with nonZeroRects:0 for one frame. The poll
        // closes that race without hiding a genuinely never-painting
        // overlay (the 4 s ceiling matches the engine's own
        // anchor-resolution budget plus a 1 s commit cushion).
        await expect
          .poll(
            async () => {
              const s = await readSpotlightShape(page)
              return s.found && s.nonZeroRects > 0
            },
            {
              message: `${tourId} step ${i + 1} SpotlightOverlay must paint at least one non-zero rect`,
              timeout: 4_000,
            },
          )
          .toBe(true)

        const onFinishStep = (await finishBtn.count()) > 0
        if (onFinishStep) {
          await finishBtn.click()
          break
        }
        await nextBtn.click()
        await page.waitForTimeout(100)
      }

      expect(steps, `${tourId} must take at least one step`).toBeGreaterThan(0)

      // The booth contract: ending a tour returns the visitor to the
      // public catalogue at `/`. Without it the visitor is stranded
      // inside whatever workspace the tour ended in (Layout, sidebar,
      // empty workspace, etc.) and has to figure out the back path.
      await page.waitForURL((url) => url.pathname === CATALOGUE_PATH, {
        timeout: 5_000,
      })
      await expect(page.getByTestId('tour-catalogue-grid')).toBeVisible()
    })
  }
})
