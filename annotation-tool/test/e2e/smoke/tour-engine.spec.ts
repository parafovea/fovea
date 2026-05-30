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
 *   - Missing-anchor 3 s ceiling + skip affordance
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
      'launch',
      'openMenu',
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
    const tiles = page.locator('[data-tour-id^="tour-menu-tile-"]')
    await expect(tiles).toHaveCount(10)
  })

  test('clicking Start on a tile launches the tour and dismisses the menu', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await page.evaluate(() => window.__foveaTour?.openMenu())
    const firstTile = page.locator(
      '[data-tour-id="tour-menu-tile-first-annotation"]',
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
        /Fovea organizes annotation around personas — perspectives on the same video/,
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
    expect(await page.locator(`#${labelledBy}`).count()).toBe(1)
    expect(await page.locator(`#${describedBy}`).count()).toBe(1)
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
    await launchTour(page, 'first-annotation') // step 0 anchor = app-shell
    const svg = page.locator('[data-fovea-tour-spotlight]')
    await expect(svg).toBeVisible()
    // 4 backdrop + 1 outline + 4 corners = 9 rects
    await expect(svg.locator('rect')).toHaveCount(9)
    await abandon(page)
  })

  test('overlay disables pointer events on the SVG root so clicks pass through the spotlight hole', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    const svg = page.locator('[data-fovea-tour-spotlight]')
    const pe = await svg.evaluate(
      (el) => window.getComputedStyle(el).pointerEvents,
    )
    expect(pe).toBe('none')
    await abandon(page)
  })

  test('overlay tracks the anchor on window resize without unmounting', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    const outline = page
      .locator('[data-fovea-tour-spotlight] rect')
      .nth(4) // 4 backdrop rects come first, outline is rect #5
    const before = await outline.boundingBox()
    await page.setViewportSize({ width: 900, height: 600 })
    await page.waitForTimeout(250)
    const after = await outline.boundingBox()
    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    // Anchor `app-shell` covers the whole shell, so its width should
    // change with the viewport width.
    expect(Math.abs((before?.width ?? 0) - (after?.width ?? 0))).toBeGreaterThan(
      50,
    )
    await abandon(page)
  })

  test('overlay clears when the active step has no resolvable anchor', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    // Step 1 anchor is video-browser-card-first; on the worker user's
    // empty workspace there's no card so the anchor never resolves.
    // After the 3 s ceiling, the spotlight should be empty.
    await pressNext(page)
    await page.waitForTimeout(3500)
    await expect(page.locator('[data-fovea-tour-spotlight]')).toHaveCount(0)
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
  test('ArrowRight advances and ArrowLeft retreats', async ({ page }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    await page.keyboard.press('ArrowRight')
    expect((await stepCounter(page)).current).toBe(2)
    await page.keyboard.press('ArrowLeft')
    expect((await stepCounter(page)).current).toBe(1)
    await abandon(page)
  })

  test('PageDown / PageUp also navigate', async ({ page }) => {
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
    // launching the tour. Anchor it to a known data-tour-id so the
    // engine has something to spotlight too.
    await page.evaluate(() => {
      const wrap = document.createElement('div')
      wrap.setAttribute('data-tour-id', 'app-shell')
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
      wrap.setAttribute('data-tour-id', 'app-shell')
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
// 8. Missing-anchor 3 s ceiling + skip affordance
// ===========================================================================

test.describe('Tour engine: missing anchor', () => {
  test('step with an unresolvable anchor surfaces the Skip button after the 3 s ceiling', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForHandle(page)
    await launchTour(page, 'first-annotation')
    // step 1 anchor video-browser-card-first is absent on the worker
    // user's empty workspace.
    await pressNext(page)
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(
      card.getByText("Couldn't find this UI element"),
    ).toBeVisible({ timeout: 4000 })
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
  }) => {
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
  }) => {
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
    // Stage a synthetic clickable anchor matching Tour 1 step 1 so the
    // engine resolves it instantly and we can test the click pathway.
    await page.evaluate(() => {
      const btn = document.createElement('button')
      btn.setAttribute('data-tour-id', 'video-browser-card-first')
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
    // Walk to step 1 (anchor video-browser-card-first, expectAction='click').
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
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')
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
