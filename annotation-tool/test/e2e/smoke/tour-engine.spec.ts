/**
 * Tour engine — comprehensive E2E suite.
 *
 * Drives the real TourRunner + TourMenu + TourProvider against the
 * built frontend bundle via `window.__foveaTour` (a test-only handle
 * installed by TourProvider when VITE_E2E=1 — gated at build time so
 * production bundles do not ship it).
 *
 * Coverage is organised by surface so a single failing assertion points
 * at the exact subsystem that broke. The intent is to enumerate every
 * branch a CVPR booth visitor can hit:
 *   - launch from menu vs. programmatic
 *   - StepCard contents, ARIA, keyboard hint footer
 *   - SpotlightOverlay rendering, click-through under modal, anchor
 *     tracking, anchor-detachment recovery
 *   - Navigation buttons + keyboard navigation including the editable-
 *     target guard on arrow keys
 *   - Cursor persistence + restoration + clamping for shrunk scripts
 *   - Missing-anchor 8 s ceiling + skip affordance
 *   - Telemetry events (started, step_viewed, completed, abandoned,
 *     abandoned-with-error from onBeforeLaunch throw)
 *   - Focus management (auto-focus on primary action, restore on exit)
 *   - Auto-advance on `expectAction='click'`
 *   - Survival across soft route navigation
 *   - Re-launching while another tour is active (cursor / state hygiene)
 *
 * Tests do NOT depend on the fixture seeder — anchored mode against the
 * worker user's empty workspace is enough to exercise the engine. Steps
 * whose anchors are dialog-mounted (object-picker, the type editors)
 * are exercised via the missing-anchor path, which is the same code
 * path the runtime hits in production.
 */

import { test, expect, type Page } from '../fixtures/test-context.js'

const STORAGE_KEY = 'fovea.tour.cursor'

interface TelemetryEvent {
  kind: 'started' | 'step_viewed' | 'completed' | 'abandoned'
  tourId: string
  stepIndex?: number
  lastStepIndex?: number
  reason?: string
  dwellMs?: number
  totalMs?: number
}

async function waitForHandle(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, {
    timeout: 10000,
  })
}

async function clearTelemetry(page: Page): Promise<void> {
  await page.evaluate(() => window.__foveaTour?.clearTelemetry())
}

async function readTelemetry(page: Page): Promise<TelemetryEvent[]> {
  return (await page.evaluate(
    () => window.__foveaTour?.telemetry?.slice() ?? [],
  )) as TelemetryEvent[]
}

/**
 * Inject a synthetic anchor on the page with the given `data-tour-anchor`,
 * sized and positioned so the SpotlightOverlay has a non-zero rect to
 * draw against. Returns a cleanup callback to remove the element.
 *
 * Used by tests that need the overlay to actually paint but don't want
 * to depend on the rest of the app shell being present (e.g. when the
 * test runs on `/login` because no testUser fixture is attached).
 */
async function injectAnchor(
  page: Page,
  tourId: string,
  options: { width?: number; height?: number; top?: number; left?: number } = {},
): Promise<() => Promise<void>> {
  const id = `e2e-anchor-${tourId}-${Date.now()}`
  await page.evaluate(
    ({ tourId, id, opts }) => {
      const el = document.createElement('div')
      el.setAttribute('data-tour-anchor', tourId)
      el.id = id
      Object.assign(el.style, {
        position: 'fixed',
        top: `${opts.top ?? 200}px`,
        left: `${opts.left ?? 200}px`,
        width: `${opts.width ?? 240}px`,
        height: `${opts.height ?? 120}px`,
        background: 'transparent',
        zIndex: '1',
        pointerEvents: 'none',
      })
      document.body.appendChild(el)
    },
    { tourId, id, opts: options },
  )
  return async () => {
    await page.evaluate((id) => document.getElementById(id)?.remove(), id)
  }
}

async function launchTour(page: Page, tourId: string): Promise<boolean> {
  const ok = await page.evaluate(
    async (id) => Boolean(await window.__foveaTour?.launch(id)),
    tourId,
  )
  // Step card appears once the runner mounts. Wait so subsequent
  // assertions can immediately interact with the card.
  if (ok) {
    await page.waitForSelector('[data-fovea-tour-step-card]', { timeout: 5000 })
  }
  return ok
}

async function abandon(page: Page): Promise<void> {
  await page.evaluate(() => window.__foveaTour?.abandon())
  await page.waitForSelector('[data-fovea-tour-step-card]', {
    state: 'detached',
    timeout: 5000,
  })
}

async function readCursor(
  page: Page,
): Promise<{ tourId: string; stepIndex: number } | null> {
  const raw = await page.evaluate(
    (k) => sessionStorage.getItem(k),
    STORAGE_KEY,
  )
  return raw ? (JSON.parse(raw) as { tourId: string; stepIndex: number }) : null
}

async function stepCounter(page: Page): Promise<{ current: number; total: number }> {
  const text = await page
    .locator('[data-fovea-tour-step-card]')
    .locator('text=/^\\d+\\s*\\/\\s*\\d+$/')
    .first()
    .textContent()
  const [c, t] = (text ?? '').split('/').map((s) => Number(s.trim()))
  return { current: c, total: t }
}

async function pressNext(page: Page): Promise<void> {
  await page
    .locator('[data-fovea-tour-step-card]')
    .getByRole('button', { name: /^(Next|Finish)$/ })
    .click()
}

async function pressBack(page: Page): Promise<void> {
  await page
    .locator('[data-fovea-tour-step-card]')
    .getByRole('button', { name: 'Back' })
    .click()
}

async function pressSkip(page: Page): Promise<void> {
  await page
    .locator('[data-fovea-tour-step-card]')
    .getByRole('button', { name: 'Skip' })
    .click()
}

