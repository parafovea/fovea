/**
 * Tour 9 — "Admin" — end-to-end. Walks 7 steps through the /admin
 * panel tabs (user management, permissions, model management, etc.).
 * The worker user is provisioned with systemRole='system_admin' so
 * the admin panel renders.
 */

import { test, expect } from '../../fixtures/test-context.js'

const TOUR_ID = 'admin'

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

test.describe('Tour 9: Admin — end to end', () => {
  test('walks all seven steps across the admin panel tabs', async ({
    page,
    testUser,
  }) => {
    void testUser
    await page.goto('/admin')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, {
      timeout: 10000,
    })
    await page.waitForSelector('[data-tour-id="admin-panel"]', {
      timeout: 10000,
    })

    const ok = await page.evaluate(
      async (id) => Boolean(await window.__foveaTour?.launch(id)),
      TOUR_ID,
    )
    expect(ok).toBe(true)
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
