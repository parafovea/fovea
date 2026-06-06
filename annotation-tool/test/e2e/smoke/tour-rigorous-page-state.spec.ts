/**
 * Page-state contract spec — catches the class of bugs the engine
 * specs all miss because they only assert engine state (anchor
 * found, spotlight painted, card in viewport, URL ends at /) and
 * never assert that the page underneath is actually FUNCTIONAL.
 *
 * The bugs that motivated this spec, all visible in under ten
 * seconds of clicking through demo.fovea.video on 2026-06-05:
 *
 *   1. The VideoBrowser at /app rendered "No videos found" because
 *      the SPA's fetch dropped the anon-session cookie, even though
 *      /api/videos answered 200 to a curl with the same cookie.
 *   2. The persona dropdown rendered the raw persona UUID as its
 *      visible label during the initial /api/personas round trip.
 *   3. The "Building a persona's ontology" tour landed in the
 *      OntologyWorkspace's PersonaBrowser, which rendered "No
 *      personas found" because the fetch above 401-ed.
 *   4. Every tour anchored inside a dialog showed the missing-
 *      anchor banner from step 2 onward because the engine never
 *      opened the dialog.
 *
 * The assertions below directly contradict each one of those bugs.
 * A green run of this spec is a contract that none of them is back.
 */
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://demo.fovea.video'
const CATALOGUE_PATH = '/'
const STEP_CARD_SELECTOR = '[data-fovea-tour-step-card]'
const SPOTLIGHT_SELECTOR = '[data-fovea-tour-spotlight]'

test.describe.configure({ timeout: 180_000 })

if (BASE_URL) {
  test.use({ baseURL: BASE_URL })
}

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

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

interface PageState {
  hasEmptyStateText: false | string
  hasLoadingText: false | string
  visibleUuids: string[]
  hasMissingAnchorBanner: boolean
  primaryCtaLabel: 'Next' | 'Finish' | 'Skip' | 'none'
}

/**
 * Collect the demo-killer-bug signals the rigorous spec asserts
 * against. Reads visible text from the page body, excluding
 * controls that legitimately render UUIDs (annotation ids,
 * test-only data-* attributes, the tour engine's own debugging
 * panels in dev builds).
 */
async function readPageState(page: Page): Promise<PageState> {
  return page.evaluate(() => {
    // ── Empty-state text. Any of these strings being visible to a
    // demo visitor means the page is in its empty fallback and the
    // tour is anchored against nothing.
    const EMPTY_STATE_TEXTS = [
      'No videos found',
      'No personas found',
      'No annotations',
      'No ontology types',
      'No projects found',
      'Loading…',
      'Loading...',
    ]
    const bodyText = document.body.innerText
    let emptyHit: false | string = false
    for (const t of EMPTY_STATE_TEXTS) {
      if (bodyText.includes(t)) {
        emptyHit = t
        break
      }
    }

    // ── Loading-only viewport. A page that has zero meaningful
    // text + a single spinner glyph is the slow-load placeholder.
    const trimmed = bodyText.trim().replace(/\s+/g, ' ')
    const loadingOnly =
      trimmed.length < 30 && /(loading|please wait|connecting)/i.test(trimmed)

    // ── UUID anywhere in user-visible text. Walks the DOM looking
    // at text nodes inside elements that are visible (offsetParent
    // !== null) and collects matches. data-* attributes and hidden
    // form inputs are not collected because they are not visible
    // to the visitor.
    const visibleUuids: string[] = []
    const uuidRe =
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const el = node.parentElement
          if (!el) return NodeFilter.FILTER_REJECT
          if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') {
            return NodeFilter.FILTER_REJECT
          }
          // Allow-list elements that legitimately render UUIDs as
          // user-readable info — admin "User ID" rows, tour
          // engine internal panes. None of these surface on the
          // booth flow we're testing.
          const allowAttr = el.closest('[data-uuid-display="ok"]')
          if (allowAttr) return NodeFilter.FILTER_REJECT
          if (el.offsetParent === null) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        },
      },
    )
    let n: Node | null = walker.nextNode()
    while (n) {
      const text = n.textContent ?? ''
      const matches = text.match(uuidRe)
      if (matches) visibleUuids.push(...matches)
      n = walker.nextNode()
    }

    // ── Missing-anchor banner present?
    const hasMissingAnchorBanner = bodyText.includes(
      "Couldn't find this UI element",
    )

    // ── Primary CTA label
    const skipBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Skip',
    )
    const nextBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Next',
    )
    const finishBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Finish',
    )
    let primaryCtaLabel: 'Next' | 'Finish' | 'Skip' | 'none' = 'none'
    if (finishBtn && finishBtn.offsetParent !== null) primaryCtaLabel = 'Finish'
    else if (nextBtn && nextBtn.offsetParent !== null) primaryCtaLabel = 'Next'
    else if (skipBtn && skipBtn.offsetParent !== null) primaryCtaLabel = 'Skip'

    return {
      hasEmptyStateText: emptyHit || (loadingOnly ? trimmed : (false as const)),
      hasLoadingText: loadingOnly ? trimmed : (false as const),
      visibleUuids,
      hasMissingAnchorBanner,
      primaryCtaLabel,
    }
  })
}

