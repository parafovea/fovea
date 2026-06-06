/**
 * Exhaustive walkthrough of every built-in tour against the demo bundle
 * (VITE_TOUR_DEMO=1 + VITE_DEMO_PUBLIC=1 + VITE_E2E=1 — the exact build
 * that ships to demo.fovea.video).
 *
 * This spec was rewritten in response to a regression where the prior
 * version (which only asserted that `launch()` returned true and the
 * primary CTA wasn't `Skip`) silently passed against a deployment that
 * shipped, in front of demo visitors, with:
 *
 *   1. every tour anchored to the public catalogue at `/` — anchors
 *      living inside `/app/annotate/:videoId` / `/app/ontology` /
 *      `/app/objects` were never reachable because the engine never
 *      navigated there. The card showed the orange "Couldn't find
 *      this UI element" banner on every non-`app-shell` step;
 *   2. the SpotlightOverlay never painted because the anchor was
 *      null at the route the runner mounted on — nothing for the
 *      backdrop / outline to render against;
 *   3. the StepCard ran off the bottom of the viewport on long
 *      narration steps because CARD_HEIGHT_ESTIMATE was 220 vs an
 *      empirical 300+ rendered height — the Back / Next buttons
 *      were clipped below the fold;
 *   4. completing or abandoning a tour did not return the visitor
 *      to the public catalogue at `/` — they were stranded inside
 *      a workspace they hadn't asked to enter;
 *   5. the public catalogue itself was unreachable because the
 *      axios interceptor treated every 401 (including the natural
 *      first-paint /api/auth/me 401 for an anonymous visitor) as a
 *      session expiry and force-redirected to /login?redirect=/.
 *
 * Every one of those failure modes has a dedicated assertion below.
 * Silence (the prior pass's failure mode) is not success — the spec
 * fails loudly if any one of them recurs.
 *
 * Engage by booting all three required flags. Build with the flags
 * set, preview, then run:
 *
 *   cd annotation-tool
 *   VITE_TOUR_DEMO=1 VITE_DEMO_PUBLIC=1 VITE_E2E=1 pnpm exec vite build
 *   pnpm exec vite preview --port 3050 &
 *   E2E_BASE_URL=http://localhost:3050 pnpm exec playwright test \
 *     --project=smoke test/e2e/smoke/tour-demo-launch-all.spec.ts
 *
 * The spec auto-skips when the demo flag or the E2E handle is off.
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

/**
 * The catalogue page lives at `/`. Tour launches push the visitor
 * into `/app/...` and tour-end navigates back to `/`. Assert this
 * everywhere so a regression to the "tour ends in a random workspace"
 * failure mode is caught.
 */
const CATALOGUE_PATH = '/'

async function readTourHandle(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__foveaTour !== 'undefined', {
    timeout: 5_000,
  })
}

interface BoundingRect {
  x: number
  y: number
  width: number
  height: number
}

async function readSpotlightRect(page: Page): Promise<BoundingRect | null> {
  return await page.evaluate((selector) => {
    const el = document.querySelector(selector) as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }, SPOTLIGHT_SELECTOR)
}

async function readStepCardRect(page: Page): Promise<BoundingRect | null> {
  return await page.evaluate((selector) => {
    const el = document.querySelector(selector) as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }, STEP_CARD_SELECTOR)
}