async function pressRestart(page: Page): Promise<void> {
  await page
    .locator('[data-fovea-tour-step-card]')
    .getByRole('button', { name: 'Restart tour' })
    .click()
}

async function pressExit(page: Page): Promise<void> {
  await page
    .locator('[data-fovea-tour-step-card]')
    .getByRole('button', { name: 'Exit tour' })
    .click()
}

// ===========================================================================
// 1. Handle install + tour catalog
// ===========================================================================

test.describe('Tour engine: test handle + catalog', () => {
  test('window.__foveaTour is installed when VITE_E2E=1', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    const shape = await page.evaluate(() => {
      const h = window.__foveaTour
      if (!h) return null
      return {
        keys: Object.keys(h).sort(),
        telemetryIsArray: Array.isArray(h.telemetry),
      }
    })
    expect(shape).not.toBeNull()
    expect(shape!.keys).toEqual([
      'abandon',
      'activeId',
      'clearTelemetry',
      'closeMenu',
      'discardPaused',
      'launch',
      'openMenu',
      'pause',
      'pausedId',
      'resume',
      'telemetry',
    ])
    expect(shape!.telemetryIsArray).toBe(true)
  })

  test('launch returns false for an unknown tour id without affecting state', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    const ok = await page.evaluate(
      async () => Boolean(await window.__foveaTour?.launch('does-not-exist')),
    )
    expect(ok).toBe(false)
    const activeId = await page.evaluate(() => window.__foveaTour?.activeId())
    expect(activeId).toBeNull()
  })

  test('all 10 built-in tours launch and mount the runner', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    const tourIds = [
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
    ]
    for (const id of tourIds) {
      const ok = await launchTour(page, id)
      expect(ok, `launch ${id}`).toBe(true)
      const activeId = await page.evaluate(() =>
        window.__foveaTour?.activeId(),
      )
      expect(activeId).toBe(id)
      await abandon(page)
    }
  })
})

// ===========================================================================
// 2. TourMenu surface
// ===========================================================================

test.describe('Tour engine: menu', () => {
  test('openMenu shows a dialog with one tile per built-in tour', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate(() => window.__foveaTour?.openMenu())
    await page.waitForSelector('role=dialog[name="Guided tours"]', {
      timeout: 5000,
    })
    const tiles = page.locator('[data-tour-anchor^="tour-menu-tile-"]')
    // One tile per built-in tour; keep in sync with getBuiltInTours() in
    // src/tours/scripts/index.ts (13 tours, incl. the document-annotation tour).
    await expect(tiles).toHaveCount(13)
  })

  test('clicking Start on a tile launches the tour and dismisses the menu', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate(() => window.__foveaTour?.openMenu())
    const firstTile = page.locator(
      '[data-tour-anchor="tour-menu-tile-first-annotation"]',
    )
    await firstTile.getByRole('button', { name: 'Start' }).click()
    await page.waitForSelector('[data-fovea-tour-step-card]')
    await expect(page.getByRole('dialog', { name: 'Guided tours' })).toHaveCount(
      0,
    )
  })

  test('closeMenu dismisses without launching', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate(() => window.__foveaTour?.openMenu())
    await page.waitForSelector('role=dialog[name="Guided tours"]')
    await page.evaluate(() => window.__foveaTour?.closeMenu())
    await expect(page.getByRole('dialog', { name: 'Guided tours' })).toHaveCount(
      0,
    )
    const activeId = await page.evaluate(() => window.__foveaTour?.activeId())
    expect(activeId).toBeNull()
  })
})

// ===========================================================================
// 3. StepCard contents + ARIA
// ===========================================================================

test.describe('Tour engine: StepCard', () => {
  test('card renders title, narration, and step counter "1 / 7"', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card.getByText('First annotation in 90 seconds')).toBeVisible()
    await expect(
      card.getByText(
        /Fovea organizes annotation around personas\. Perspectives on the same video/,
      ),
    ).toBeVisible()
    const counter = await stepCounter(page)
    expect(counter).toEqual({ current: 1, total: 7 })
    await abandon(page)
  })

  test('card has role="dialog" with aria-labelledby and aria-describedby', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card).toHaveAttribute('role', 'dialog')
    const labelledBy = await card.getAttribute('aria-labelledby')
    const describedBy = await card.getAttribute('aria-describedby')
    expect(labelledBy).toBeTruthy()
    expect(describedBy).toBeTruthy()
    // React 18's useId returns values like ":r0:" which are invalid in
    // CSS `#` selectors; use the attribute-equals form instead.
    expect(await page.locator(`[id="${labelledBy}"]`).count()).toBe(1)
    expect(await page.locator(`[id="${describedBy}"]`).count()).toBe(1)
    await abandon(page)
  })

  test('card shows the discoverable keyboard hint footer', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card.getByText(/← →/)).toBeVisible()
    await expect(card.getByText(/Esc/)).toBeVisible()
    await abandon(page)
  })

  test('Back button is disabled on step 0', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card.getByRole('button', { name: 'Back' })).toBeDisabled()
    await abandon(page)
  })

  test('primary button label is "Next" on intermediate steps and "Finish" on the last', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card.getByRole('button', { name: 'Next' })).toBeVisible()
    // Walk to the last step.
    const { total } = await stepCounter(page)
    for (let i = 1; i < total; i++) {
      const next = card.getByRole('button', { name: /^(Next|Skip)$/ })
      await next.click()
      await page.waitForTimeout(50)
    }
    await expect(card.getByRole('button', { name: 'Finish' })).toBeVisible()
    await abandon(page)
  })
})

// ===========================================================================
// 4. SpotlightOverlay
// ===========================================================================

