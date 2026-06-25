/**
 * Admin tour end to end.
 *
 * Covers the admin panel: user management, permissions, and model
 * management across its tabs. The worker user carries systemRole
 * 'system_admin' so the admin panel renders. Drives the tour through
 * the engine and asserts every step's anchor resolves and the tour
 * reaches its end.
 */
import { test } from '../../fixtures/test-context.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'

const TOUR_ID = 'admin'

test.describe('Admin tour', () => {
  test('walks every step with each anchor resolving', async ({ page, testUser }) => {
    void testUser

    await page.goto('/app/admin')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })
    await page.waitForSelector('[data-tour-anchor="admin-panel"]', { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