interface StepHealthArgs {
  tourId: string
  stepLabel: string
  page: Page
}

async function assertStepHealthy({
  tourId,
  stepLabel,
  page,
}: StepHealthArgs): Promise<void> {
  // Poll: most assertions race the post-navigation react commit +
  // the engine's anchor-resolution + the data fetch. The 5 s window
  // covers slow-load deployments (the live demo serves at ~14 kB/s
  // sometimes). A missing-anchor banner that LANDS late still fails.
  await expect
    .poll(
      async () => readPageState(page),
      { timeout: 5_000 },
    )
    .toMatchObject({
      hasEmptyStateText: false,
      hasMissingAnchorBanner: false,
    })

  const state = await readPageState(page)
  expect(
    state.primaryCtaLabel,
    `${tourId} ${stepLabel}: primary CTA must be Next or Finish, not Skip or missing`,
  ).not.toBe('Skip')
  expect(
    state.primaryCtaLabel,
    `${tourId} ${stepLabel}: primary CTA must be present`,
  ).not.toBe('none')

  // ── No raw UUIDs in the visible text. This is the persona-
  // dropdown-shows-UUID bug.
  expect(
    state.visibleUuids,
    `${tourId} ${stepLabel}: visible text contained raw UUID(s): ${state.visibleUuids.join(', ')}`,
  ).toEqual([])

  // ── StepCard fully inside the viewport on every step.
  const cardRect = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  }, STEP_CARD_SELECTOR)
  expect(cardRect, `${tourId} ${stepLabel}: StepCard must be mounted`).not.toBeNull()
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
  expect(
    cardRect!.top,
    `${tourId} ${stepLabel}: StepCard top must be inside the viewport`,
  ).toBeGreaterThanOrEqual(0)
  expect(
    cardRect!.bottom,
    `${tourId} ${stepLabel}: StepCard bottom must be inside the viewport`,
  ).toBeLessThanOrEqual(viewport.height)

  // ── SpotlightOverlay has at least one non-zero rect (the engine
  // painted against a real anchor with real layout).
  const spotlightOk = await page.evaluate((sel) => {
    const svg = document.querySelector(sel) as SVGSVGElement | null
    if (!svg) return false
    const rects = Array.from(svg.querySelectorAll('rect'))
    return rects.some((r) => {
      const w = Number(r.getAttribute('width') ?? '0')
      const h = Number(r.getAttribute('height') ?? '0')
      return w > 0 && h > 0
    })
  }, SPOTLIGHT_SELECTOR)
  expect(
    spotlightOk,
    `${tourId} ${stepLabel}: SpotlightOverlay must paint at least one non-zero rect`,
  ).toBe(true)
}