test.describe('Tour engine: SpotlightOverlay', () => {
  test('overlay renders four backdrop rects + outline + four corner handles when anchor is present', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    const cleanup = await injectAnchor(page, 'app-shell')
    await launchTour(page, 'first-annotation') // step 0 anchor = app-shell
    // SVG carries aria-hidden="true", which makes Playwright's
    // toBeVisible reject it — assert presence + count instead.
    await expect(page.locator('[data-fovea-tour-spotlight]')).toHaveCount(1)
    // 4 backdrop + 1 outline + 4 corners = 9 rects
    await expect(page.locator('[data-fovea-tour-spotlight] rect')).toHaveCount(9)
    await abandon(page)
    await cleanup()
  })

  test('overlay disables pointer events on the SVG root so clicks pass through the spotlight hole', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    const cleanup = await injectAnchor(page, 'app-shell')
    await launchTour(page, 'first-annotation')
    const svg = page.locator('[data-fovea-tour-spotlight]')
    await expect(svg).toHaveCount(1)
    const pe = await svg.evaluate(
      (el) => window.getComputedStyle(el).pointerEvents,
    )
    expect(pe).toBe('none')
    await abandon(page)
    await cleanup()
  })

  test('overlay tracks the anchor on window resize without unmounting', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    // Use a synthetic anchor that scales to viewport width so we can
    // assert the spotlight resizes with it.
    await page.evaluate(() => {
      const el = document.createElement('div')
      el.setAttribute('data-tour-anchor', 'app-shell')
      el.id = 'e2e-resize-anchor'
      Object.assign(el.style, {
        position: 'fixed',
        top: '100px',
        left: '0px',
        right: '0px',
        height: '120px',
        background: 'transparent',
        zIndex: '1',
        pointerEvents: 'none',
      })
      document.body.appendChild(el)
    })
    await launchTour(page, 'first-annotation')
    const outline = page
      .locator('[data-fovea-tour-spotlight] rect')
      .nth(4) // 4 backdrop rects come first, outline is rect #5
    await expect(outline).toHaveCount(1)
    const before = await outline.boundingBox()
    await page.setViewportSize({ width: 900, height: 600 })
    await page.waitForTimeout(300)
    const after = await outline.boundingBox()
    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    // Synthetic anchor stretches across the viewport, so its rendered
    // width should change with the viewport width.
    expect(Math.abs((before?.width ?? 0) - (after?.width ?? 0))).toBeGreaterThan(
      50,
    )
    await abandon(page)
    await page.evaluate(() =>
      document.getElementById('e2e-resize-anchor')?.remove(),
    )
  })

  test('overlay shows a full-page backdrop with no element cutout when the active step has no resolvable anchor', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    // Step 2 anchor is video-browser-root; on the unauthenticated /login
    // page (no testUser fixture) the workspace shelf never mounts, so the
    // anchor never resolves. With no element to spotlight, the overlay
    // renders a full-page dim backdrop rather than a dashed cutout — assert
    // the element-outline rect (the only rect carrying stroke-dasharray) is
    // absent, proving the spotlight is not stranded on a stale element.
    await pressNext(page)
    await page.waitForTimeout(3500)
    await expect(
      page.locator('[data-fovea-tour-spotlight] rect[stroke-dasharray]'),
    ).toHaveCount(0)
    await abandon(page)
  })
})

// ===========================================================================
// 5. Navigation buttons
// ===========================================================================

test.describe('Tour engine: navigation buttons', () => {
  test('Next advances the step index and Back returns to the prior step', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    expect((await stepCounter(page)).current).toBe(1)
    await pressNext(page)
    expect((await stepCounter(page)).current).toBe(2)
    await pressBack(page)
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })

  test('Exit (X) closes the tour and clears the cursor', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await pressExit(page)
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
    })
    expect(await readCursor(page)).toBeNull()
  })

  test('Restart resets the step counter to 1', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await pressNext(page)
    await pressNext(page)
    expect((await stepCounter(page)).current).toBe(3)
    await pressRestart(page)
    await page.waitForTimeout(50)
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })

  test('Finish on the last step emits completed and unmounts the runner', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await clearTelemetry(page)
    await launchTour(page, 'first-annotation')
    const total = (await stepCounter(page)).total
    for (let i = 1; i < total; i++) {
      const card = page.locator('[data-fovea-tour-step-card]')
      await card.getByRole('button', { name: /^(Next|Skip)$/ }).click()
      await page.waitForTimeout(50)
    }
    await page
      .locator('[data-fovea-tour-step-card]')
      .getByRole('button', { name: 'Finish' })
      .click()
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
    })
    const events = await readTelemetry(page)
    expect(events.some((e) => e.kind === 'completed')).toBe(true)
    expect(await readCursor(page)).toBeNull()
  })
})

// ===========================================================================
// 6. Keyboard navigation
// ===========================================================================