async function readViewport(
  page: Page,
): Promise<{ width: number; height: number }> {
  return await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
}

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
    await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    const handleReady = await page.evaluate(
      () => typeof window.__foveaTour !== 'undefined',
    )
    await ctx.close()
    test.skip(
      !demoActive || !handleReady,
      'Need VITE_TOUR_DEMO=1 + VITE_E2E=1 (and ideally VITE_DEMO_PUBLIC=1) build for the launch-all walkthrough',
    )
  })

  test('public catalogue is reachable without being bounced to /login', async ({
    page,
  }) => {
    // Regression test #5 above. A visitor with no cookies who hits the
    // catalogue must stay at `/`. The bug was that the axios
    // interceptor treated the natural /api/auth/me 401 as a session
    // expiry and dispatched session:expired → SessionManager
    // navigate(/login?redirect=/) — instant bounce.
    await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
    // Settle for the auth-restore + heartbeat round trips. 1.2 s
    // captures both the initial /api/auth/me 401 and any follow-up
    // /api/auth/session-status 401, either of which used to fire the
    // redirect.
    await page.waitForTimeout(1_200)
    const url = new URL(page.url())
    expect(url.pathname, 'catalogue must not be redirected to /login').toBe('/')
    await expect(page.getByTestId('tour-catalogue-grid')).toBeVisible()
  })

  for (const tourId of TOUR_IDS) {
    test(`launches with resolved step-1 anchor + visible spotlight + in-viewport card: ${tourId}`, async ({
      page,
    }) => {
      await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
      await readTourHandle(page)

      const launched = await page.evaluate(
        async (id) => (await window.__foveaTour!.launch(id)) ?? false,
        tourId,
      )
      expect(launched, `${tourId} launch() should resolve true`).toBe(true)

      const activeId = await page.evaluate(() => window.__foveaTour!.activeId())
      expect(activeId, `${tourId} should be the active tour after launch`).toBe(
        tourId,
      )

      // Regression #1: anchor MUST resolve. The orange banner is the
      // visible signal; assert it is absent within the engine's 3 s
      // waitForAnchor window plus a 1 s commit cushion.
      const banner = page.getByText(CANNOT_RESOLVE_TEXT, { exact: false })
      await expect(
        banner,
        `${tourId} step 1 must resolve its anchor (no "Couldn't find" banner)`,
      ).not.toBeVisible({ timeout: 4_000 })

      // Same invariant from a different rendering branch — Skip is the
      // alternate footer state to Next/Finish, gated on the same
      // `cannotResolve` flag the banner is.
      const skipBtn = page.getByRole('button', { name: 'Skip', exact: true })
      await expect(
        skipBtn,
        `${tourId} step 1 primary CTA must be Next/Finish, not Skip`,
      ).not.toBeVisible({ timeout: 1_000 })

      // Regression #2: the SpotlightOverlay MUST render against a
      // real anchor rect. Wait up to 3 s for the SVG to mount, then
      // assert it has a non-zero rect that intersects the viewport.
      // A null spotlight (no overlay element) and a zero-rect
      // spotlight (mounted but anchor never found) both fail this.
      await page.waitForSelector(SPOTLIGHT_SELECTOR, { timeout: 3_000 })
      const spotlightRect = await readSpotlightRect(page)
      expect(
        spotlightRect,
        `${tourId} step 1 must render the SpotlightOverlay element`,
      ).not.toBeNull()
      // The SpotlightOverlay's <svg> covers the viewport (width/height
      // = innerWidth/innerHeight); what matters is that it actually
      // exists AND its anchor-derived inner rect is non-zero. The
      // overlay's own bounding rect is always the viewport, so we
      // also probe one of the four backdrop rectangles which become
      // zero-area only when the anchor IS the whole viewport.
      const inner = await page.evaluate((selector) => {
        const svg = document.querySelector(selector) as SVGSVGElement | null
        if (!svg) return null
        const rects = Array.from(svg.querySelectorAll('rect'))
        // The cutout outline + four backdrop rectangles + four
        // corner handles = 9 rects. At least one of them must have a
        // non-zero width AND height for the spotlight to be visually
        // present.
        const nonZero = rects.filter((r) => {
          const w = Number(r.getAttribute('width') ?? '0')
          const h = Number(r.getAttribute('height') ?? '0')
          return w > 0 && h > 0
        })
        return { totalRects: rects.length, nonZeroRects: nonZero.length }
      }, SPOTLIGHT_SELECTOR)
      expect(
        inner,
        `${tourId} step 1 SpotlightOverlay must contain rect children`,
      ).not.toBeNull()
      expect(
        inner!.nonZeroRects,
        `${tourId} step 1 SpotlightOverlay must paint at least one non-zero rect`,
      ).toBeGreaterThan(0)

      // Regression #3: the StepCard must be FULLY inside the viewport.
      // The bug was CARD_HEIGHT_ESTIMATE = 220 vs actual ~300+ height
      // — the card's bottom edge sat below the viewport bottom and
      // the Next button was clipped.
      const cardRect = await readStepCardRect(page)
      expect(
        cardRect,
        `${tourId} step 1 must mount the StepCard element`,
      ).not.toBeNull()
      const viewport = await readViewport(page)
      expect(
        cardRect!.y,
        `${tourId} step 1 StepCard top must be >= 0 (in-viewport)`,
      ).toBeGreaterThanOrEqual(0)
      expect(
        cardRect!.y + cardRect!.height,
        `${tourId} step 1 StepCard bottom must be <= viewport.height (in-viewport)`,
      ).toBeLessThanOrEqual(viewport.height)
      expect(
        cardRect!.x,
        `${tourId} step 1 StepCard left must be >= 0 (in-viewport)`,
      ).toBeGreaterThanOrEqual(0)
      expect(
        cardRect!.x + cardRect!.width,
        `${tourId} step 1 StepCard right must be <= viewport.width (in-viewport)`,
      ).toBeLessThanOrEqual(viewport.width)
    })

    test(`walks every step, asserting anchor + spotlight + in-viewport card at each step: ${tourId}`, async ({
      page,
    }) => {
      await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
      await readTourHandle(page)

      const launched = await page.evaluate(
        async (id) => (await window.__foveaTour!.launch(id)) ?? false,
        tourId,
      )
      expect(launched, `${tourId} launch() should resolve true`).toBe(true)

      const MAX_STEPS = 40
      const banner = page.getByText(CANNOT_RESOLVE_TEXT, { exact: false })
      const skipBtn = page.getByRole('button', { name: 'Skip', exact: true })
      const nextBtn = page.getByRole('button', { name: 'Next', exact: true })
      const finishBtn = page.getByRole('button', { name: 'Finish', exact: true })

      for (let i = 0; i < MAX_STEPS; i++) {
        // Wait for either Next or Finish, with the engine's anchor-poll
        // window plus a 1 s commit cushion.
        await expect
          .poll(
            async () => (await nextBtn.count()) + (await finishBtn.count()),
            {
              message: `${tourId} step ${i + 1} must surface a Next/Finish CTA within 4 s`,
              timeout: 4_000,
            },
          )
          .toBeGreaterThan(0)

        // Per-step assertions: anchor resolved, primary CTA correct,
        // step card fully inside viewport.
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
          `${tourId} step ${i + 1} must mount the StepCard`,
        ).not.toBeNull()
        expect(
          cardRect!.y + cardRect!.height,
          `${tourId} step ${i + 1} StepCard must not clip off the viewport bottom`,
        ).toBeLessThanOrEqual(viewport.height)
        expect(
          cardRect!.y,
          `${tourId} step ${i + 1} StepCard must not clip off the viewport top`,
        ).toBeGreaterThanOrEqual(0)

        // Spotlight must paint at every step.
        const inner = await page.evaluate((selector) => {
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
        expect(
          inner.found,
          `${tourId} step ${i + 1} SpotlightOverlay must be in the DOM`,
        ).toBe(true)
        expect(
          inner.nonZeroRects,
          `${tourId} step ${i + 1} SpotlightOverlay must paint at least one non-zero rect`,
        ).toBeGreaterThan(0)

        const onFinishStep = (await finishBtn.count()) > 0
        if (onFinishStep) {
          await finishBtn.click()
          break
        }
        await nextBtn.click()
        await page.waitForTimeout(50)
      }

      // Regression #4: tour-end MUST navigate back to the catalogue.
      // In VITE_DEMO_PUBLIC builds the TourProvider's onClose handler
      // pushes `/`. Without it the booth visitor is stranded inside
      // the workspace the tour ended in.
      await page.waitForFunction(
        () => window.__foveaTour!.activeId() === null,
        { timeout: 3_000 },
      )
      await page.waitForURL((url) => url.pathname === CATALOGUE_PATH, {
        timeout: 3_000,
      })
    })
  }
})
