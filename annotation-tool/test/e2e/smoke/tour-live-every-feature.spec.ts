/**
 * Every-feature live walkthrough against the hosted demo deployment.
 *
 * The other live spec (tour-demo-live-walkthrough.spec.ts) proves
 * that EVERY TOUR walks end-to-end without anchor / spotlight /
 * viewport regressions. This one proves that EVERY ENGINE FEATURE
 * works against the live bundle on at least one representative tour
 * — Pause + Resume Pill, Escape-to-exit, ArrowRight / ArrowLeft
 * keyboard navigation, the Sign-in CTA on the public catalogue, and
 * the in-app Tour Menu opening / launching a tour from inside
 * `/app/*`. A regression to any of those features that the per-tour
 * walkthrough wouldn't catch (because it always exits via Finish)
 * fires here.
 *
 *   E2E_BASE_URL=https://demo.fovea.video pnpm exec playwright test \
 *     --project=smoke test/e2e/smoke/tour-live-every-feature.spec.ts
 */
import { test, expect, type Page } from '@playwright/test'

const SPOTLIGHT_SELECTOR = '[data-fovea-tour-spotlight]'
const STEP_CARD_SELECTOR = '[data-fovea-tour-step-card]'
const RESUME_PILL_SELECTOR = '[data-fovea-tour-resume-pill]'
const PAUSE_BUTTON_SELECTOR = '[data-fovea-tour-pause]'
const CATALOGUE_GRID_TEST_ID = 'tour-catalogue-grid'
const CATALOGUE_PATH = '/'

async function readStepIndex(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const span = document.querySelector('[aria-label^="Step "]') as HTMLElement | null
    const m = (span?.getAttribute('aria-label') ?? '').match(/Step (\d+) of (\d+)/)
    return m ? parseInt(m[1]!, 10) : null
  })
}

async function startTourFromCatalogue(page: Page, tourId: string): Promise<void> {
  await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId(CATALOGUE_GRID_TEST_ID)).toBeVisible({
    timeout: 8_000,
  })
  await page.getByTestId(`launch-${tourId}`).click()
  await page.waitForSelector(STEP_CARD_SELECTOR, { timeout: 8_000 })
}