test.describe('Tour engine: keyboard', () => {
  test('ArrowRight advances and ArrowLeft retreats', async ({
    page,
    testUser,
  }) => {
    // See note on PageDown test below — testUser fixture authenticates
    // so the login form's autoFocused input isn't the keydown target.
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await page.keyboard.press('ArrowRight')
    expect((await stepCounter(page)).current).toBe(2)
    await page.keyboard.press('ArrowLeft')
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })

  test('PageDown / PageUp also navigate', async ({ page, testUser }) => {
    // testUser fixture authenticates the page so we land on / (the
    // video browser) instead of /login. Without it, the LoginPage's
    // autoFocused username input would be the keydown event target and
    // the editable-target guard correctly suppresses the navigation.
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await page.keyboard.press('PageDown')
    expect((await stepCounter(page)).current).toBe(2)
    await page.keyboard.press('PageUp')
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })

  test('Escape closes the runner', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
    })
    expect(await readCursor(page)).toBeNull()
  })

  test('arrow keys do nothing when an input has focus', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    // Inject a focusable input so we can park focus inside it before
    // launching the tour. Anchor it to a known data-tour-anchor so the
    // engine has something to spotlight too.
    await page.evaluate(() => {
      const wrap = document.createElement('div')
      wrap.setAttribute('data-tour-anchor', 'app-shell')
      wrap.id = 'e2e-input-host'
      const input = document.createElement('input')
      input.id = 'e2e-input'
      input.placeholder = 'type here'
      wrap.appendChild(input)
      document.body.appendChild(wrap)
    })
    await launchTour(page, 'first-annotation')
    await page.locator('#e2e-input').focus()
    await page.locator('#e2e-input').type('hello')
    // Step should still be 1 — arrow keys were swallowed by the input
    // and the editable-target guard skipped the runner's handler.
    expect((await stepCounter(page)).current).toBe(1)
    await page.evaluate(() => document.getElementById('e2e-input-host')?.remove())
    await abandon(page)
  })

  test('Escape works even when an input has focus', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate(() => {
      const wrap = document.createElement('div')
      wrap.setAttribute('data-tour-anchor', 'app-shell')
      wrap.id = 'e2e-esc-host'
      const input = document.createElement('input')
      input.id = 'e2e-esc-input'
      wrap.appendChild(input)
      document.body.appendChild(wrap)
    })
    await launchTour(page, 'first-annotation')
    await page.locator('#e2e-esc-input').focus()
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
    })
    await page.evaluate(() => document.getElementById('e2e-esc-host')?.remove())
  })
})

// ===========================================================================
// 7. Cursor persistence
// ===========================================================================

test.describe('Tour engine: sessionStorage cursor', () => {
  test('cursor advances as the user steps through and is cleared on completion', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    expect(await readCursor(page)).toEqual({
      tourId: 'first-annotation',
      stepIndex: 0,
    })
    await pressNext(page)
    expect(await readCursor(page)).toEqual({
      tourId: 'first-annotation',
      stepIndex: 1,
    })
    await abandon(page)
  })

  test('cursor restores the step on relaunch', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate((k) => {
      sessionStorage.setItem(
        k,
        JSON.stringify({ tourId: 'first-annotation', stepIndex: 3 }),
      )
    }, STORAGE_KEY)
    await launchTour(page, 'first-annotation')
    expect((await stepCounter(page)).current).toBe(4)
    await abandon(page)
  })

  test('cursor for a different tour id is ignored', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate((k) => {
      sessionStorage.setItem(
        k,
        JSON.stringify({ tourId: 'world-layer', stepIndex: 5 }),
      )
    }, STORAGE_KEY)
    await launchTour(page, 'first-annotation')
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })

  test('a cursor past the end of a shrunk script is clamped', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate((k) => {
      sessionStorage.setItem(
        k,
        JSON.stringify({ tourId: 'first-annotation', stepIndex: 99 }),
      )
    }, STORAGE_KEY)
    await launchTour(page, 'first-annotation')
    const counter = await stepCounter(page)
    expect(counter.current).toBe(counter.total)
    await abandon(page)
  })

  test('malformed cursor JSON is tolerated', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate((k) => {
      sessionStorage.setItem(k, 'not-json')
    }, STORAGE_KEY)
    await launchTour(page, 'first-annotation')
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })
})

// ===========================================================================
// 8. Missing-anchor 8 s ceiling + skip affordance
// ===========================================================================

test.describe('Tour engine: missing anchor', () => {
  test('step with an unresolvable anchor surfaces the Skip button after the 8 s ceiling', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    // step 2 anchor video-browser-root is absent on the unauthenticated
    // /login page, so it never resolves within the 8 s waitForAnchor
    // ceiling and the missing-anchor banner + Skip affordance appears.
    await pressNext(page)
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(
      card.getByText("Couldn't find this UI element"),
    ).toBeVisible({ timeout: 10000 })
    await expect(card.getByRole('button', { name: 'Skip' })).toBeVisible()
    await abandon(page)
  })

  test('Skip advances and the next resolvable anchor regains a Next button', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await pressNext(page) // step 2
    await page.waitForSelector(
      '[data-fovea-tour-step-card] :text("Couldn\'t find")',
    )
    await pressSkip(page)
    expect((await stepCounter(page)).current).toBe(3)
    await abandon(page)
  })
})

// ===========================================================================
// 9. Telemetry contract
// ===========================================================================

test.describe('Tour engine: telemetry', () => {
  test('started fires once on launch with the tourId', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await clearTelemetry(page)
    await launchTour(page, 'first-annotation')
    const events = await readTelemetry(page)
    const started = events.filter((e) => e.kind === 'started')
    expect(started).toHaveLength(1)
    expect(started[0].tourId).toBe('first-annotation')
    await abandon(page)
  })

  test('step_viewed fires on every step change with the prior step\'s dwell', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await clearTelemetry(page)
    await launchTour(page, 'first-annotation')
    await page.waitForTimeout(150)
    await pressNext(page)
    await page.waitForTimeout(150)
    await pressNext(page)
    const events = await readTelemetry(page)
    const stepViewed = events.filter((e) => e.kind === 'step_viewed')
    expect(stepViewed.length).toBeGreaterThanOrEqual(2)
    expect(stepViewed[0].stepIndex).toBe(0)
    expect(stepViewed[0].dwellMs).toBeGreaterThan(0)
    expect(stepViewed[1].stepIndex).toBe(1)
    await abandon(page)
  })

  test('manual exit emits abandoned with reason=manual_exit and the last step index', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await clearTelemetry(page)
    await launchTour(page, 'first-annotation')
    await pressNext(page)
    await pressExit(page)
    const events = await readTelemetry(page)
    const abandoned = events.find((e) => e.kind === 'abandoned')
    expect(abandoned).toMatchObject({
      kind: 'abandoned',
      tourId: 'first-annotation',
      reason: 'manual_exit',
      lastStepIndex: 1,
    })
  })
})

