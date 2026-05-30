/**
 * Tour 6 — "Model in the loop: tracking, interpolation, detection" —
 * end-to-end. All seven steps live on annotation-workspace surfaces
 * that need model-service inference to mount their anchors (tracking
 * results, motion path overlay, detection candidates). Without model-
 * service, the engine's 3 s ceiling surfaces Skip and the tour still
 * completes — which mirrors the booth safe-mode behavior the plan
 * calls out (§9 risk 1: hide the model-in-the-loop tile when WiFi is
 * flaky).
 */

import { test, expect } from '../../fixtures/test-context.js'

const TOUR_ID = 'model-in-the-loop'

declare global {
  interface Window {
    __foveaTour?: {
      launch: (tourId: string) => Promise<boolean>
    }
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

test.describe('Tour 6: Model in the loop — end to end', () => {
  test('walks all seven steps through the model-driven annotation surfaces', async ({
    page,
    testUser,
    workerDb,
    workerUser,
    workerSessionToken,
  }) => {
    void testUser
    await workerDb.createPersona(
      {
        userId: workerUser.id,
        name: 'Model-Loop Tour Persona',
        role: 'CV-curious analyst',
      },
      workerSessionToken,
    )

    // Navigate to the annotation workspace — every Tour 6 anchor
    // mounts there (or in dialogs opened from it).
    await page.goto('/')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, {
      timeout: 10000,
    })
    await page.waitForSelector('[data-tour-id="video-browser-card-first"]', {
      timeout: 15000,
    })
    await page
      .locator('[data-tour-id="video-browser-card-first"]')
      .getByRole('button', { name: /annotate/i })
      .click()
    await page.waitForURL(/\/annotate\//, { timeout: 15000 })

    const ok = await page.evaluate(
      async (id) => Boolean(await window.__foveaTour?.launch(id)),
      TOUR_ID,
    )
    expect(ok, 'tour launched').toBe(true)
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card).toBeAttached({ timeout: 5000 })

    await advanceTo(page, 7, 7)
    const finishOrSkip = card.getByRole('button', { name: /^(Finish|Skip)$/ })
    await expect(finishOrSkip).toBeVisible({ timeout: 4500 })
    await finishOrSkip.click()
    await page.waitForSelector('[data-fovea-tour-step-card]', {
      state: 'detached',
      timeout: 5000,
    })
  })
})