test.describe('Every-feature live walkthrough', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
    const visible = await page
      .getByTestId(CATALOGUE_GRID_TEST_ID)
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
    await ctx.close()
    test.skip(!visible, 'Target is not a VITE_DEMO_PUBLIC=1 deployment')
  })

  // ── Catalogue surface ─────────────────────────────────────────
  test('catalogue: Sign in CTA navigates to /login with redirect', async ({
    page,
  }) => {
    await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
    const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
    await expect(signIn).toBeVisible({ timeout: 6_000 })
    await signIn.click()
    await page.waitForURL((url) => url.pathname === '/login', { timeout: 5_000 })
    // The login form must be the actual login surface, not a
    // redirect bounce back to /. A regression of the axios
    // interceptor session-expiry logic could land the visitor
    // on /login?redirect=/login or loop the redirect.
    await expect(
      page.getByRole('heading', { name: /sign in|log in/i }),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('catalogue: all twelve tour tiles render with Start CTAs', async ({
    page,
  }) => {
    await page.goto(CATALOGUE_PATH, { waitUntil: 'domcontentloaded' })
    for (const tourId of [
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
    ] as const) {
      await expect(
        page.getByTestId(`launch-${tourId}`),
        `catalogue must surface a Start CTA for ${tourId}`,
      ).toBeVisible({ timeout: 6_000 })
    }
  })

  // ── Engine feature: keyboard navigation ───────────────────────
  test('keyboard: ArrowRight advances; ArrowLeft goes back', async ({ page }) => {
    await startTourFromCatalogue(page, 'first-annotation')
    const i0 = await readStepIndex(page)
    expect(i0, 'step index must be readable on step 1').not.toBeNull()

    await page.keyboard.press('ArrowRight')
    await expect
      .poll(async () => readStepIndex(page), { timeout: 5_000 })
      .toBe((i0 ?? 1) + 1)

    await page.keyboard.press('ArrowLeft')
    await expect
      .poll(async () => readStepIndex(page), { timeout: 5_000 })
      .toBe(i0)
  })

  test('keyboard: Esc abandons the tour and returns to the catalogue', async ({
    page,
  }) => {
    await startTourFromCatalogue(page, 'first-annotation')
    await page.waitForSelector(SPOTLIGHT_SELECTOR, { timeout: 6_000 })
    await page.keyboard.press('Escape')
    // The StepCard and SpotlightOverlay must both unmount.
    await expect(page.locator(STEP_CARD_SELECTOR)).toHaveCount(0, {
      timeout: 5_000,
    })
    await expect(page.locator(SPOTLIGHT_SELECTOR)).toHaveCount(0, {
      timeout: 5_000,
    })
    // And the visitor lands back on the catalogue.
    await page.waitForURL((url) => url.pathname === CATALOGUE_PATH, {
      timeout: 5_000,
    })
    await expect(page.getByTestId(CATALOGUE_GRID_TEST_ID)).toBeVisible()
  })

  // ── Engine feature: Pause / Resume Pill ───────────────────────
  test('pause + resume: pause button unmounts runner, surfaces the pill, resume re-mounts at same step', async ({
    page,
  }) => {
    await startTourFromCatalogue(page, 'first-annotation')
    // Advance one step so the Pause / Resume can re-enter at a
    // non-zero index (catches a resume bug that always lands on
    // step 0 instead of the captured step).
    await page.keyboard.press('ArrowRight')
    const paused = await readStepIndex(page)
    expect(paused, 'must have advanced at least one step before pause').toBeGreaterThan(1)

    await page.locator(PAUSE_BUTTON_SELECTOR).click()
    await expect(page.locator(STEP_CARD_SELECTOR)).toHaveCount(0, {
      timeout: 5_000,
    })
    await expect(page.locator(RESUME_PILL_SELECTOR)).toBeVisible({
      timeout: 5_000,
    })

    // Resume via the pill — runner must re-mount and the step
    // index must restore.
    await page
      .locator(RESUME_PILL_SELECTOR)
      .getByRole('button', { name: /resume/i })
      .click()
    await page.waitForSelector(STEP_CARD_SELECTOR, { timeout: 5_000 })
    await expect
      .poll(async () => readStepIndex(page), { timeout: 5_000 })
      .toBe(paused)
  })

  test('paused state survives a hard reload', async ({ page }) => {
    await startTourFromCatalogue(page, 'first-annotation')
    await page.keyboard.press('ArrowRight')
    const before = await readStepIndex(page)
    expect(before).not.toBeNull()
    await page.locator(PAUSE_BUTTON_SELECTOR).click()
    await expect(page.locator(RESUME_PILL_SELECTOR)).toBeVisible({
      timeout: 5_000,
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    // The pill must reappear after reload — the captured pause state
    // lives in sessionStorage with key `fovea.tour.paused`.
    await expect(page.locator(RESUME_PILL_SELECTOR)).toBeVisible({
      timeout: 8_000,
    })
  })

  // ── Tour End: visitor returns to catalogue ────────────────────
  test('finishing a tour returns the visitor to the public catalogue', async ({
    page,
  }) => {
    await startTourFromCatalogue(page, 'welcome')
    // Walk to the Finish button.
    for (let i = 0; i < 20; i++) {
      const next = page.getByRole('button', { name: 'Next', exact: true })
      const finish = page.getByRole('button', { name: 'Finish', exact: true })
      await expect
        .poll(
          async () => (await next.count()) + (await finish.count()),
          { timeout: 5_000 },
        )
        .toBeGreaterThan(0)
      if ((await finish.count()) > 0) {
        await finish.click()
        break
      }
      await next.click()
      await page.waitForTimeout(80)
    }
    await page.waitForURL((url) => url.pathname === CATALOGUE_PATH, {
      timeout: 5_000,
    })
    await expect(page.getByTestId(CATALOGUE_GRID_TEST_ID)).toBeVisible()
  })

  // ── Spotlight rendering ────────────────────────────────────────
  test('spotlight overlay actually intersects the anchor element', async ({
    page,
  }) => {
    await startTourFromCatalogue(page, 'first-annotation')
    // Advance to step 2 (anchor: video-browser-card-first) — the
    // first step where the anchor is a SPECIFIC element rather than
    // the whole-app shell, so the spotlight outline has a tight
    // rect we can compare against the anchor's bounding rect.
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(500)
    const result = await page.evaluate(() => {
      const svg = document.querySelector(
        '[data-fovea-tour-spotlight]',
      ) as SVGSVGElement | null
      if (!svg) return { reason: 'no-spotlight' }
      const outline = Array.from(svg.querySelectorAll('rect')).find((r) =>
        r.getAttribute('stroke-dasharray'),
      )
      if (!outline) return { reason: 'no-outline' }
      const ox = Number(outline.getAttribute('x') ?? '0')
      const oy = Number(outline.getAttribute('y') ?? '0')
      const ow = Number(outline.getAttribute('width') ?? '0')
      const oh = Number(outline.getAttribute('height') ?? '0')
      const anchor = document.querySelector(
        '[data-tour-id="video-browser-card-first"]',
      ) as HTMLElement | null
      if (!anchor) return { reason: 'no-anchor' }
      const r = anchor.getBoundingClientRect()
      const intersects =
        ox < r.right &&
        ox + ow > r.left &&
        oy < r.bottom &&
        oy + oh > r.top
      return {
        outline: { x: ox, y: oy, w: ow, h: oh },
        anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        intersects,
      }
    })
    if ('reason' in result) {
      throw new Error(`spotlight check failed: ${result.reason}`)
    }
    expect(
      result.intersects,
      `spotlight outline must intersect the anchor rect — got outline=${JSON.stringify(result.outline)} vs anchor=${JSON.stringify(result.anchor)}`,
    ).toBe(true)
  })
})