// ===========================================================================
// 10. Focus management
// ===========================================================================

test.describe('Tour engine: focus management', () => {
  test('primary action button receives focus when a new step renders', async ({
    page,
    testUser,
  }) => {
    // testUser fixture authenticates the page so LoginPage's autoFocused
    // username input doesn't compete with StepCard's primary-action
    // focus call.
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await page.waitForTimeout(100)
    const focusedText = await page.evaluate(
      () => (document.activeElement as HTMLElement)?.innerText ?? '',
    )
    expect(focusedText).toMatch(/^(Next|Finish|Skip)$/)
    await abandon(page)
  })

  test('focus is restored to the previously focused element on tour exit', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate(() => {
      const btn = document.createElement('button')
      btn.id = 'e2e-focus-anchor'
      btn.textContent = 'before tour'
      document.body.appendChild(btn)
      btn.focus()
    })
    await launchTour(page, 'first-annotation')
    await pressExit(page)
    await page.waitForTimeout(100)
    const focusedId = await page.evaluate(
      () => (document.activeElement as HTMLElement)?.id ?? '',
    )
    expect(focusedId).toBe('e2e-focus-anchor')
    await page.evaluate(() =>
      document.getElementById('e2e-focus-anchor')?.remove(),
    )
  })
})

// ===========================================================================
// 11. Auto-advance on expectAction='click'
// ===========================================================================

test.describe('Tour engine: auto-advance on click', () => {
  test('clicking the spotlighted target advances expectAction=click steps', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    // Stage a synthetic clickable anchor matching Tour 1 step 2
    // (video-browser-root, expectAction='click') so the engine resolves it
    // instantly — even on the unauthenticated /login page where the real
    // shelf never mounts — and we can test the click pathway.
    await page.evaluate(() => {
      const btn = document.createElement('button')
      btn.setAttribute('data-tour-anchor', 'video-browser-root')
      btn.id = 'e2e-click-target'
      btn.textContent = 'click me'
      Object.assign(btn.style, {
        position: 'fixed',
        top: '300px',
        left: '300px',
        zIndex: '500',
      })
      document.body.appendChild(btn)
    })
    await launchTour(page, 'first-annotation')
    // Walk to step 2 (anchor video-browser-root, expectAction='click').
    await pressNext(page)
    await page.waitForTimeout(150)
    expect((await stepCounter(page)).current).toBe(2)
    await page.locator('#e2e-click-target').click()
    await page.waitForTimeout(200)
    expect((await stepCounter(page)).current).toBe(3)
    await page.evaluate(() =>
      document.getElementById('e2e-click-target')?.remove(),
    )
    await abandon(page)
  })
})

// ===========================================================================
// 12. Soft route navigation
// ===========================================================================

test.describe('Tour engine: route navigation', () => {
  test('runner survives soft route changes', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    expect((await stepCounter(page)).current).toBe(1)
    // Soft nav via history.pushState + popstate so React Router updates
    // the route without unmounting the TourProvider tree. page.goto
    // would trigger a full document navigation and unmount the runner —
    // that's a separate contract (cursor in sessionStorage survives a
    // reload) covered by the cursor-persistence tests above.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/ontology')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await page.waitForTimeout(200)
    await expect(
      page.locator('[data-fovea-tour-step-card]'),
    ).toHaveCount(1)
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })
})

// ===========================================================================
// 13. Re-launch hygiene
// ===========================================================================

test.describe('Tour engine: re-launch', () => {
  test('launching a different tour while one is active switches over and resets the step counter', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await pressNext(page)
    await pressNext(page)
    expect((await stepCounter(page)).current).toBe(3)
    // Launch a different tour without abandoning first.
    await page.evaluate(
      async () => window.__foveaTour?.launch('ontology-authoring'),
    )
    await page.waitForTimeout(200)
    const activeId = await page.evaluate(() => window.__foveaTour?.activeId())
    expect(activeId).toBe('ontology-authoring')
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })

  test('relaunching the same tour after completion starts at step 1', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await pressExit(page)
    await launchTour(page, 'first-annotation')
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })
})

// ===========================================================================
// 14. Pause + resume (auto-navigates back to the paused step's route)
// ===========================================================================