test.describe('Tour rigorous page-state walkthrough', () => {
  test.beforeAll(async ({ browser }) => {
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
    test.skip(!visible, 'Catalogue not present — target is not a VITE_DEMO_PUBLIC=1 deployment')
  })

  // ── The /app starting surface (entered from the catalogue's
  // first-annotation tour) MUST have actual video cards. This is
  // the assertion that catches the credentials/cookie bug
  // independent of any tour engine state.
  test('/app renders at least one video card after the anon-session bootstrap', async ({
    page,
  }) => {
    await page.goto(CATALOGUE_PATH, { waitUntil: 'load' })
    await page.getByTestId('launch-first-annotation').click()
    // The launch path navigates to /app + tour mounts. Wait for
    // the runner's StepCard, then poll for at least one video
    // browser card to be in the DOM. The poll is necessary because
    // the persona auto-select fires after /api/personas resolves
    // which then triggers the video-summary fanout. 12 s covers
    // the slow-load deployment.
    await page.waitForSelector(STEP_CARD_SELECTOR, { timeout: 30_000 })
    await expect
      .poll(
        async () =>
          page.locator('[data-tour-id^="video-browser-card-"]').count(),
        { timeout: 12_000 },
      )
      .toBeGreaterThan(0)
  })

  // ── The persona dropdown anywhere in the demo must never render
  // its raw value (a UUID). Walk through the tours that touch a
  // persona surface and assert.
  for (const tourId of ['first-annotation', 'ontology-authoring', 'world-layer', 'summaries-and-claims'] as const) {
    test(`${tourId}: no raw UUIDs appear in the user-visible page text`, async ({
      page,
    }) => {
      await page.goto(CATALOGUE_PATH, { waitUntil: 'load' })
      await page.getByTestId(`launch-${tourId}`).click()
      await page.waitForSelector(STEP_CARD_SELECTOR, { timeout: 30_000 })
      // Settle one tick — the persona dropdown paints in a follow-
      // up render after personas resolve. Give it 3 s to repaint
      // before the assertion fires.
      await page.waitForTimeout(3_000)
      const state = await readPageState(page)
      expect(
        state.visibleUuids,
        `${tourId}: visible text contained raw UUID(s) (probably a persona/video id displayed verbatim instead of its name): ${state.visibleUuids.join(', ')}`,
      ).toEqual([])
    })
  }

  // ── No empty-state placeholder text on any tour after launch.
  // The booth visitor should see real content from step 1 onward.
  for (const tourId of TOUR_IDS) {
    test(`${tourId}: page is functional on step 1 (no "No X found" / "Loading…" / missing-anchor banner)`, async ({
      page,
    }) => {
      await page.goto(CATALOGUE_PATH, { waitUntil: 'load' })
      await page.getByTestId(`launch-${tourId}`).click()
      await page.waitForSelector(STEP_CARD_SELECTOR, { timeout: 30_000 })
      await assertStepHealthy({
        tourId,
        stepLabel: 'step 1',
        page,
      })
    })
  }

  // ── Walk every step of every tour and assert the same per-step
  // health contract. A regression to the persona-UUID, no-videos,
  // or banner-on-step-2 bugs fails loudly here.
  for (const tourId of TOUR_IDS) {
    test(`${tourId}: every step passes the page-state contract`, async ({
      page,
    }) => {
      await page.goto(CATALOGUE_PATH, { waitUntil: 'load' })
      await page.getByTestId(`launch-${tourId}`).click()
      await page.waitForSelector(STEP_CARD_SELECTOR, { timeout: 30_000 })

      const nextBtn = page.getByRole('button', { name: 'Next', exact: true })
      const finishBtn = page.getByRole('button', { name: 'Finish', exact: true })

      for (let i = 0; i < 40; i++) {
        // Read step-counter for label
        const counter = await page
          .evaluate(() => {
            const el = document.querySelector('[aria-label^="Step "]') as HTMLElement | null
            const m = (el?.getAttribute('aria-label') ?? '').match(/Step (\d+) of (\d+)/)
            return m ? { i: parseInt(m[1]!, 10), n: parseInt(m[2]!, 10) } : null
          })
          .catch(() => null)
        const stepLabel = counter ? `step ${counter.i}/${counter.n}` : `step ${i + 1}`
        await assertStepHealthy({ tourId, stepLabel, page })

        if ((await finishBtn.count()) > 0) {
          await finishBtn.click()
          break
        }
        await nextBtn.click()
        await page.waitForTimeout(120)
      }

      // ── Tour-end returns to the public catalogue.
      await page.waitForURL((url) => url.pathname === CATALOGUE_PATH, {
        timeout: 6_000,
      })
      await expect(page.getByTestId('tour-catalogue-grid')).toBeVisible()
    })
  }
})

// Re-export the type pattern for tooling that wants to import the
// UUID_PATTERN used to scan for raw IDs.
export { UUID_PATTERN }
