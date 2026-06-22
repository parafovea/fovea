/**
 * Tour 8 — "Collaboration: projects, groups, sharing" — end-to-end.
 * Crosses three different routes (/projects, /groups, /shared).
 * Engine's sessionStorage cursor persists state across the soft route
 * navigations the test performs.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'

const TOUR_ID = 'collaboration'

declare global {
  interface Window {
    __foveaTour?: { launch: (tourId: string) => Promise<boolean> }
  }
}

async function advanceTo(
  page: import('@playwright/test').Page,
  targetStep: number,
  totalSteps: number,
): Promise<void> {
  const card = page.locator('[data-fovea-tour-step-card]')
  for (let attempt = 0; attempt < 14; attempt++) {
    const text =
      (await card
        .locator('text=/^\\d+\\s*\\/\\s*\\d+$/')
        .first()
        .textContent()
        .catch(() => '')) ?? ''
    const match = text.match(/^(\d+)\s*\//)
    const current = match ? Number(match[1]) : 0
    if (current >= targetStep) return
    const btn = card.getByRole('button', { name: /^(Next|Skip|Finish)$/ })
    if (!(await btn.isVisible({ timeout: 500 }).catch(() => false))) {
      await page.waitForTimeout(400)
      continue
    }
    await btn.click()
  }
  void totalSteps
  throw new Error(`failed to advance to step ${targetStep} of ${totalSteps}`)
}

async function softNavigate(
  page: import('@playwright/test').Page,
  path: string,
): Promise<void> {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await page.waitForTimeout(300)
}

test.describe('Tour 8: Collaboration — end to end', () => {
  test.beforeEach(async ({ page, workerSessionToken }) => {
    await skipUnlessRealVideoCorpus(page, workerSessionToken)
  })

  test('walks all six steps across projects / groups / shared routes', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/projects')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, {
      timeout: 10000,
    })
    await page.waitForSelector('[data-tour-anchor="projects-page"]', {
      timeout: 10000,
    })

    const ok = await page.evaluate(
      async (id) => Boolean(await window.__foveaTour?.launch(id)),
      TOUR_ID,
    )
    expect(ok).toBe(true)
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card).toBeAttached({ timeout: 5000 })

    // step 1: projects-page → advance (the expectAction='click' will
    // auto-advance if the visitor clicks any project; in the test we
    // advance manually since there are no projects to click).
    await advanceTo(page, 2, 6)

    // step 2: project-video-assignment — anchor only mounts inside a
    // project's detail page; skip if missing.
    await advanceTo(page, 3, 6)

    // step 3: groups-page — navigate to /groups.
    await softNavigate(page, '/groups')
    await page
      .waitForSelector('[data-tour-anchor="groups-page"]', { timeout: 5000 })
      .catch(() => {})
    await advanceTo(page, 4, 6)

    // step 4: shared-annotations-page
    await softNavigate(page, '/shared')
    await page
      .waitForSelector('[data-tour-anchor="shared-annotations-page"]', {
        timeout: 5000,
      })
      .catch(() => {})
    await advanceTo(page, 5, 6)

    // step 5: persona-preferences-section
    await advanceTo(page, 6, 6)

    // step 6: api-keys-page → Finish
    const finishOrSkip = card.getByRole('button', { name: /^(Finish|Skip)$/ })
    await expect(finishOrSkip).toBeVisible({ timeout: 4500 })
    await finishOrSkip.click()
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
      timeout: 5000,
    })
  })
})