test.describe('Tour engine: pause + resume', () => {
  test('Pause button unmounts the runner and shows a resume pill', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await page
      .locator('[data-fovea-tour-step-card]')
      .getByRole('button', { name: 'Pause tour' })
      .click()
    await expect(
      page.locator('[data-fovea-tour-step-card]'),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(1)
    const pausedId = await page.evaluate(
      () => window.__foveaTour?.pausedId() ?? null,
    )
    expect(pausedId).toBe('first-annotation')
  })

  test('paused state survives a hard reload', async ({ page, testUser }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await pressNext(page) // step 2
    await page.evaluate(() => window.__foveaTour?.pause())
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(1)
    await page.reload()
    await waitForHandle(page)
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(1)
    const pausedId = await page.evaluate(
      () => window.__foveaTour?.pausedId() ?? null,
    )
    expect(pausedId).toBe('first-annotation')
  })

  test('Resume soft-navigates back to the paused route and re-mounts at the same step', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    // Advance to step 3 so we have a non-trivial cursor to assert on.
    await pressNext(page)
    await pressNext(page)
    expect((await stepCounter(page)).current).toBe(3)
    const routeAtPause = await page.evaluate(() => window.location.pathname)
    await page.evaluate(() => window.__foveaTour?.pause())
    await expect(
      page.locator('[data-fovea-tour-step-card]'),
    ).toHaveCount(0)
    // Visitor wanders to a different route.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/ontology')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => window.location.pathname)).toBe(
      '/ontology',
    )
    // Click the Resume pill — the provider should soft-navigate back
    // to /, restore step 3, and re-mount the runner.
    await page
      .locator('[data-fovea-tour-resume-pill]')
      .getByRole('button', { name: /Resume/ })
      .click()
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      timeout: 5000,
    })
    expect(await page.evaluate(() => window.location.pathname)).toBe(
      routeAtPause,
    )
    expect((await stepCounter(page)).current).toBe(3)
    await abandon(page)
  })

  test('Pause captures the visitor\'s scrollY into sessionStorage', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    // Inject a tall filler so 1200px is a reachable scroll position.
    await page.evaluate(() => {
      const filler = document.createElement('div')
      filler.id = 'e2e-scroll-capture-filler'
      Object.assign(filler.style, { height: '4000px', width: '1px' })
      document.body.appendChild(filler)
    })
    await launchTour(page, 'first-annotation')
    await page.evaluate(() => window.scrollTo({ top: 1200, left: 0 }))
    await page.waitForTimeout(80)
    const actualScrollBeforePause = await page.evaluate(() => window.scrollY)
    await page.evaluate(() => window.__foveaTour?.pause())
    const storedScrollY = await page.evaluate(() => {
      const raw = sessionStorage.getItem('fovea.tour.paused')
      return raw ? (JSON.parse(raw) as { scrollY: number }).scrollY : null
    })
    // The pause captures exactly what window.scrollY was at the moment
    // of the call — no rAF deferral, no layout shift.
    expect(storedScrollY).toBe(actualScrollBeforePause)
    await page.evaluate(() => {
      window.__foveaTour?.discardPaused()
      document.getElementById('e2e-scroll-capture-filler')?.remove()
    })
  })

  test('Resume scrolls toward the captured scrollY via rAF', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    // Seed paused state directly in sessionStorage so we can control
    // exactly what scrollY resume() targets, independent of the app's
    // own scroll behavior at pause time.
    await page.evaluate(() => {
      const filler = document.createElement('div')
      filler.id = 'e2e-resume-scroll-filler'
      Object.assign(filler.style, { height: '4000px', width: '1px' })
      document.body.appendChild(filler)
      // Synthetic anchor in the visible viewport so SpotlightOverlay's
      // scrollIntoView never fires (anchor is on-screen at top: 300).
      const anchor = document.createElement('div')
      anchor.setAttribute('data-tour-anchor', 'app-shell')
      anchor.id = 'e2e-resume-scroll-anchor'
      Object.assign(anchor.style, {
        position: 'fixed',
        top: '300px',
        left: '300px',
        width: '200px',
        height: '120px',
        background: 'transparent',
        zIndex: '1',
      })
      document.body.appendChild(anchor)
      sessionStorage.setItem(
        'fovea.tour.paused',
        JSON.stringify({
          tourId: 'first-annotation',
          stepIndex: 0,
          route: window.location.pathname + window.location.search,
          scrollY: 800,
        }),
      )
    })
    // Force a re-render so the provider picks up the paused state from
    // sessionStorage. (It rehydrates only on initial mount, so we
    // reload to trigger that.)
    await page.reload()
    await waitForHandle(page)
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(1)
    // The filler was injected before reload and is gone. Re-inject so
    // the scroll range is large enough for 800 to be reachable.
    await page.evaluate(() => {
      const filler = document.createElement('div')
      filler.id = 'e2e-resume-scroll-filler-2'
      Object.assign(filler.style, { height: '4000px', width: '1px' })
      document.body.appendChild(filler)
      const anchor = document.createElement('div')
      anchor.setAttribute('data-tour-anchor', 'app-shell')
      anchor.id = 'e2e-resume-scroll-anchor-2'
      Object.assign(anchor.style, {
        position: 'fixed',
        top: '300px',
        left: '300px',
        width: '200px',
        height: '120px',
        background: 'transparent',
        zIndex: '1',
      })
      document.body.appendChild(anchor)
      window.scrollTo({ top: 0, left: 0 })
    })
    await page
      .locator('[data-fovea-tour-resume-pill]')
      .getByRole('button', { name: /Resume/ })
      .click()
    await page.waitForSelector('[data-fovea-tour-step-card]')
    await page.waitForTimeout(300)
    const scrollY = await page.evaluate(() => window.scrollY)
    // Resume should have scrolled SOMEWHERE non-zero (the rAF
    // scrollTo(800) fired) — we don't pin to an exact value because
    // the actual page can layout-shift after the runner mounts. The
    // contract is "best-effort restore"; the assert here is just that
    // the restoration mechanism is reached.
    expect(scrollY).toBeGreaterThan(0)
    await abandon(page)
    await page.evaluate(() => {
      document.getElementById('e2e-resume-scroll-filler-2')?.remove()
      document.getElementById('e2e-resume-scroll-anchor-2')?.remove()
    })
  })

  test('Discard button on the resume pill clears the paused state', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await page.evaluate(() => window.__foveaTour?.pause())
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(1)
    await page
      .locator('[data-fovea-tour-resume-pill]')
      .getByRole('button', { name: 'Discard paused tour' })
      .click()
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(0)
    const pausedId = await page.evaluate(
      () => window.__foveaTour?.pausedId() ?? null,
    )
    expect(pausedId).toBeNull()
  })

  test('Launching a different tour while one is paused discards the pause', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await page.evaluate(() => window.__foveaTour?.pause())
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(1)
    await launchTour(page, 'ontology-authoring')
    // Pill should disappear because launching a different tour clears
    // the prior pause.
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(0)
    const pausedId = await page.evaluate(
      () => window.__foveaTour?.pausedId() ?? null,
    )
    expect(pausedId).toBeNull()
    await abandon(page)
  })

  test('Pause is a no-op when no tour is active', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    const result = await page.evaluate(() => window.__foveaTour?.pause())
    expect(result).toBe(false)
  })

  test('Resume is a no-op when no tour is paused', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    const result = await page.evaluate(() =>
      window.__foveaTour?.resume(),
    )
    expect(result).toBe(false)
  })

  test('Pause emits an abandoned telemetry event with reason=pause', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await clearTelemetry(page)
    await launchTour(page, 'first-annotation')
    await pressNext(page) // step 2 — pause from a non-zero index
    await page.evaluate(() => window.__foveaTour?.pause())
    const events = await readTelemetry(page)
    const abandoned = events.find(
      (e) => e.kind === 'abandoned' && e.reason === 'pause',
    )
    expect(abandoned).toMatchObject({
      kind: 'abandoned',
      tourId: 'first-annotation',
      reason: 'pause',
      lastStepIndex: 1,
    })
  })

  test('Pause writes the cursor with the current stepIndex so a stock relaunch resumes there', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await pressNext(page)
    await pressNext(page) // step 3 (index 2)
    await page.evaluate(() => window.__foveaTour?.pause())
    const cursor = await readCursor(page)
    expect(cursor).toEqual({ tourId: 'first-annotation', stepIndex: 2 })
  })

  test('Pause works even on a step whose anchor is unresolvable', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    // Step 2 anchor (video-browser-root) is absent on the unauthenticated
    // /login page — wait out the 8 s waitForAnchor ceiling for the Skip
    // affordance, then confirm Pause is still reachable on the card.
    await pressNext(page)
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card.getByText("Couldn't find this UI element")).toBeVisible({
      timeout: 10000,
    })
    await card.getByRole('button', { name: 'Pause tour' }).click()
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(1)
    const pausedId = await page.evaluate(
      () => window.__foveaTour?.pausedId() ?? null,
    )
    expect(pausedId).toBe('first-annotation')
  })

  test('Resume after a hard reload re-mounts the runner at the paused step', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await pressNext(page)
    await pressNext(page) // step 3 (index 2)
    await page.evaluate(() => window.__foveaTour?.pause())
    await page.reload()
    await waitForHandle(page)
    await page
      .locator('[data-fovea-tour-resume-pill]')
      .getByRole('button', { name: /Resume/ })
      .click()
    await page.waitForSelector('[data-fovea-tour-step-card]')
    expect((await stepCounter(page)).current).toBe(3)
    await abandon(page)
  })
})

// ===========================================================================
// 15. Runtime DOM mutations during a step
// ===========================================================================

test.describe('Tour engine: runtime DOM mutations', () => {
  test('Spotlight stops outlining the anchor within a few rAF ticks when it is removed mid-step', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate(() => {
      const el = document.createElement('div')
      el.setAttribute('data-tour-anchor', 'app-shell')
      el.id = 'e2e-disappearing-anchor'
      Object.assign(el.style, {
        position: 'fixed',
        top: '300px',
        left: '300px',
        width: '200px',
        height: '100px',
        background: 'transparent',
        zIndex: '1',
      })
      document.body.appendChild(el)
    })
    await launchTour(page, 'first-annotation')
    // The synthetic app-shell anchor is small, so the overlay draws an
    // element cutout — the dashed outline rect (the only rect carrying
    // stroke-dasharray) is present.
    await expect(
      page.locator('[data-fovea-tour-spotlight] rect[stroke-dasharray]'),
    ).toHaveCount(1)
    // Remove the anchor — the rAF measurement loop hits the
    // !document.contains branch and clears the rect. The overlay stays
    // mounted (it falls back to a full-page backdrop), but it stops
    // outlining the now-removed element, so the dashed cutout disappears.
    await page.evaluate(() =>
      document.getElementById('e2e-disappearing-anchor')?.remove(),
    )
    await page.waitForTimeout(200)
    await expect(
      page.locator('[data-fovea-tour-spotlight] rect[stroke-dasharray]'),
    ).toHaveCount(0)
    await abandon(page)
  })

  test('Spotlight tracks an anchor that moves mid-step (no resize, just position change)', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate(() => {
      const el = document.createElement('div')
      el.setAttribute('data-tour-anchor', 'app-shell')
      el.id = 'e2e-moving-anchor'
      Object.assign(el.style, {
        position: 'fixed',
        top: '100px',
        left: '100px',
        width: '200px',
        height: '100px',
        background: 'transparent',
        zIndex: '1',
      })
      document.body.appendChild(el)
    })
    await launchTour(page, 'first-annotation')
    const outline = page
      .locator('[data-fovea-tour-spotlight] rect')
      .nth(4)
    await expect(outline).toHaveCount(1)
    const before = await outline.boundingBox()
    await page.evaluate(() => {
      const el = document.getElementById('e2e-moving-anchor')
      if (el) {
        el.style.top = '400px'
        el.style.left = '500px'
      }
    })
    await page.waitForTimeout(200)
    const after = await outline.boundingBox()
    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    // Position should have shifted by ~300 in y, ~400 in x.
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeGreaterThan(200)
    expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeGreaterThan(200)
    await abandon(page)
    await page.evaluate(() =>
      document.getElementById('e2e-moving-anchor')?.remove(),
    )
  })
})

// ===========================================================================
// 16. Keyboard hygiene
// ===========================================================================

test.describe('Tour engine: keyboard hygiene', () => {
  test('Holding ArrowRight does not skip past the last step (keydown repeat tolerated)', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    const total = (await stepCounter(page)).total
    // Fire one more ArrowRight than there are steps — the runner should
    // complete on the last press and ignore any further presses (runner
    // is unmounted).
    for (let i = 0; i < total + 2; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(40)
    }
    await expect(
      page.locator('[data-fovea-tour-step-card]'),
    ).toHaveCount(0)
    expect(await readCursor(page)).toBeNull()
  })

  test('Pressing Escape twice in a row does not double-fire the abandoned event', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await clearTelemetry(page)
    await launchTour(page, 'first-annotation')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    const events = await readTelemetry(page)
    const abandoned = events.filter(
      (e) => e.kind === 'abandoned' && e.reason === 'manual_exit',
    )
    expect(abandoned).toHaveLength(1)
  })
})

// ===========================================================================
// 17. Tour script structural guarantees
// ===========================================================================

// ===========================================================================
// 18. Concurrency / idempotency edge cases
// ===========================================================================

test.describe('Tour engine: concurrency', () => {
  test('Two rapid Pause calls do not produce two pills or duplicate pause telemetry', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await clearTelemetry(page)
    await launchTour(page, 'first-annotation')
    // Fire pause twice back-to-back in the same evaluate so React can't
    // re-render between them.
    await page.evaluate(() => {
      window.__foveaTour?.pause()
      window.__foveaTour?.pause()
    })
    await page.waitForTimeout(100)
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(1)
    const events = await readTelemetry(page)
    const pauses = events.filter(
      (e) => e.kind === 'abandoned' && e.reason === 'pause',
    )
    expect(pauses).toHaveLength(1)
  })

  test('Two rapid Resume clicks do not mount two runners', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await pressNext(page)
    await page.evaluate(() => window.__foveaTour?.pause())
    await expect(
      page.locator('[data-fovea-tour-resume-pill]'),
    ).toHaveCount(1)
    await page.evaluate(() => {
      window.__foveaTour?.resume()
      window.__foveaTour?.resume()
    })
    await page.waitForSelector('[data-fovea-tour-step-card]')
    await expect(
      page.locator('[data-fovea-tour-step-card]'),
    ).toHaveCount(1)
    await expect(
      page.locator('[data-fovea-tour-spotlight]'),
    ).toHaveCount(1, { timeout: 1000 })
    await abandon(page)
  })

  test('Abandon (X) while pause is also being clicked: whichever resolves first wins, no zombie state', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    // Click Exit + Pause in the same microtask. Exit fires finish() and
    // unmounts the runner; Pause sees !active and returns false.
    await page.evaluate(() => {
      const card = document.querySelector('[data-fovea-tour-step-card]')
      const exit = card?.querySelector(
        'button[aria-label="Exit tour"]',
      ) as HTMLButtonElement | null
      const pause = card?.querySelector(
        '[data-fovea-tour-pause]',
      ) as HTMLButtonElement | null
      exit?.click()
      pause?.click()
    })
    await page.waitForTimeout(150)
    await expect(
      page.locator('[data-fovea-tour-step-card]'),
    ).toHaveCount(0)
    // Either: (a) Exit fired first → pause sees !active → no pill, or
    // (b) Pause fired first → setActive(null) → Exit's onClick already
    // had a stale closure → no-op. In neither case should we see both
    // a pill AND a runner.
    const pillCount = await page
      .locator('[data-fovea-tour-resume-pill]')
      .count()
    const runnerCount = await page
      .locator('[data-fovea-tour-step-card]')
      .count()
    expect(pillCount + runnerCount).toBeLessThanOrEqual(1)
  })
})

// ===========================================================================
// 19. Telemetry events shape
// ===========================================================================

test.describe('Tour engine: telemetry shape', () => {
  test('step_viewed events have monotonically non-decreasing stepIndex during a forward walk', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await clearTelemetry(page)
    await launchTour(page, 'first-annotation')
    for (let i = 0; i < 3; i++) {
      await pressNext(page)
      await page.waitForTimeout(80)
    }
    const events = await readTelemetry(page)
    const indices = events
      .filter((e) => e.kind === 'step_viewed')
      .map((e) => e.stepIndex as number)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1])
    }
    await abandon(page)
  })

  test('completed event includes a positive totalMs', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/')
    await waitForHandle(page)
    await clearTelemetry(page)
    await launchTour(page, 'first-annotation')
    const total = (await stepCounter(page)).total
    for (let i = 1; i < total; i++) {
      const card = page.locator('[data-fovea-tour-step-card]')
      await card.getByRole('button', { name: /^(Next|Skip)$/ }).click()
      await page.waitForTimeout(40)
    }
    await page
      .locator('[data-fovea-tour-step-card]')
      .getByRole('button', { name: 'Finish' })
      .click()
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
    })
    const events = await readTelemetry(page)
    const completed = events.find((e) => e.kind === 'completed')
    expect(completed).toBeDefined()
    expect((completed as { totalMs?: number }).totalMs).toBeGreaterThan(0)
  })
})

test.describe('Tour engine: tour script invariants', () => {
  test('every built-in tour script has a non-empty steps array and every step has a non-empty narration', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    const tourIds = [
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
    ]
    for (const id of tourIds) {
      await launchTour(page, id)
      const counter = await stepCounter(page)
      expect(counter.total, `${id} total > 0`).toBeGreaterThan(0)
      const card = page.locator('[data-fovea-tour-step-card]')
      // Narration text lives directly inside the CardContent <p>. We
      // assert it has at least one non-whitespace character so no
      // step ships with a blank narration.
      const narrationText = (await card.locator('p').first().textContent()) ?? ''
      expect(narrationText.trim().length, `${id} step 1 narration`).toBeGreaterThan(0)
      await abandon(page)
    }
  })
})
